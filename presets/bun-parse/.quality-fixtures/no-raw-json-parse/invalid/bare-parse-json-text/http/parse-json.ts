import * as v from /* fast-path regression */ 'valibot';

export function parseJsonValue(text: string): unknown {
  if (text.length === 0) return null;
  return v.parse(v.pipe(v.string(), v.parseJson()), text);
}
