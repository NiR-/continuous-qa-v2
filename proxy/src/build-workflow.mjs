import { createStep, BUILD_STATUS, STEP_STATUS, EVENTS } from './build';
import store from './datastore';
import * as executors from './executors';
import _ from 'lodash';
import monet from 'monet';

const { Either } = monet;

export const onBuildCreated = async (emitter, runner, { build }) => {
  console.log(`New build created (id: "${build.id}", hostname: "${build.hostname}").`);

  // @TODO: that block of code makes no sense right now
  build.status = BUILD_STATUS.RUNNING;
  build.status = await executeBuild(emitter, runner, build, 0);

  emitter.emit(EVENTS.BUILD_FINISHED, { build });
}

const executeBuild = async (emitter, runner, build, stepId) => {
  if (stepId === build.project.steps.length) {
    return BUILD_STATUS.SUCCEEDED;
  }

  const stepName = build.project.steps[stepId];

  // @TODO: should not throw an error, but use a monad instead
  if (stepName === null) {
    throw new Error(`Step ${stepId} not found in build "${build.id}".`);
  }

  const step = await runner({ stepName, build });

  return step.status === STEP_STATUS.SUCCEEDED
    ? await executeBuild(emitter, runner, build, stepId+1)
    : BUILD_STATUS.FAILED;
}

export const runStep = async (emitter, stepLogger, executors, { stepName, build }) => {
  if (!(stepName in executors)) {
    throw new Error(`Step "${stepName}" not found.`);
  }

  const executor = executors[stepName];
  const step = createStep(stepName);
  build.steps.push(step);

  emitter.emit('build.step_started', { build, step });
  console.log(`Starting step "${step.name}" for build "${build.id}".`);

  try {
    step.out = await executor(_.partial(stepLogger, build, step), build);
    step.status = STEP_STATUS.SUCCEEDED;
  } catch (err) {
    console.log(err);
    step.status = STEP_STATUS.FAILED;
  }

  emitter.emit('build.step_finished', { build, step });

  return step;
}

export const logStep = (emitter, build, step, ...logs) => {
  step.logs.push(...logs);

  console.log(`[${build.id}] [${step.name}]:`, ...logs);
  emitter.emit('build.step_logs', { build, step, logs })
}

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

export const onScheduleTimeout = async (scheduleStore, emitter, build, lastVisitDelay) =>
  (await tearDownStaleBuild(emitter, build, lastVisitDelay))
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
