import { existsSync } from 'node:fs';
import { file, mmap, write } from 'bun';

/** True for files and directories. `Bun.file().exists()` is false for directories. */
export async function pathExists(path: string): Promise<boolean> {
  return await Promise.resolve(existsSync(path));
}

export async function readTextFile(path: string): Promise<string> {
  return file(path).text();
}

export async function readJsonFile(path: string): Promise<unknown> {
  return file(path).json();
}

export async function writeTextFile(path: string, contents: string): Promise<number> {
  return write(path, contents);
}

export async function writeBytesFile(path: string, contents: Uint8Array): Promise<number> {
  return write(path, contents);
}

export async function writeJsonFile(path: string, value: object): Promise<number> {
  return writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Write only when contents differ. Returns whether a write happened. */
export async function writeTextIfChanged(path: string, contents: string): Promise<boolean> {
  const target = file(path);
  if (await target.exists()) {
    if ((await target.text()) === contents) {
      return false;
    }
  }
  await write(path, contents);
  return true;
}

/** Synchronous text read via mmap (Bun has no sync `file().text()`). */
export function readTextFileSync(path: string): string {
  return new TextDecoder().decode(mmap(path));
}

/** Synchronous bytes read via mmap. */
export function readBytesFileSync(path: string): Uint8Array {
  return mmap(path);
}
