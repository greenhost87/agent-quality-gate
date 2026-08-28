import * as v from 'valibot';

const Schema = v.object({ name: v.string() });

export async function loadConfig(path: string, n: number): Promise<v.InferOutput<typeof Schema>> {
  switch (n) {
    case 1:
      const f = Bun.file(path);
      const raw: unknown = await f.json();
      return v.parse(Schema, raw);
    default:
      return v.parse(Schema, { name: 'x' });
  }
}
