const suffix = 'b';

export const values = [`a`, `b`] as const;
export type Value = (typeof values)[number];
export const dynamicValues = [`a${suffix}`, `b`];
