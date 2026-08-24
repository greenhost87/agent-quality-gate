const localValues = ['a', 'b'];
const defaultValue = 'b';
function loadValues(): string[] {
  return ['a'];
}

export const values = ['a', 'b'] as const;
export type Value = (typeof values)[number];
export const emptyValues: string[] = [];
export const computedValues: string[] = loadValues();
export const mixedValues = ['a', defaultValue];
export const numericValues = [1, 2];
export function firstLocalValue(): string {
  return localValues[0] ?? '';
}
