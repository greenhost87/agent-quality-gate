import * as v from 'valibot';

const ConfigSchema = v.object({
  name: v.string(),
  labels: v.record(v.string(), v.string()),
});

export type Config = v.InferOutput<typeof ConfigSchema>;
