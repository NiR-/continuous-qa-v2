import uuid from 'uuid/v4';

export const createBuild = (hostname, project, version) => {
  return {
    id: uuid(),
    hostname,
    project,
    version,
    steps: [],
    status: BUILD_STATUS.CREATED,
  }
}

export const createStep = (stepName) => {
  return {
    id: uuid(),
    name: stepName,
    logs: [],
    out: {},
    status: STEP_STATUS.RUNNING,
  }
}

export const findPlayedStep = (build, expected) =>
  build.steps.find(({ name }) => name === expected);

export const hasFailedStep = (build) =>
  build.steps.find((step) => step.status === STEP_STATUS.FAILED) !== undefined

export const BUILD_STATUS = {
  CREATED: 'created',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
}

export const STEP_STATUS = {
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
}

export const EVENTS = {
  BUILD_CREATED: 'build.created',
  STEP_STARTED: 'build.step_started',
  STEP_LOGS: 'build.step_logs',
  STEP_FINISHED: 'build.step_finished',
  BUILD_FINISHED: 'build.finished',
}
