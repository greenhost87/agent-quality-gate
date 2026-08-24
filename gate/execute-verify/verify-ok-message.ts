export function formatStepOk(step: string, what: string | undefined, durationMs: number): string {
  const label = what === undefined || what.length === 0 ? `${step}: ok` : `${step}: ok ${what}`;
  return `${label} (${durationMs}ms)\n`;
}

export function formatVerifyOk(what: string | undefined, durationMs: number): string {
  return formatStepOk('verify', what, durationMs);
}

export function formatTestOk(what: string | undefined, durationMs: number): string {
  return formatStepOk('test', what, durationMs);
}

export function formatFmtOk(what: string | undefined, durationMs: number): string {
  return formatStepOk('fmt', what, durationMs);
}
