function formatClockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatStepOk(step: string, what: string | undefined, durationMs: number): string {
  const label = what === undefined || what.length === 0 ? `${step}: ok` : `${step}: ok ${what}`;
  const duration = `${(durationMs / 1000).toFixed(1)}s`;
  return `${formatClockTime(new Date())} ${duration.padStart(10)} ${label}\n`;
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
