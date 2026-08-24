export const values = ['a', 'b'] as const;

export type Value = (typeof values)[number];

export interface Shape {
  readonly value: Value;
}
