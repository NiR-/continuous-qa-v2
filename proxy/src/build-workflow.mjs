import S from './prelude';
import Future from 'fluture';
import { preserve, maybeToFuture } from './utils'
import { createStep, updateBuildStatus, BUILD_STATUS, STEP_STATUS, EVENTS } from './build';
import _ from 'lodash';

/**
 * @param {function} logger
 * @param {Build}    build
 */
const logNewBuildCreated = S.curry2((logger, build) =>
  logger(`New build created (id: "${build.id}", hostname: "${build.hostname}").`)
)

/**
 * @param {function} logger
 * @param {function} storeBuid
 * @param {function} executeBuild
 * @param {object}
 * @return {Future}
 */
export const onBuildCreated = S.curry4((logger, storeBuild, executeBuild, { build }) =>
  Future.of(build)
  .map(build => S.K(build, logNewBuildCreated(logger, build)))
  .map(build => updateBuildStatus(BUILD_STATUS.RUNNING, build))
  .map(build => S.K(build, storeBuild(build)))
  .chain(build =>
    executeBuild(build)
    .map(build => updateBuildStatus(BUILD_STATUS.SUCCEEDED, build))
    .map(build => S.K(build, storeBuild(build)))
  )
  /** .bimap(
    build => emitter.emit(EVENTS.BUILD_FINISHED, { build }),
    build => emitter.emit(EVENTS.BUILD_FINISHED, { build }),
  ) */
)

export const executeBuild = S.curry3((storeBuild, runStep, build) =>
  S.reduce(S.curry2((build, stepName) =>
    build.chain(build =>
      Future.of(createStep(stepName))
      .map(step => ({ step, build: addStepToBuild(build, step) }))
      .map(({ build, step }) => S.K({ build, step }, storeBuild(build)))
      .chain(({ build, step }) =>
        runStep({ build, step })
        .bimap(
          err => S.K(err, S.K(
            updateBuildStatus(BUILD_STATUS.FAILED, build),
            storeBuild(build)
          )),
          step => S.K(build, storeBuild(build)),
        )
      )
    )
  ), Future.of(build), build.project.steps)
)

const logStepStarting = S.curry2((build, step) => console.log(`Starting step "${step.name}" for build "${build.id}".`))

/**
 * @param {function}     stepLogger
 * @param {function}     findExecutor
 * @param {object}
 * @return {Future<Build>}
 */
export const runStep = S.curry3((stepLogger, findExecutor, { build, step }) =>
  maybeToFuture(
    new Error(`No executor found for step "${step.name}".`),
    findExecutor(step.name)
  )
  .map(executor => S.K(executor, logStepStarting(build, step)))
  // .map(executor => S.K(executor, emitter.emit('build.step_started', { build, step })))
  .map(executor => executor(stepLogger, build, step))
  .map(output => updateStepOutput(step, output))
  .map(step => updateStepStatus(step, STEP_STATUS.SUCEEDED))
  .mapRej(err => S.K(err, console.error(err)))
  .mapRej(err => S.K(err, updateStepStatus(step, STEP_STATUS.FAILED)))
  // .map(step => S.K(step, emitter.emit('build.step_finished', { build, step })))
)

export const logStep = S.curry3((build, step, log) => {
  step.logs.push(log);

  console.log(`[${build.id}] [${step.name}]:`, log);
  // emitter.emit('build.step_logs', { build, step, log })
})

export const onBuildFinished = (tearDownScheduler, { build }) => {
  console.log(`Build finished (id: "${build.id}", hostname: "${build.hostname}").`)

  if (build.status === BUILD_STATUS.SUCCEEDED) {
    tearDownScheduler(build, Number.minutes(5));
  }
}

export const rescheduleTearDown = (scheduleStore, onTimeout, build, delayNext) => {
  console.log(`Reschedule tear down for build "${build.id}" in ${delayNext}ms.`)

  scheduleStore[build.id] = setTimeout(onTimeout, delayNext);
}

export const onScheduleTimeout = (store, scheduleStore, emitter, build, lastVisitDelay) =>
  store
    .getLastAccessTime(build)
    .then((lastAccess) => new Date() - lastAccess.orSome(0))
    .then(async (delta) => delta < lastVisitDelay
      ? S.Left(lastVisitDelay - delta)
      : S.Right(await tearDown(emitter, build))
    )
    .cata(
      (delta) => rescheduleTearDown(scheduleStore, build, lastVisitDelay, delta),
      () =>  null
    )

const tearDownStaleBuild = (emitter, build, lastVisitDelay) => store
  .getLastAccessTime(build)
  .then((lastAccess) => new Date() - lastAccess.orSome(0))
  .then(async (delta) => delta < lastVisitDelay
    ? Either.Left(lastVisitDelay - delta)
    : Either.Right(await tearDown(emitter, build))
  )

const tearDown = (emitter, build) => executors
  .driver(build.project.driver)
  .stop(build)
  .then(() => build.status = BUILD_STATUS.STOPPED)
  .then((build) => emitter.emit(EVENTS.BUILD_FINISHED, { build }))
  .then(() => console.log(`Build "${build.id}" has been teared down.`))
