function double(value: number): number {
  return value * 2;
}

const forward = (value: number): number => double(value);

export function run(value: number): number {
  return forward(value);
}
