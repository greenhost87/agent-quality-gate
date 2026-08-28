import * as v from 'valibot';

const TagsSchema = v.record(v.string(), v.string());

export type Tags = v.InferOutput<typeof TagsSchema>;

export function parseTags(text: string): Tags {
  return v.parse(v.pipe(v.string(), v.parseJson(), TagsSchema), text);
}
