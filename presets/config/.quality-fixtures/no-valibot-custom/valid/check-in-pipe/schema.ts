import * as v from 'valibot';

export const NonEmptySchema = v.pipe(
  v.string(),
  v.check((value) => value.length > 0),
);
