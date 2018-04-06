import Docker from 'dockerode';
import { ExtendableError } from '../errors';
import fs from 'fs';
import { STATE_ALL, STATE_STOPPED, validateState, InvalidStateError } from './index';
import _ from 'lodash';
import os from 'os';
import util from 'util';

const hostname = os.hostname();
const readdir = util.promisify(fs.readdir);

const LABEL_CQA = 'cqa';
const LABEL_STACK_NAME = 'cqa.stack_name';
const LABEL_STACK_VERSION = 'cqa.stack_version';
const LABEL_PROXY_BRIDGE = 'cqa.proxy_bridge';

const buildLabels = (stackName, version) => {
  return {
    [LABEL_CQA]: 'true',
    [LABEL_STACK_NAME]: stackName,
    [LABEL_STACK_VERSION]: version,
  };
};
const stringifyLabel = (val, key) => `${key}=${val}`;
const buildLabelFilters = (labels) => _.map(labels, stringifyLabel);

export class BuildFailed extends ExtendableError {
  constructor(buildName, previous) {
    super(`Build "${buildName}" failed.`, previous);
  }
}

export class StartFailed extends ExtendableError {
  constructor(tag, previous) {
    super(`Start process failed for "${tag}".`, previous);
  }
}

const isStackUp = async (client, stackName, version) =>
  await findContainer(client, stackName, version) !== undefined;

const buildStack = async (client, path, tag) => {
  console.log(`Building docker image for "${tag}" in "${path}".`);

  // @TODO: improve how build context is created
  // @TODO: cache the build context to speed coming builds
  const labels = { [LABEL_CQA]: 'true' };
  const contextEntries = await readdir(path);
  contextEntries.splice(contextEntries.indexOf('.git'), 1);

  // @TODO: manage error responses (e.g. race condition)
  await new Promise((resolve, reject) => {
    client.buildImage({ context: path, src: contextEntries }, { t: tag, labels })
      .then((stream) =>
        stream.pipe(process.stdout) && client.modem.followProgress(stream, resolve)
      ).catch((err) =>
        reject(new BuildFailed(tag, err))
      );
  });
};

const createContainer = (client, tag, labels) => {
  console.log(`Creating container from image "${tag}".`);

  // @TODO: manage error responses (e.g. race condition)
  return client.createContainer({
    Image: tag,
    Labels: labels,
  });
};

const startContainer = (container) => {
  console.log(`Starting container "${container.id}".`);

  // @TODO: manage error responses (e.g. race condition)
  return container.start();
};

const createAndAttachNetwork = (client, labels, container) => {
  const networkName = `proxy_to_${container.id}`;
  console.log(`Creating network "${networkName}".`);

  // @TODO: Manage error responses (e.g. race condition)
  // @TODO: Enable IPv6 / (not really related) one public IPv6 per stack would be awesome!
  return client
    .createNetwork({
      Name: networkName,
      CheckDuplicate: true,
      Driver: 'bridge',
      Internal: true,
      Attachable: true,
      // EnableIPv6: true,
      Labels: {
        [LABEL_PROXY_BRIDGE]: 'true',
        ...labels,
      },
    })
    .then(connectToNetwork.bind(null, container.id))
    .then(connectToNetwork.bind(null, hostname));
};

const connectToNetwork = (container, network) => {
  console.log(`Connecting "${container}" to "${network.id}".`);
  return network.connect({ Container: container });
};

const startStack = (client, stackName, version, path) => {
  const tag = `${stackName}:${version}`;
  const labels = buildLabels(stackName, version);

  return buildStack(client, path, tag)
    // use client.run() instead of create + start
    .then(createContainer.bind(null, client, tag, labels))
    .then(startContainer)
    .then(createAndAttachNetwork.bind(null, client, labels))
    .catch((err) => {
      console.error(err);
      return Promise.reject(new StartFailed(tag, err));
    });
};

const getStackIpAddress = async (client, stackName, version) => {
  console.log(`Fetching ip address of "${stackName}", version "${version}"...`);

  const container = await findContainer(client, stackName, version);
  if (container === undefined) {
    throw new ContainerNotFound(stackName, version);
  }

  const bridgeNetwork = await findBridgeInContainerSettings(client, container);
  if (bridgeNetwork === undefined) {
    throw new ProxyBrdigeNotFound(container.id, Object.keys(container.NetworkSettings.Networks));
  }

  return bridgeNetwork.IPAddress;
};

// @TODO: put the result of this function into a cache for some seconds
const findContainer = async (client, stackName, version) => {
  const labels = buildLabels(stackName, version);

  const containers = await client.listContainers({
    filters: {
      status: ['created', 'restarting', 'running'],
      label: buildLabelFilters(labels),
    },
  });

  return containers.length > 0
    ? containers.pop()
    : undefined
  ;
};

const findBridgeInContainerSettings = async (client, container) => {
  const networks = await Promise.all(_.map(container.NetworkSettings.Networks,
    async (network) => {
      return {
        Labels: await getNetworkLabels(client, network.NetworkID),
        ...network,
      };
    }));

  return _.find(networks,
    (network) => Object.keys(network.Labels).indexOf(LABEL_PROXY_BRIDGE) !== -1
  );
};

// @TODO: Should use some sort of cache
// memoize might not work properly because it returns a Promise,
// and we don't want to cache a Promise but instead the resolved value
const getNetworkLabels = async (client, networkId) => {
  console.log(`Fetching labels of network "${networkId}"...`);
  const network = client.getNetwork(networkId);
  const inspect = await network.inspect();

  return inspect.Labels;
};

class ContainerNotFound extends ExtendableError {
  constructor(stackName, version) {
    super(`Unable to find container for stack "${stackName}", version "${version}".`);
  }
}

class ProxyBrdigeNotFound extends ExtendableError {
  constructor(containerId, networks) {
    super(`Unable to find the bridge shared with the proxy for "${containerId}" (networks: ${networks.join(', ')}).`);
  }
}

const stateToStatusFilter = (state) => {
  switch (state) {
    case STATE_ALL: return ['created', 'restarting', 'running', 'removing', 'paused', 'exited', 'dead'];
    case STATE_STOPPED: return ['created', 'removing', 'exited', 'dead'];
    default: throw new InvalidStateError(state);
  }
};

const cleanup = async (client, state = STATE_STOPPED) => {
  if (!validateState(state)) {
    throw new InvalidState(state);
  }

  await cleanupContainers(client, state);
  await cleanupNetworks(client, state);
  await cleanupImages(client, state);
};

const cleanupContainers = async (client, state) => {
  console.log('Cleaning up containers...');
  // listContainers() returns an array of POJO but not Network instances...
  const containers = await client.listContainers({
    filters: {
      label: [LABEL_CQA],
      status: stateToStatusFilter(state),
    },
  });

  return Promise.all(containers
    // thus we've to instantiate them first,
    .map((container) => client.getContainer(container.Id))
    // before delete.
    .map(removeContainer)
  );
};

const removeContainer = (container) => {
  console.log(`Removing container "${container.id}"...`);
  return container.remove({ force: true, v: true });
};

const cleanupNetworks = async (client, state) => {
  console.log('Cleaning up networks...');
  // listNetworks() returns an array of POJO but not Network instances...
  const networks = await client.listNetworks({
    filters: { label: [LABEL_CQA] },
  });

  return Promise.all(networks
    // thus we've to instantiate them first,
    .map((network) => client.getNetwork(network.Id))
    // before delete.
    .map(removeNetwork.bind(null, client, state))
  );
};

const removeNetwork = async (client, state, network) => {
  const details = await network.inspect();

  // Containers are disconnected from networks when they're removed,
  // hence networks with more than one container connected are under use
  // (1st container is the proxy, 2nd is the other one)
  if (state === STATE_STOPPED && Object.keys(details.Containers).length > 1) {
    return;
  }

  // Disconnect remaining container (proxy)
  const connected = Object.keys(details.Containers);
  if (connected.length > 0) {
    await disconnectContainer(network, connected.pop());
  }

  console.log(`Removing network "${network.id}"...`);
  return network.remove();
};

const disconnectContainer = (network, containerId) => {
  console.log(`Disconnecting container "${containerId}" from "${network.id}"...`);
  return network.disconnect({ Container: containerId });
};

const cleanupImages = async (client, state) => {
  console.log('Cleaning up images...');
  // listImages() returns an array of POJO but not Network instances...
  const images = await client.listImages({
    filters: { label: [LABEL_CQA] },
  });

  return Promise.all(images
    // thus we've to instantiate them first,
    .map((image) => client.getImage(image.Id))
    // before delete.
    .map(_.partialRight(removeImage, state === STATE_ALL))
  );
};

const removeImage = (image, force) => {
  console.log(`Removing image "${image.name}"...`);
  return image.remove({ force });
};

const createDriver = () => {
  const socketPath = process.env.DOCKER_SOCK || '/var/run/docker.sock';
  const client = new Docker({ socketPath });

  return {
    isStackUp: isStackUp.bind(null, client),
    buildStack: buildStack.bind(null, client),
    startStack: startStack.bind(null, client),
    getStackIpAddress: getStackIpAddress.bind(null, client),
    cleanup: cleanup.bind(null, client),
  };
};

const driver = createDriver();
export default driver;
