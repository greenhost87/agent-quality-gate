import * as v from 'valibot';

const ExampleSchema = v.object({ name: v.string() });

export function parseExample(text: string): v.InferOutput<typeof ExampleSchema> {
  const raw: unknown = v.parse(v.pipe(v.string(), v.parseJson()), text);
  return v.parse(ExampleSchema, raw);
}
