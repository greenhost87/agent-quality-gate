export type TreeObject = { [key: string]: TreeValue };
export type TreeValue = string | number | boolean | null | TreeValue[] | TreeObject;

export const isPlainTree = (value: unknown): value is TreeObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
