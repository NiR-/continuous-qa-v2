import * as docker from './docker';
import * as git from './git';
import { ExtendableError } from '../errors';

export const STATE_ALL = 'ALL';
export const STATE_STOPPED = 'STOPPED';

export const validateState = (state) => [STATE_ALL, STATE_STOPPED].indexOf(state) !== -1;

export class InvalidStateError extends ExtendableError {
  constructor(state) {
    super(`Invalid state "${state}".`);
  }
}

export class InvalidDriver extends ExtendableError {
  constructor(driverName) {
    super(`Invalid driver "${driverName}".`);
  }
}

export const cleanup = async (state = STATE_STOPPED) => {
  await driver('docker').cleanup(state);
  await git.cleanup();
};

export const driver = (driverName) => {
  switch (driverName) {
    case 'docker': return docker.driver;
    default: throw new InvalidDriver(driverName);
  };
};

export const steps = {
  ...git.steps,
  ...docker.steps,
};
