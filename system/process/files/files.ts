import { existsSync } from 'node:fs';
import * as v from 'valibot';

/** True for files and directories. `Bun.file().exists()` is false for directories. */
export async function pathExists(path: string): Promise<boolean> {
  return await Promise.resolve(existsSync(path));
}

export async function readTextFile(path: string): Promise<string> {
  return globalThis.Bun.file(path).text();
}

export async function readJsonFile<const TSchema extends v.GenericSchema>(
  path: string,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  return v.parse(v.pipe(v.string(), v.parseJson(), schema), await globalThis.Bun.file(path).text());
}

export async function writeTextFile(path: string, contents: string): Promise<number> {
  return writeBytesFile(path, new TextEncoder().encode(contents));
}

export async function writeBytesFile(path: string, contents: Uint8Array): Promise<number> {
  return globalThis.Bun.write(path, contents);
}

export async function writeJsonFile(path: string, value: object): Promise<number> {
  return writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Write only when contents differ. Returns whether a write happened. */
export async function writeTextIfChanged(path: string, contents: string): Promise<boolean> {
  const target = globalThis.Bun.file(path);
  if (await target.exists()) {
    if ((await target.text()) === contents) {
      return false;
    }
  }
  await globalThis.Bun.write(path, contents);
  return true;
}

/** Synchronous text read via mmap (Bun has no sync `file().text()`). */
export function readTextFileSync(path: string): string {
  return new TextDecoder().decode(globalThis.Bun.mmap(path));
}

/** Synchronous bytes read via mmap. */
export function readBytesFileSync(path: string): Uint8Array {
  return globalThis.Bun.mmap(path);
}
