import * as v from 'valibot';

const ExampleSchema = v.object({
  name: v.string(),
  enabled: v.optional(v.boolean(), false),
});

export type Example = v.InferOutput<typeof ExampleSchema>;

export async function readExample(path: string): Promise<Example> {
  const raw: unknown = await Bun.file(path).json();
  const result = v.safeParse(ExampleSchema, raw);
  if (!result.success) {
    throw new Error(`${path}: ${result.issues[0].message}`);
  }
  return result.output;
}
