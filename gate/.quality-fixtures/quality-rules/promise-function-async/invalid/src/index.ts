export function loadValue(): Promise<string> {
  return Promise.resolve('ok');
}

export class Store {
  list(): Promise<string[]> {
    return Promise.resolve(['ok']);
  }
}
