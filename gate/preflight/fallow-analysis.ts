import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as v from 'valibot';

import { readJsonFile } from '../../process/files/files.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';
import type { ToolRunResult } from '../execute-verify/execute-verify.js';
import { fallowExecutablePath } from '../execute-verify/verify-tool-run.js';

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

export type ListFallowDiscoveredFilesOptions = {
  projectRoot: string;
  fallowConfigPath?: string;
  listIgnorePatterns?: readonly string[];
  environment?: Record<string, string>;
  failurePrefix?: string;
};

export type ListFallowDiscoveredFilesResult =
  | { ok: true; files: readonly string[] }
  | { ok: false; result: ToolRunResult };

async function resolveFallowListConfigPath(
  options: ListFallowDiscoveredFilesOptions,
): Promise<{ configPath?: string; cleanup: () => Promise<void> }> {
  if (options.listIgnorePatterns === undefined || options.fallowConfigPath === undefined) {
    return { configPath: options.fallowConfigPath, cleanup: async () => {} };
  }
  const base = await readJsonFile(options.fallowConfigPath, v.looseObject({}));
  const directory = await mkdtemp(join(tmpdir(), 'aqg-fallow-list-'));
  const configPath = join(directory, 'config.json');
  await writeFile(
    configPath,
    `${JSON.stringify({ ...base, ignorePatterns: [...options.listIgnorePatterns] }, null, 2)}\n`,
  );
  return {
    configPath,
    cleanup: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export async function listFallowDiscoveredFiles(
  options: ListFallowDiscoveredFilesOptions,
): Promise<ListFallowDiscoveredFilesResult> {
  const failurePrefix = options.failurePrefix ?? 'verify: ';
  const { configPath, cleanup } = await resolveFallowListConfigPath(options);
  try {
    const args = [
      fallowExecutablePath(),
      'list',
      '--files',
      '--format',
      'json',
      '--quiet',
      '--root',
      options.projectRoot,
    ];
    if (configPath !== undefined) {
      args.push('--config', configPath);
    }
    const captured = await runCapturedProcess({
      command: args[0] ?? fallowExecutablePath(),
      args: args.slice(1),
      cwd: options.projectRoot,
      environment: options.environment,
    });
    if (captured.error !== undefined) {
      return {
        ok: false,
        result: {
          exitCode: 1,
          stdout: '',
          stderr: `${failurePrefix}failed to start fallow list: ${captured.error.message}\n`,
        },
      };
    }
    if (captured.exitCode !== 0) {
      return {
        ok: false,
        result: {
          exitCode: captured.exitCode,
          stdout: captured.stdout,
          stderr: captured.stderr,
        },
      };
    }
    try {
      const discovered = parseFallowDiscoveredFiles(captured.stdout, failurePrefix);
      return { ok: true, files: discovered.files };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        result: { exitCode: 1, stdout: '', stderr: `${message}\n` },
      };
    }
  } finally {
    await cleanup();
  }
}
