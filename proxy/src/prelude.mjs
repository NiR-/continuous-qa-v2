import S from 'sanctuary';
import F from 'fluture-sanctuary-types';

export default S.create({
  checkTypes: true,
  env: S.env.concat(F.env),
});

// Does nothing really useful, just adds meaning to values
Number.seconds = (val) => val * 1000
Number.minutes = (val) => val * Number.seconds(60)
