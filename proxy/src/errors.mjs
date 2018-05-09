import S from 'sanctuary';

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

const hasPattern = (transformers, pattern) => pattern in transformers

const getTransformer = (transformers, pattern) => S.toMaybe(transformers[pattern])

const getTransformerOrDefault = S.curry2((transformers, err) =>
  hasPattern(transformers, err.constructor.name)
  ? getTransformer(transformers, err.constructor.name)
  : getTransformer(transformers, '_')
)

export const transformError = S.curry2((transformers, err) => {
  const transformer = getTransformerOrDefault(transformers, err)

  return transformer(err)
})
