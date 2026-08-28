import * as v from 'valibot';

const Schema = v.object({ name: v.string() });

export async function loadConfig(Bun: {
  file(path: string): Response;
}): Promise<v.InferOutput<typeof Schema>> {
  const f = Bun.file('config.json');
  const raw: unknown = await f.json();
  return v.parse(Schema, raw);
}
