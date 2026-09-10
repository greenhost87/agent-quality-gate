import * as v from 'valibot';

export const FallowLineSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
export const FallowSourceLocationSchema = v.object({
  file: v.string(),
  line: FallowLineSchema,
});
