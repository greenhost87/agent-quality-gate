export async function loadConfig(path: string): Promise<unknown> {
  const f = Bun.file(path);
  return f.json();
}
