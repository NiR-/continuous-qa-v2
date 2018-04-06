import { ProjectNotFound } from './api';
import api from './api';
import * as drivers from './drivers';
import { ExtendableError, createErrorTransformer } from './errors';
import EventEmitter from 'events';
import fs from 'fs';
import http from 'http';
import httpProxy from 'http-proxy';
import io from 'socket.io';
import _ from 'lodash';
import * as repoFetchers from './repo-fetchers';

const waitPage = fs.readFileSync('./views/wait-page.html');

const handleRequest = async (proxy, emitter, req, res) => {
  console.log(`New request received (host: ${req.headers.host}, method: ${req.method}, url: ${req.url}, remote: ${req.socket.remoteAddress}).`);

  if (['127.0.0.1', '::ffff:127.0.0.1'].indexOf(req.socket.remoteAddress) !== -1) {
    console.error('Request from local IP address detected and dropped (this could cause infinite loop).');
    res.writeHead(400);
    res.end();
    return;
  }
  // @TODO: Expose prometheus metrics on /metrics (and with no host)
  if (!req.headers.host) {
    res.writeHead(400);
    res.end('Missing Host header.');
    return;
  }

  const { projectName, stackName, version } = splitHostname(req.headers.host);
  const projectDetails = await api.fetchProjectDetails(projectName);
  const driver = drivers.get(projectDetails.driver);

  if (await driver.isStackUp(stackName, version)) {
    const stackIp = await driver.getStackIpAddress(stackName, version);
    return proxy.web(req, res, { target: `http://${stackIp}` });
  }

  res.writeHead(201);
  res.end(waitPage);
};

const handleRequestError = (req, res, err) => {
  const httpError = transformToHttpErrors(err);

  if (!(httpError instanceof HttpClientError)) {
    console.error(err);
  }

  res.writeHead(httpError instanceof HttpError ? httpError.statusCode : 500);
  res.end(httpError instanceof HttpError ? httpError.message : '');
};

const transformToHttpErrors = createErrorTransformer({
  InvalidHostname: () => new HttpClientError(400, 'Invalid hostname format.'),
  ProjectNotFound: () => new HttpClientError(404, 'Project not found.'),
  _: (err) => new HttpServerError(500, err),
});

const onWsConnection = async (socket) => {
  const host = socket.handshake.headers.host;
  console.log(`New connection to the websocket (host: ${host}).`);

  const { projectName, stackName, version } = splitHostname(host);
  const projectDetails = await api.fetchProjectDetails(projectName);
  const driver = drivers.get(projectDetails.driver);

  if (await driver.isStackUp(stackName, version)) {
    return socket.emit('build.finished');
  }

  socket.emit('build.new_step', 'clone');
  /*const repoFetcher = repoFetchers.get(projectDetails.repoType);
  const path = await repoFetcher.cloneRepo(projectDetails, version);

  socket.emit('build.new_step', 'start stack');
  await driver.startStack(stackName, version, path);

  socket.emit('build.finished');*/
};

// @TODO: use a LRU cache and limit the number of hostname cached
// or server would be vulnerable to memory exhaution attacks
const splitHostname = _.memoize((hostname) => {
  const splits = hostname.split(/^([^\.]*)\.([^\.]*)\.([^\.]*)\.cqa$/);

  if (splits.length === 1) {
    throw new InvalidHostname(hostname);
  }

  // Period characters can appear in user/project names but would introduce a new level to the FQDN,
  // and trailing hyphen is forbidden by DNS-related RFCs, thus they're respectively replaced by: "__" and "-hyphen".
  const user = splits[3].replace('__', '.').replace(/\-hyphen$/, '-');
  const project = splits[2].replace('__', '.').replace(/\-hyphen$/, '-');

  return {
    projectName: `${user}/${project}`,
    stackName: `${user.replace(/\-$/, '')}/${project.replace(/\-$/, '')}`,
    version: splits[1],
  };
});

class InvalidHostname extends ExtendableError {
  constructor(hostname) {
    super(`Invalid hostname "${hostname}".`);
  }
}

class HttpError extends ExtendableError {
  constructor(statusCode, message = '') {
    super(message);

    this.statusCode = statusCode;
  }
}

class HttpClientError extends HttpError {
  constructor(statusCode = 400, message = '') {
    super(statusCode, message);
  }
}

class HttpServerError extends HttpError {
  constructor(statusCode = 500, previous = null) {
    super(statusCode, previous.stack);
    this.previous = previous;
  }
}

const catchPromiseEmitter = (emitter, catcher) => {
  return (...args) => {
    return emitter(...args)
      .catch(catcher.bind(null, ...args));
  };
};

const createServer = () => {
  const proxy = httpProxy.createProxyServer({ xfw: true });
  const emitter = new EventEmitter();
  const server = http.createServer(catchPromiseEmitter(
    handleRequest.bind(null, proxy, emitter),
    handleRequestError
  ));

  const wsServer = io(server);
  wsServer.on('connection', onWsConnection);

  emitter.on('new_build', () => {

  });

  return server;
};

export const server = createServer();
