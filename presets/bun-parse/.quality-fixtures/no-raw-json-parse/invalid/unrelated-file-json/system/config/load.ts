function file(path: string): { json(): Promise<unknown> } {
  return {
    async json() {
      return { path };
    },
  };
}

export async function loadConfig(path: string): Promise<unknown> {
  return file(path).json();
}
