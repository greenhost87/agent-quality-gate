export async function loadConfig(path: string): Promise<unknown> {
  return Bun.file(path).json();
}
