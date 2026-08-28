declare function target(value: number): number;

export function forward(value: number): number {
  return target(value);
}
