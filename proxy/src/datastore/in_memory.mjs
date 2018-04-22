import findLast from 'lodash/findLast';

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
