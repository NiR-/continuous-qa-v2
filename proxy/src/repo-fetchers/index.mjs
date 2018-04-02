import * as git from './git';
import { ExtendableError } from '../errors';

export const get = (fetcherName) => {
  switch (fetcherName) {
    case 'git': return git;
    default: throw new InvalidRepoFetcher(fetcherName);
  }
};

export class InvalidRepoFetcher extends ExtendableError {
  constructor(fetcherName) {
    super(`Invalid repo fetcher "${fetcherName}".`);
  }
}
