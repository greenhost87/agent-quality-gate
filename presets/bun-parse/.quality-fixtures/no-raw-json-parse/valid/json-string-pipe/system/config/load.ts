import * as v from 'valibot';

const ConfigSchema = v.object({
  name: v.string(),
});

export function parseJsonText<const TSchema extends v.GenericSchema>(
  text: string,
  schema: TSchema,
): v.InferOutput<TSchema> {
  return v.parse(v.pipe(v.string(), v.parseJson(), schema), text);
}

export function parseConfig(text: string): v.InferOutput<typeof ConfigSchema> {
  return parseJsonText(text, ConfigSchema);
}
