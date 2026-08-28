import { file as bunFile } from 'bun';
import * as v from 'valibot';

const Schema = v.object({ name: v.string() });

export async function loadConfig(path: string): Promise<v.InferOutput<typeof Schema>> {
  const raw: unknown = await bunFile(path).json();
  return v.parse(Schema, raw);
}
