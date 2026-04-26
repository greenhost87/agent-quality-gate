export function createProjectLauncherSource(): string {
  return `#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PACKAGE_FIELD = 'agentQualityGate';

function findProjectRoot(startDir) {
  let currentDir = startDir;
  while (true) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('agent-quality-gate: package.json not found');
    }
    currentDir = parentDir;
  }
}

function readPackageJson(projectRoot) {
  return JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
}

function resolveCacheRoot() {
  if (process.env.AGENT_QUALITY_GATE_CACHE_DIR) {
    return process.env.AGENT_QUALITY_GATE_CACHE_DIR;
  }
  if (process.env.XDG_CACHE_HOME) {
    return join(process.env.XDG_CACHE_HOME, 'agent-quality-gate');
  }
  return join(homedir(), '.cache', 'agent-quality-gate');
}

function readConfiguredVersion(packageJson) {
  const config = packageJson[PACKAGE_FIELD];
  if (!config || typeof config !== 'object' || typeof config.version !== 'string' || config.version.length === 0) {
    throw new Error('agent-quality-gate: package.json MUST contain agentQualityGate.version');
  }
  return config.version;
}

function run() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'verify') {
    process.stderr.write('Usage: agent-quality-gate verify [args...]\\n');
    return 2;
  }

  const projectRoot = findProjectRoot(process.cwd());
  const packageJson = readPackageJson(projectRoot);
  const version = readConfiguredVersion(packageJson);
  const runtimeDir = join(resolveCacheRoot(), 'runtimes', \`v\${version}\`);
  const verifyBin = join(runtimeDir, 'node_modules', 'agent-quality-gate', 'dist', 'bin', 'verify.js');

  if (!existsSync(verifyBin)) {
    process.stderr.write(
      \`agent-quality-gate runtime v\${version} is not installed. Run: bunx agent-quality-gate-init --version \${version}\\n\`
    );
    return 1;
  }

  const result = spawnSync('bun', [verifyBin, ...args], {
    cwd: projectRoot,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

try {
  process.exitCode = run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(\`\${message}\\n\`);
  process.exitCode = 1;
}
`;
}
