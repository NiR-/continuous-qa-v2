import docker from './docker';
import { ExtendableError } from '../errors';

export const STATE_ALL = 'ALL';
export const STATE_STOPPED = 'STOPPED';

export const validateState = (state) => [STATE_ALL, STATE_STOPPED].indexOf(state) !== -1;

export class InvalidStateError extends ExtendableError {
  constructor(state) {
    super(`Invalid state "${state}".`);
  }
}

export const get = (driverName) => {
  switch (driverName) {
    case 'docker': return docker;
    default: throw new InvalidDriver(driverName);
  };
};

export class InvalidDriver extends ExtendableError {
  constructor(driverName) {
    super(`Invalid driver "${driverName}".`);
  }
}

export const cleanup = (state = STATE_STOPPED) => {
  return get('docker').cleanup(state);
};
