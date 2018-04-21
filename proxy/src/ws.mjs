import io from 'socket.io';
import { EVENTS } from './build';
import _ from 'lodash';
import monet from 'monet';

const { Maybe } = monet;

export const createWsServer = (httpServer, emitter) => {
  const server = io(httpServer);

  emitter.on(EVENTS.BUILD_CREATED, _.partial(onBuildCreated, server));
  emitter.on(EVENTS.STEP_STARTED, _.partial(onStepStarted, server));
  emitter.on(EVENTS.STEP_LOGS, _.partial(onStepLogs, server));
  emitter.on(EVENTS.STEP_FINISHED, _.partial(onStepFinished, server));
  emitter.on(EVENTS.BUILD_FINISHED, _.partial(onBuildFinished, server));
}

const onBuildCreated = (server, { build }) => {
  // @TODO: Use a real room, use the build ID rather than the hostname, and add an authentication mechanism
  server
    .of(`/${build.hostname}`)
    .on('connection', (socket) => {
      console.log(`New connection to the websocket established (build: ${build.id}, host: ${build.hostname}).`);
      socket.emit('build', build);
    })
}

const onStepStarted = (server, { build, step }) =>
  nsp(server, build.hostname)
    .map((nsp) => nsp.emit(EVENTS.STEP_STARTED, sanitizeStep(step)))

const onStepLogs = (server, { build, step, logs }) =>
  nsp(server, build.hostname)
    .map((nsp) => nsp.emit(EVENTS.STEP_LOGS, { step: step.id, logs }))

const onStepFinished = (server, { build, step }) =>
  nsp(server, build.hostname)
    .map((nsp) => nsp.emit(EVENTS.STEP_FINISHED, { step: step.id, status: step.status }))

const onBuildFinished = (server, { build }) =>
  nsp(server, build.hostname)
    .map((nsp) => nsp.emit(EVENTS.BUILD_FINISHED, { status: build.status }))
    .map(() => delete server.nsps[build.hostname])

const nsp = (server, namespaceName) => `/${namespaceName}` in server.nsps
  ? Maybe.Some(server.nsps[`/${namespaceName}`])
  : Maybe.None()

const sanitizeBuild = ({ id, hostname, version, project, steps }) => {
  return {
    id,
    hostname,
    version,
    project,
    steps: steps.map(sanitizeStep),
  }
}

const sanitizeStep = ({ id, name, logs, status }) => {
  return {
    id,
    name,
    logs,
    status,
  }
}
