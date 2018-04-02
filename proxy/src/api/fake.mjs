import { ProjectNotFound } from './index';

export const fetchProjectDetails = async (projectName) => {
  return new Promise((resolve, reject) => {
    if (projectName == 'not/found') {
      reject(new ProjectNotFound(projectName));
    }

    resolve({
      name: projectName,
      driver: 'docker',
      repoUrl: `https://github.com/${projectName}`,
      repoType: 'git',
    });
  });
};
