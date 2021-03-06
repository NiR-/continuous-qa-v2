import S from './prelude';
import Future from 'fluture';
import { default as api, ProjectNotFound } from './api';
import { EVENTS, createBuild, BUILD_STATUS } from './build';
import * as workflow from './build-workflow';
import { ExtendableError, transformError } from './errors';
import EventEmitter from 'events';
import * as executors from './executors';
import store from './datastore';
import fs from 'fs';
import http from 'http';
import httpProxy from 'http-proxy';
import format from 'string-template';
import { createWsServer } from './ws';
import { sanitizeStep } from './utils';

const waitPage = fs.readFileSync('./views/wait-page.html').toString('utf8')
const renderPage = ({ id, steps, status }) => format(waitPage, {
  buildId: id,
  buildSteps: JSON.stringify(steps.map(sanitizeStep)),
  buildStatus: status,
})

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

const transformToHttpErrors = transformError({
  InvalidHostname: () => new HttpClientError(400, 'Invalid hostname format.'),
  ProjectNotFound: () => new HttpClientError(404, 'Project not found.'),
  _: (err) => new HttpServerError(500, err),
})

const handleRequest = async (proxy, emitter, req, res) => {
  console.log(`New request received (host: ${req.headers.host}, method: ${req.method}, url: ${req.url}, remote: ${req.socket.remoteAddress}).`);

  if (['127.0.0.1', '::ffff:127.0.0.1'].indexOf(req.socket.remoteAddress) !== -1) {
    console.error('Request from local IP address detected and dropped (this could cause infinite loop).');
    res.writeHead(400);
    return res.end();
  }
  // @TODO: Expose prometheus metrics on /metrics (and with no host)
  if (!req.headers.host) {
    res.writeHead(400);
    return res.end('Missing Host header.');
  }

  if (['/robots.txt', '/favicon.ico'].indexOf(req.url) !== -1) {
    res.writeHead(404);
    return res.end();
  }

  const hostname = req.headers.host;
  const { projectName, version } = splitHostname('cqa', hostname);
  const project = await api.fetchProjectDetails(projectName);
  const lastBuild = await store.findLastBuild(projectName, version);

  if (!lastBuild || lastBuild.status === BUILD_STATUS.STOPPED) {
    const build = createBuild(hostname, project, version);
    emitter.emit('build.created', { build });

    const page = renderPage(build);
    res.writeHead(201);
    return res.end(page);
  }

  if (lastBuild.status === BUILD_STATUS.SUCCEEDED) {
    const driver = executors.driver(project.driver);

    if (await driver.isUp(projectName, version)) {
      const stackIp = await driver.getIpAddress(projectName, version);
      proxy.web(req, res, { target: `http://${stackIp}` });
      store.storeLastAccessTime(lastBuild, new Date());
      return;
    }

    lastBuild.status = BUILD_STATUS.STOPPED;
    store.storeBuild(lastBuild);

    res.writeHead(302, { Location: req.url });
    res.end();
    return;
  }

  const page = renderPage(lastBuild);
  res.writeHead(200);
  res.end(page);
};

const handleRequestError = (req, res, err) => {
  const httpError = transformToHttpErrors(err);

  if (!(httpError instanceof HttpClientError)) {
    console.error(err);
  }

  res.writeHead(httpError.statusCode);
  res.end(httpError.message);
};

const replace = S.curry3((pattern, rep, str) => str.replace(pattern, rep))

const dehyphenateSlash = replace(/--slash--/g, '/')
const dehyphenateDot = replace(/--dot(--|$)/g, '.')
const dehyphenateTrailingHyphen = replace(/--hyphen$/, '-')

const normalizeVersion = S.pipe([
  dehyphenateSlash,
  dehyphenateTrailingHyphen,
  dehyphenateDot,
])

const normalizeUser = S.pipe([
  dehyphenateTrailingHyphen,
  dehyphenateDot,
])

const normalizeProject = S.pipe([
  dehyphenateTrailingHyphen,
  dehyphenateDot,
])

// @TODO: use a LRU cache and limit the number of hostname cached
// or server would presumably be vulnerable to memory exhaution attacks
export const splitHostname = (baseDomain, hostname) => {
  const splits = hostname.split(
    new RegExp(`^([^\.]*)\.([^\.]*)\.([^\.]*)\.${baseDomain.replace('.', '\.')}$`));

  if (splits.length === 1) {
    throw new InvalidHostname(hostname);
  }

  // Period characters might appear in user/project names but would introduce a new level to the FQDN,
  // and trailing hyphen is forbidden by DNS-related RFCs, thus they're respectively replaced by: "__" and "-hyphen".
  // @TODO: properly implement DNS RFCs
  const version = normalizeVersion(splits[1]);
  const user = normalizeUser(splits[3]);
  const project = normalizeProject(splits[2]);

  return {
    projectName: `${user}/${project}`,
    version: version,
  };
};

const bindWorkflowEvents = (emitter) => {
  emitter.on(EVENTS.BUILD_CREATED, ({ build }) => store.storeBuild(build));
  emitter.on(EVENTS.STEP_STARTED, ({ build }) => store.storeBuild(build));
  emitter.on(EVENTS.STEP_FINISHED, ({ build }) => store.storeBuild(build));
  emitter.on(EVENTS.BUILD_FINISHED, ({ build }) => store.storeBuild(build));

  const stepLogger = workflow.logStep(emitter);
  const stepRunner = workflow.runStep(emitter, stepLogger, executors.steps);

  emitter.on(EVENTS.BUILD_CREATED, workflow.onBuildCreated(emitter, stepRunner));

  const scheduleStore = {};
  const onScheduleTimeout = workflow.onScheduleTimeout(scheduleStore, emitter);
  const scheduler = workflow.rescheduleTearDown(scheduleStore, onScheduleTimeout);

  emitter.on(EVENTS.BUILD_FINISHED, workflow.onBuildFinished(scheduler));
};

const createServer = () => {
  const proxy = httpProxy.createProxyServer({ xfw: true });
  const emitter = new EventEmitter();
  const server = http.createServer((req, res) =>
    handleRequest(proxy, emitter, req, res)
      .catch(handleRequestError.bind(null, req, res))
  );

  createWsServer(server, emitter);
  bindWorkflowEvents(emitter);

  return server;
};

export const server = createServer();
