import * as v from 'valibot';

const ErrorBodySchema = v.object({
  error: v.optional(v.string()),
});

export function parseJsonText<const TSchema extends v.GenericSchema>(
  text: string,
  schema: TSchema,
): v.InferOutput<TSchema> {
  return v.parse(v.pipe(v.string(), v.parseJson(), schema), text);
}

export function parseJsonValue(text: string): string | number | boolean | null | object {
  if (text.length === 0) return null;
  const raw: unknown = v.parse(v.pipe(v.string(), v.parseJson()), text);
  return v.parse(
    v.union([
      v.string(),
      v.number(),
      v.boolean(),
      v.null(),
      v.array(v.unknown()),
      v.record(v.string(), v.unknown()),
    ]),
    raw,
  );
}

export async function failedResponseMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (text.length === 0) return fallback;
  try {
    const body = parseJsonText(text, ErrorBodySchema);
    if (typeof body.error === 'string') return body.error;
  } catch {
    return text;
  }
  return text;
}
