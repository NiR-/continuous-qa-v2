import Docker from 'dockerode';
import { ExtendableError } from '../errors';
import fs from 'fs';
import { STATE_ALL, STATE_STOPPED, validateState, InvalidStateError } from './index';
import _ from 'lodash';
import os from 'os';
import util from 'util';
import { findPlayedStep } from '../build';
import b from 'buffer';

const hostname = os.hostname();
const readdir = util.promisify(fs.readdir);

const LABEL_CQA = 'cqa';
const LABEL_STACK_NAME = 'cqa.stack_name';
const LABEL_STACK_VERSION = 'cqa.stack_version';
const LABEL_PROXY_BRIDGE = 'cqa.proxy_bridge';

const buildLabels = (projectName, version) => {
  return {
    [LABEL_CQA]: 'true',
    [LABEL_STACK_NAME]: projectName,
    [LABEL_STACK_VERSION]: version,
  };
};
const stringifyLabel = (val, key) => `${key}=${val}`;
const buildLabelFilters = (labels) => _.map(labels, stringifyLabel);
const normalizeImageTag = (tag) => tag.replace(/\-\//, '/').replace(/\-$/, '');
const imageTag = (build) => normalizeImageTag(`${build.project.name}:${build.version}`);

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

class ContainerNotFound extends ExtendableError {
  constructor(projectName, version) {
    super(`Unable to find container for stack "${projectName}", version "${version}".`);
  }
}

class ProxyBrdigeNotFound extends ExtendableError {
  constructor(containerId, networks) {
    super(`Unable to find the bridge shared with the proxy for "${containerId}" (networks: ${networks.join(', ')}).`);
  }
}

const buildStack = async (client, logStep, build) => {
  const cloneStep = findPlayedStep(build, 'git.clone');

  if (!cloneStep) {
    new Error(`Step "git.clone" has to be played first.`)
  }

  // @TODO: improve how build context is created
  // @TODO: cache the build context to speed up next builds
  const path = cloneStep.out.path;
  const tag = imageTag(build);
  const labels = { [LABEL_CQA]: 'true' };
  const buildContext = await readdir(path);
  buildContext.splice(buildContext.indexOf('.git'), 1);

  // @TODO: improve error management (e.g. race condition)
  return new Promise((resolve, reject) =>
    client.buildImage({
      context: path,
      src: buildContext
    }, {
      t: tag,
      version: build.version,
      labels: labels
    }).then((stream) => stream
          .setEncoding('utf8')
          .on('data', (data) => {
            const decoded = JSON.parse(data instanceof b.Buffer
              ? data.toString('utf8')
              : data
            );
            const { stream, errorDetail } = decoded;

            if (errorDetail) {
              logStep(errorDetail.message);
              return reject(new BuildFailed(tag, errorDetail.message));
            }

            return stream ? logStep(stream) : null;
          })
          .on('end', resolve)
          .on('error', reject)
      ).catch((err) => console.log('docker err', err) || reject(new BuildFailed(tag, err)))
    );
}

const startStack = async (client, logStep, build) => {
  const buildStep = findPlayedStep(build, 'docker.build')

  if (!buildStep) {
    new Error(`Step "git.clone" has to be played first.`);
  }

  const tag = imageTag(build);
  const labels = buildLabels(build.project.name, build.version);

    // @TODO: use client.run() instead of create + start
  await createContainer(client, logStep, { name: `cqa.${build.id}`, tag, labels })
    .then(_.partial(startContainer, logStep))
    .then(_.partial(createAndAttachNetwork, client, logStep, labels))
    .catch((err) => Promise.reject(new StartFailed(tag, err)));
}

const createContainer = (client, logStep, { name, tag, labels }) => {
  logStep(`Creating container "${name}" from image "${tag}".\n`);

  // @TODO: manage error responses (e.g. race condition)
  return client.createContainer({
    name,
    Image: tag,
    Labels: labels,
  });
};

const startContainer = (logStep, container) => {
  logStep(`Starting container "${container.id}".\n`);

  // @TODO: manage error responses (e.g. race condition)
  return container.start();
};

const createAndAttachNetwork = (client, logStep, labels, container) => {
  const networkName = `proxy_to_${container.id}`;
  logStep(`Creating network "${networkName}".\n`);

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
    .then(_.partial(connectToNetwork, logStep, container.id))
    .then(_.partial(connectToNetwork, logStep, hostname));
};

const connectToNetwork = (logStep, cid, network) => {
  logStep(`Connecting "${cid}" to "${network.id}".\n`);
  return network.connect({ Container: cid });
};

const isStackUp = async (client, projectName, version) =>
  await findContainer(client, projectName, version) !== undefined;

// @TODO: put the result of this function into a cache for some seconds
const findContainer = async (client, projectName, version) => {
  const labels = buildLabels(projectName, version);

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

const getStackIpAddress = async (client, projectName, version) => {
  console.log(`Fetching ip address of "${projectName}", version "${version}"...`);

  const container = await findContainer(client, projectName, version);
  if (container === undefined) {
    throw new ContainerNotFound(projectName, version);
  }

  const bridgeNetwork = await findBridgeInContainerSettings(client, container);
  if (bridgeNetwork === undefined) {
    throw new ProxyBrdigeNotFound(container.id, Object.keys(container.NetworkSettings.Networks));
  }

  return bridgeNetwork.IPAddress;
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
    (network) => network.Labels
      ? Object.keys(network.Labels).indexOf(LABEL_PROXY_BRIDGE) !== -1
      : false
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

const stateToStatusFilter = (state) => {
  switch (state) {
    case STATE_ALL: return ['created', 'restarting', 'running', 'removing', 'paused', 'exited', 'dead'];
    case STATE_STOPPED: return ['created', 'removing', 'exited', 'dead'];
    default: throw new InvalidStateError(state);
  }
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
  // listImages() returns an array of POJO but not Image instances...
  const images = await client.listImages({
    filters: { label: [LABEL_CQA] },
  });

  await Promise.all(images
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
    isStackUp: _.partial(isStackUp, client),
    buildStack: _.partial(buildStack, client),
    startStack: _.partial(startStack, client),
    getStackIpAddress: _.partial(getStackIpAddress, client),
    cleanup: async (state = STATE_STOPPED) => {
      if (!validateState(state)) {
        throw new InvalidState(state);
      }

      await cleanupContainers(client, state);
      await cleanupNetworks(client, state);
      await cleanupImages(client, state);
    },
  };
};

export const driver = createDriver();
export const cleanup = driver.cleanup;
export const steps = {
  'docker.build': driver.buildStack,
  'docker.start': driver.startStack,
};
