declare const allowedValues: readonly ['a', 'b'];

export type Value = (typeof allowedValues)[number];
