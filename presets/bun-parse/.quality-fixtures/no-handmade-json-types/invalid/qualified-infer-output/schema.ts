import * as v from 'valibot';

const PlainObjectSchema = v.record(v.string(), v.unknown());

export function readJsonObject(text: string): v.InferOutput<typeof PlainObjectSchema> | null {
  if (text.length === 0) return null;
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), PlainObjectSchema), text);
  return parsed.success ? parsed.output : null;
}
