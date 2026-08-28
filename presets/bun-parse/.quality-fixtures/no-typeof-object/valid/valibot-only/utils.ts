import * as v from 'valibot';

const Schema = v.object({ name: v.string() });

export function parse(raw: unknown): v.InferOutput<typeof Schema> {
  return v.parse(Schema, raw);
}
