import child_process from 'child_process'; // eslint-disable-line camelcase
import util from 'util';
import fs from 'fs';

const exec = (logger, command) => new Promise((resolve, reject) => {
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
const access = util.promisify(fs.access);
const pathExists = (path) =>
  access(path)
    .then(
      () => true,
      () => false)

export const cloneRepo = async (stepLogger, { project, version }) => {
  const path = `/tmp/cqa/${project.name}/${version}`;

  if (!await pathExists(path)) {
    await gitClone(stepLogger, project.repoUrl, path);
  }

  await gitCheckout(stepLogger, path, version);

  return { path };
};

const gitClone = (stepLogger, repoUrl, path) =>
  exec(stepLogger, `git clone ${repoUrl} ${path}`)

const gitCheckout = (stepLogger, path, version) =>
  exec(stepLogger, `cd ${path} && git checkout ${version}`)

const logExec = (stepLogger, { stdout, stderr }) =>
  stepLogger(...[].concat(stdout, stderr))

export const cleanup = () => {
  console.log('Cleaning up git repositories...');
  return exec(console.log, 'rm -rf /tmp/cqa/*');
}

export const steps = {
  'git.clone': cloneRepo,
}
