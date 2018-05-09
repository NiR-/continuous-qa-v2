import S from './prelude'
import Future from 'fluture'
import child_process from 'child_process' // eslint-disable-line camelcase
import util from 'util'
import fs from 'fs'
import path from 'path'

export const sanitizeBuild = ({ id, hostname, version, project, steps, status }) => {
  return {
    id,
    hostname,
    version,
    project,
    steps: steps.map(sanitizeStep),
    status,
  }
}

export const sanitizeStep = ({ id, name, logs, status }) => {
  return {
    id,
    name,
    logs,
    status,
  }
}

export const exec = S.curry2((logger, command) =>
  Future((reject, resolve) => {
    const subprocess = child_process.exec(command, (err) => {
      return err
        ? reject(err)
        : resolve();
    });
    subprocess.stdout
      .setEncoding('utf8')
      .on('data', logger);
    subprocess.stderr
      .setEncoding('utf8')
      .on('data', logger);
  })
)

const rmdir = util.promisify(fs.rmdir)
const access = util.promisify(fs.access)
const joinPath = path.join
const readdir = util.promisify(fs.readdir)
const stat = util.promisify(fs.stat)
const unlink = util.promisify(fs.unlink)
const rm = (path) =>
  stat(path)
  .then(stat => stat.isDirectory()
    ? rrmdir(path)
    : unlink(path)
  )
export const rrmdir = async (path) =>
  readdir(path)
  .then(files => Promise.all(
    files
    .map((file) => rm(joinPath(path, file)))
  ))
  .then(() => rmdir(path))

export const preserve = S.curry2((f, a) => S.pipe([
  f,
  S.K(S.I(a))
], a))

export const maybeToFuture = S.curry2((error, maybe) => S.isJust(maybe)
  ? Future.of(S.maybeToNullable(maybe))
  : Future.reject(error)
)
