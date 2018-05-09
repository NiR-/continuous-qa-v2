import S from '../prelude'
import { exec } from '../utils'
import { findPlayedStep } from '../build'

const build = (stepLogger, build) =>
  S.maybeToEither(
    'Step "git.clone" has to be played first.',
    findPlayedStep(build, 'git.clone')
  ).map((cloneStep) =>
    exec(stepLogger, `cd ${cloneStep.out.path} && docker-compose build`)
  )

const start = (stepLogger, build) =>
  S.maybeToEither(
    'Step "git.clone" has to be played first.',
    findPlayedStep(build, 'git.clone')
  ).map((cloneStep) =>
    exec(stepLogger, `cd ${cloneStep.out.path} && docker-compose up -d`)
  )

/* export const driver = {
  isUp,
  stop,
  getIpAddress,
  cleanUp,
} */

export const steps = {
  'compose.build': build,
}
