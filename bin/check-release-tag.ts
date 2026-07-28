#!/usr/bin/env bun

import packageJson from '../package.json' with { type: 'json' };

const TAG_PATTERN = /^v\d+\.\d+\.\d+$/u;

function normalizeTag(input: string | undefined): string {
  if (!input) {
    throw new Error('release: missing tag value; pass tag as first argument or set GITHUB_REF_NAME');
  }
  return input.startsWith('refs/tags/') ? input.slice('refs/tags/'.length) : input;
}

function main(): void {
  const tag = normalizeTag(process.argv[2] ?? process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF);
  if (!TAG_PATTERN.test(tag)) {
    throw new Error(`release: tag "${tag}" must match vX.Y.Z`);
  }
  const expectedTag = `v${packageJson.version}`;
  if (tag !== expectedTag) {
    throw new Error(`release: tag/version mismatch (tag=${tag}, package.json=${expectedTag}); keep them identical`);
  }
  process.stdout.write(`release: tag ${tag} matches package.json version ${packageJson.version}\n`);
}

if (import.meta.main) {
  main();
}
