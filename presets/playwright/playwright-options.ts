import * as v from 'valibot';

export const PlaywrightOptionsSchema = v.object({
  e2eDirectory: v.optional(v.string(), ''),
  externalMockOrigins: v.optional(v.array(v.string()), []),
  processRunnerImports: v.optional(v.array(v.string()), []),
});

export type PlaywrightOptions = v.InferOutput<typeof PlaywrightOptionsSchema>;

export function isInConfiguredDirectory(filename: string, directory: string): boolean {
  if (directory.length === 0) {
    return false;
  }
  const normalized = filename.replaceAll('\\', '/');
  return normalized.includes(`/${directory}/`) || normalized.startsWith(`${directory}/`);
}
