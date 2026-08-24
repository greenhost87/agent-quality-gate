import * as v from 'valibot';

const StringArraySchema = v.array(v.string());

export function parseTags(value: unknown): string[] {
  return v.parse(StringArraySchema, value);
}
