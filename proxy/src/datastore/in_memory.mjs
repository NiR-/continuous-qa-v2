import findLast from 'lodash/findLast';
import monet from 'monet';

const { Maybe } = monet;
const store = {};

const getLastBuild = (projectName, version) => {
  const collection = store[projectName][version];
  return findLast(collection);
}

export const findLastBuild = (projectName, version) =>
  projectName in store && version in store[projectName]
    ? getLastBuild(projectName, version)
    : null

export const storeBuild = (build) => {
  const { project, version, id } = build;

  if (!(project.name in store)) {
    store[project.name] = {};
  }
  if (!(version in store[project.name])) {
    store[project.name][version] = {};
  }

  store[project.name][version][id] = build;
}

const accessTimes = {};

export const storeLastAccessTime = (build, time) => {
  accessTimes[build.id] = time;
}

export const getLastAccessTime = (build) => new Promise((resolve, reject) => {
  return resolve(build.id in accessTimes
    ? Maybe.Some(accessTimes[build.id])
    : Maybe.None());
});
