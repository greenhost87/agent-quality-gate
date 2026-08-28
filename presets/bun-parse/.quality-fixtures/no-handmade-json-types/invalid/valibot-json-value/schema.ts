import * as v from 'valibot';

const JsonValueSchema = v.union([
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
  v.array(v.unknown()),
  v.record(v.string(), v.unknown()),
]);

export function parseJsonValue(text: string): v.InferOutput<typeof JsonValueSchema> {
  return v.parse(JsonValueSchema, v.parse(v.pipe(v.string(), v.parseJson()), text));
}
