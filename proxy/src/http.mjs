import { default as api, ProjectNotFound } from './api';
import { EVENTS, createBuild } from './build';
import { onBuildCreated, onBuildFinished, runStep, logStep } from './build-workflow';
import { ExtendableError, createErrorTransformer } from './errors';
import EventEmitter from 'events';
import * as executors from './executors';
import fs from 'fs';
import http from 'http';
import httpProxy from 'http-proxy';
import { createWsServer } from './ws';
import _ from 'lodash';

const waitPage = fs.readFileSync('./views/wait-page.html');

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

const transformToHttpErrors = createErrorTransformer({
  InvalidHostname: () => new HttpClientError(400, 'Invalid hostname format.'),
  ProjectNotFound: () => new HttpClientError(404, 'Project not found.'),
  _: (err) => new HttpServerError(500, err),
});

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

  const hostname = req.headers.host;
  const { projectName, version } = splitHostname(hostname);
  const project = await api.fetchProjectDetails(projectName);
  const driver = executors.driver(project.driver);

  // @TODO: race condition here: this isn't sufficient, bc a build can be in progress
  if (await driver.isStackUp(projectName, version)) {
    const stackIp = await driver.getStackIpAddress(projectName, version);
    return proxy.web(req, res, { target: `http://${stackIp}` });
  }

  if (['/robots.txt', '/favicon.ico'].indexOf(req.url) !== -1) {
    res.writeHead(404);
    res.end();
    return;
  }

  // @TODO: use at least an in-memory store to avoid above issue
  emitter.emit('build.created', {
    build: createBuild(hostname, project, version)
  });

  res.writeHead(201);
  res.end(waitPage);
};

const handleRequestError = (req, res, err) => {
  const httpError = transformToHttpErrors(err);

  if (!(httpError instanceof HttpClientError)) {
    console.error(err);
  }

  res.writeHead(httpError.statusCode);
  res.end(httpError.message);
};

// @TODO: use a LRU cache and limit the number of hostname cached
// or server would presumably be vulnerable to memory exhaution attacks
const splitHostname = _.memoize((hostname) => {
  const splits = hostname.split(/^([^\.]*)\.([^\.]*)\.([^\.]*)\.cqa$/);

  if (splits.length === 1) {
    throw new InvalidHostname(hostname);
  }

  // Period characters might appear in user/project names but would introduce a new level to the FQDN,
  // and trailing hyphen is forbidden by DNS-related RFCs, thus they're respectively replaced by: "__" and "-hyphen".
  // @TODO: properly implement DNS RFCs
  const user = splits[3].replace('__', '.').replace(/\-hyphen$/, '-');
  const project = splits[2].replace('__', '.').replace(/\-hyphen$/, '-');

  return {
    projectName: `${user}/${project}`,
    version: splits[1],
  };
});

const bindWorkflowEvents = (emitter) => {
  const stepLogger = _.partial(logStep, emitter);
  const stepRunner = _.partial(runStep, emitter, stepLogger, executors.steps);

  emitter.on(EVENTS.BUILD_CREATED, _.partial(onBuildCreated, emitter,stepRunner));
  emitter.on(EVENTS.BUILD_FINISHED, onBuildFinished);
};

const createServer = () => {
  const proxy = httpProxy.createProxyServer({ xfw: true });
  const emitter = new EventEmitter();
  const server = http.createServer((req, res) =>
    handleRequest(proxy, emitter, req, res)
      .catch(handleRequestError.bind(null, req, res))
  );
  const wsServer = createWsServer(server, emitter);

  bindWorkflowEvents(emitter);

  return server;
};

export const server = createServer();
