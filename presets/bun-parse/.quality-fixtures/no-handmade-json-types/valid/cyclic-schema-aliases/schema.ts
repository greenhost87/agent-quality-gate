import * as v from 'valibot';

const FirstSchema = v.record(v.string(), SecondSchema);
const SecondSchema = v.array(FirstSchema);

export const Schemas = [FirstSchema, SecondSchema];
