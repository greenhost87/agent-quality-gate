function collect(...values: number[]): number {
  return values.length;
}

function forwardRest(...values: number[]): number {
  return collect(...values);
}

export function run(...values: number[]): number {
  return forwardRest(...values);
}
