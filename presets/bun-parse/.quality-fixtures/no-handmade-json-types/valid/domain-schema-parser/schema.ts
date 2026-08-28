import * as v from 'valibot';

const ExampleSchema = v.object({
  name: v.string(),
  enabled: v.optional(v.boolean(), false),
});

export type Example = v.InferOutput<typeof ExampleSchema>;

export function parseExample(text: string): v.InferOutput<typeof ExampleSchema> {
  return v.parse(v.pipe(v.string(), v.parseJson(), ExampleSchema), text);
}

export function parseOptionalName(text: string): string | null {
  if (text.length === 0) return null;
  return v.parse(v.pipe(v.string(), v.parseJson(), v.string()), text);
}
