const DEFAULTS = { retries: 1 };

export function getDefaults(): { retries: number } {
  return { ...DEFAULTS };
}
