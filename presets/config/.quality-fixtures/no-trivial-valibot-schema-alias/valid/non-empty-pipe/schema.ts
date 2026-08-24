import * as v from 'valibot';

export const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1));
