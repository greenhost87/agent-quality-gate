declare const values: readonly ['a', 'b'];

export type Value = (typeof values)[number];
