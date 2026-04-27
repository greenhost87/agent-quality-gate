export function runtimePlatform(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `darwin-${arch}`;
  }
  if (platform === 'linux' && (arch === 'arm64' || arch === 'x64')) {
    return `linux-${arch}`;
  }
  if (platform === 'win32' && (arch === 'arm64' || arch === 'x64')) {
    return `windows-${arch}`;
  }
  throw new Error(`agent-quality-gate: unsupported platform ${platform}-${arch}`);
}

export function executableExtension(): string {
  return process.platform === 'win32' ? '.exe' : '';
}
