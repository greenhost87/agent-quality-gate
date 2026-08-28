import { join } from 'node:path';
import * as v from 'valibot';

const FallowDiscoveredFilesSchema = v.pipe(
  v.object({
    file_count: v.number(),
    files: v.array(v.string()),
  }),
  v.check((value) => value.file_count === value.files.length, 'file_count must match files length'),
);

const FallowDiscoveredFilesJsonSchema = v.pipe(v.string(), v.parseJson());

export function fallowCacheEnvironment(projectRoot: string): Record<string, string> {
  return {
    FALLOW_CACHE_DIR: join(projectRoot, 'node_modules', '.cache', 'agent-quality-gate', 'fallow'),
  };
}

export function parseFallowDiscoveredFiles(
  stdout: string,
  diagnosticPrefix: string,
): DiscoveredFilesOutput {
  const parsed = v.safeParse(FallowDiscoveredFilesJsonSchema, stdout);
  if (!parsed.success) {
    throw new Error(`${diagnosticPrefix}fallow list returned malformed JSON`);
  }
  const result = v.safeParse(FallowDiscoveredFilesSchema, parsed.output);
  if (!result.success) {
    throw new Error(`${diagnosticPrefix}fallow list files schema is unsupported`);
  }
  return result.output;
}

export type DiscoveredFilesOutput = {
  file_count: number;
  files: string[];
};
