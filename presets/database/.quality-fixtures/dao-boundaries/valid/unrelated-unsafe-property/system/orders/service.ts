declare const config: {
  unsafe: boolean;
};

export function isUnsafeModeEnabled(): boolean {
  return config.unsafe;
}
