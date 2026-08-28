import * as v from 'valibot';

export function parseJsonBody<T>(
  text: string,
  schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>,
): T {
  const raw: unknown = text.length === 0 ? {} : JSON.parse(text);
  return v.parse(schema, raw);
}
