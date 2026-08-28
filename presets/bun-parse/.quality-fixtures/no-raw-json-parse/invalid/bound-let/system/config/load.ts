import * as v from 'valibot';

const Schema = v.object({ name: v.string() });

export async function loadConfig(path: string): Promise<v.InferOutput<typeof Schema>> {
  let f = Bun.file(path);
  const raw: unknown = await f.json();
  return v.parse(Schema, raw);
}
