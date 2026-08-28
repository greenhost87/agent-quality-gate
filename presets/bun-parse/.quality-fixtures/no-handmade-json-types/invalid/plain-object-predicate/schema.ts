import * as v from 'valibot';

const PlainObjectSchema = v.record(v.string(), v.unknown());

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return v.safeParse(PlainObjectSchema, value).success;
}
