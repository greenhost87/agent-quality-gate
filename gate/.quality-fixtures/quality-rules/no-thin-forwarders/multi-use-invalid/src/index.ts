function double(value: number): number {
  return value * 2;
}

function forward(value: number): number {
  return double(value);
}

export function runFirst(value: number): number {
  return forward(value);
}

export function runSecond(value: number): number {
  return forward(value);
}
