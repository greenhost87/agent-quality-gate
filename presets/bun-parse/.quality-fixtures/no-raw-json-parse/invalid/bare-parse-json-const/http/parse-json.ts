import * as v from 'valibot';

const JsonTextSchema = v.pipe(v.string(), v.parseJson());

export function parseJsonValue(text: string): unknown {
  if (text.length === 0) return null;
  return v.parse(JsonTextSchema, text);
}
