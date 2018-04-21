export class ExtendableError extends Error {
  constructor(message = '', previous = null) {
    super(message);

    this.previous = previous;

    Object.defineProperty(this, 'name', {
      configurable: true,
      enumerable: false,
      value: this.constructor.name,
      writable: true,
    });

    Error.captureStackTrace(this, this.constructor);
  }
}

export const createErrorTransformer = (transformers) => {
  if (!('_' in transformers)) {
    throw new Error('Default pattern "_" not bound, please define it.');
  }

  return (err) => {
    const transformer = err.constructor.name in transformers
      ? transformers[err.constructor.name]
      : transformers['_'];

    return transformer(err);
  };
};
