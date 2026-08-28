import * as v from 'valibot';

const Schema = v.object({ name: v.string() });

const f = Bun.file('config.json');

export async function loadConfig(): Promise<v.InferOutput<typeof Schema>> {
  const raw: unknown = await f.json();
  return v.parse(Schema, raw);
}
