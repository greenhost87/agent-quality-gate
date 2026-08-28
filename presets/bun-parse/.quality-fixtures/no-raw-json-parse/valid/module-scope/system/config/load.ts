import * as v from 'valibot';

const Schema = v.object({ name: v.string() });

const raw: unknown = await Bun.file('config.json').json();
export const config = v.parse(Schema, raw);
