export async function loadValue(): Promise<string> {
  return await Promise.resolve('ok');
}

export class Store {
  async list(): Promise<string[]> {
    return await Promise.resolve(['ok']);
  }
}
