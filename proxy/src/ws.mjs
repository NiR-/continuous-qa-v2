import io from 'socket.io';
import { EVENTS } from './build';
import _ from 'lodash';
import monet from 'monet';
import { sanitizeBuild, sanitizeStep } from './utils';

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
  // @TODO: Add an authentication mechanism to not leak build details to anyone
  server
    .of(`/${build.id}`)
    .on('connection', onConnection.bind(null, build))
}

const onConnection = (build, socket) => {
  console.log(`New connection to the websocket established (build: ${build.id}, host: ${build.hostname}).`);
  socket.emit('build', sanitizeBuild(build));
}

const onStepStarted = (server, { build, step }) =>
  nsp(server, build)
    .map((nsp) => nsp.emit(EVENTS.STEP_STARTED, sanitizeStep(step)))

const onStepLogs = (server, { build, step, logs }) =>
  nsp(server, build)
    .map((nsp) => nsp.emit(EVENTS.STEP_LOGS, { step: step.id, logs }))

const onStepFinished = (server, { build, step }) =>
  nsp(server, build)
    .map((nsp) => nsp.emit(EVENTS.STEP_FINISHED, { step: step.id, status: step.status }))

const onBuildFinished = (server, { build }) =>
  nsp(server, build)
    .map((nsp) => nsp.emit(EVENTS.BUILD_FINISHED, { status: build.status }))
    .map(() => delete server.nsps[`/${build.id}`])

const nsp = (server, build) => `/${build.id}` in server.nsps
  ? Maybe.Some(server.nsps[`/${build.id}`])
  : Maybe.None()
