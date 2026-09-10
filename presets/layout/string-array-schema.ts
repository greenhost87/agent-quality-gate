import * as v from 'valibot';

export const StringArraySchema = v.pipe(
  v.array(v.unknown()),
  v.transform((items) => items.filter((item): item is string => typeof item === 'string')),
);
