import type { Options } from '@oxlint/plugins';
import * as v from 'valibot';

export function createMaxOptionReader(defaultMax: number, minimum: number) {
  const schema = v.object({
    max: v.optional(v.pipe(v.number(), v.integer(), v.minValue(minimum)), defaultMax),
  });
  return (options: Readonly<Options>): number => {
    const parsed = v.safeParse(schema, options[0] ?? {});
    return parsed.success ? parsed.output.max : defaultMax;
  };
}
