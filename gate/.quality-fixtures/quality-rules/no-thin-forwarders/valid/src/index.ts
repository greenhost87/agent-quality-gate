function double(value: number): number {
  return value * 2;
}

export function run(value: number): number {
  return double(value) + 1;
}

function recursive(value: number): number {
  return recursive(value);
}

void recursive;

export default function defaultForward(value: number): number {
  return double(value);
}

export function useDefaultForward(value: number): number {
  return defaultForward(value);
}

export function alias(value: number): number {
  return double(value);
}

export function useAlias(value: number): number {
  return alias(value);
}

async function runMapped(options: { name: string; args: string[] }): Promise<number> {
  await Promise.resolve();
  void options;
  return 0;
}

async function mapThenCall(name: string, args: string[]): Promise<number> {
  return await runMapped({
    name,
    args: args.map((value) => value.toUpperCase()),
  });
}

export async function useMapThenCall(name: string, args: string[]): Promise<number> {
  return await mapThenCall(name, args);
}

export async function exportedObjectAdapter(name: string, args: string[]): Promise<number> {
  return await runMapped({ name, args });
}
