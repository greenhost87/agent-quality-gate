import { join } from 'node:path';
import * as v from 'valibot';

const FallowDiscoveredFilesSchema = v.pipe(
  v.object({
    file_count: v.number(),
    files: v.array(v.string()),
  }),
  v.check((value) => value.file_count === value.files.length, 'file_count must match files length'),
);

const FallowDiscoveredFilesFromStdoutSchema = v.pipe(
  v.string(),
  v.parseJson(),
  FallowDiscoveredFilesSchema,
);

export function fallowCacheEnvironment(projectRoot: string): Record<string, string> {
  return {
    FALLOW_CACHE_DIR: join(projectRoot, 'node_modules', '.cache', 'agent-quality-gate', 'fallow'),
  };
}

export function parseFallowDiscoveredFiles(
  stdout: string,
  diagnosticPrefix: string,
): DiscoveredFilesOutput {
  const result = v.safeParse(FallowDiscoveredFilesFromStdoutSchema, stdout);
  if (!result.success) {
    const malformedJson = result.issues.some((issue) => issue.type === 'parse_json');
    const detail = malformedJson
      ? 'fallow list returned malformed JSON'
      : 'fallow list returned JSON that does not match the discovered-files schema';
    throw new Error(`${diagnosticPrefix}${detail}`);
  }
  return result.output;
}

export type DiscoveredFilesOutput = {
  file_count: number;
  files: string[];
};
