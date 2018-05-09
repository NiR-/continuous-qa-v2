import S from './prelude'
import uuid from 'uuid/v4'
import immutable from 'immutable'

const Record = immutable.Record

const propEq = S.curry3((prop, expected, obj) =>
  S.equals(S.prop(prop, obj), expected)
);

export const BUILD_STATUS = {
  CREATED: 'created',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  STOPPED: 'stopped',
}

export const STEP_STATUS = {
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
}

const Build = Record({
  id: '',
  hostname: '',
  project: {},
  version: '',
  steps: [],
  status: BUILD_STATUS.CREATED,
}, 'Build')

/**
 * @param {string} hostname
 * @param {Project} project
 * @param {string} version
 * @returns {Build}
 */
export const createBuild = (hostname, project, version) => new Build({
  id: uuid(),
  hostname,
  project,
  version,
})

/**
 * @param {string} newState
 * @param {Build}  build
 * @returns {Build}
 */
export const updateBuildStatus = S.curry2((newState, build) => build.set('status', newState));

const Step = Record({
  id: '',
  name: '',
  logs: [],
  out: {},
  status: STEP_STATUS.RUNNING,
}, 'Step')

/**
 * @param {string} stepName
 * @returns {Step}
 */
export const createStep = (stepName) => new Step({
  id: uuid(),
  name: stepName,
})

export const updateStepStatus = (newStatus, step) => step.set('status', newStatus)

export const addStepToBuild = (build, step) => build.update('steps', (steps) => steps.push(step))

/**
 * @param {Build}    build
 * @param {function} predicate
 * @returns {Maybe<Step>}
 */
const findStep = (build, predicate) => S.toMaybe(build.steps.find(predicate))

/**
 * @param {Build}  build
 * @param {string} expected Name of the expected step
 * @returns {Maybe<Step>}
 */
export const findPlayedStep = (build, expected) => findStep(build, propEq('name', expected))

/**
 * @param {Build} build
 * @returns {Maybe<Step>}
 */
const findFailedStep = (build) => findStep(build, propEq('status', STEP_STATUS.FAILED))

/**
 * @param {Build} build
 * @returns {bool}
 */
export const hasFailedStep = (build) => S.isJust(findFailedStep(build))

export const EVENTS = {
  BUILD_CREATED: 'build.created',
  STEP_STARTED: 'build.step_started',
  STEP_LOGS: 'build.step_logs',
  STEP_FINISHED: 'build.step_finished',
  BUILD_FINISHED: 'build.finished',
}
