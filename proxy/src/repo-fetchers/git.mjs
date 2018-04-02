import child_process from 'child_process'; // eslint-disable-line camelcase
import util from 'util';
import fs from 'fs';

const exec = util.promisify(child_process.exec);
const access = util.promisify(fs.access);
const pathExists = async (path) =>
  await access(path)
    .then(() => true)
    .catch(() => false);

export const cloneRepo = async (projectDetails, version) => {
  const path = `/tmp/cqa/${projectDetails.name}/${version}`;

  if (!await pathExists(path)) {
    let { stdout, stderr } = await exec(`git clone ${projectDetails.repoUrl} ${path}`);
    console.log('git clone output:', stdout, stderr);
  }

  let { stdout, stderr } = await exec(`cd ${path} && git checkout ${version}`);
  console.log('git checkout output:', stdout, stderr);

  return path;
};
