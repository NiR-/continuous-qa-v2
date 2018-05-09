import S from '../prelude';
import Future from 'fluture';
import { exec, rrmdir } from '../utils';
import fs from 'fs';
import p from 'path';

const joinPath = p.join

const pathExists = (path) => Future
  .encaseN(fs.access) (path)
  .fold(_ => S.Left(path), _ => S.Right(path))

export const path = S.curry2((basepath, { project, version }) =>
  joinPath(basepath, project.name, version)
)

export const cloneRepo = S.curry3((path, stepLogger, { project, version }) =>
  pathExists(path({ project, version }))
  .chain(
    S.either(
      path => gitCloneAndCheckout(stepLogger, { repoUrl: project.repoUrl, path, version }),
      path => gitCheckout(stepLogger, { path, version })
    )
  )
  .map(_ => ({ path: path({ project, version }) }))
)

const gitClone = S.curry2((stepLogger, { repoUrl, path }) =>
  exec(stepLogger, `git clone ${repoUrl} ${path}`)
)

const gitCheckout = S.curry2((stepLogger, { path, version }) =>
  exec(stepLogger, `cd ${path} && git checkout ${version}`)
)

const gitCloneAndCheckout = S.curry2((stepLogger, data) =>
  gitClone(stepLogger, data)
  .chain(_ => gitCheckout(stepLogger, data))
)

const logCleanup = _ => console.log('Cleaning up git repositories...')

export const cleanup = S.pipe([
  logCleanup,
  rrmdir,
])

export const steps = {
  'git.clone': cloneRepo(path('/tmp/cqa')),
}
