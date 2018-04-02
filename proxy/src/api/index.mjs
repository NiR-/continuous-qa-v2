import { ExtendableError } from '../errors';
import * as fake from './fake';

export default fake;

export class ProjectNotFound extends ExtendableError {
  constructor(projectName) {
    super(`Project "${projectName}" not found.`);
  }
}
