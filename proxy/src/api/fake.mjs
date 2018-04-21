import { ProjectNotFound } from './index';

export const fetchProjectDetails = async (projectName) => {
  return new Promise((resolve, reject) => {
    if (projectName == 'not/found') {
      return reject(new ProjectNotFound(projectName));
    }

    resolve({
      name: projectName,
      driver: 'docker',
      repoUrl: `https://github.com/${projectName}`,
      steps: ['git.clone', 'docker.build', 'docker.start'],
    });
  });
};
