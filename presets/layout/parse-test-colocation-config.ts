import { TEST_COLOCATION_POLICIES, type TestColocationGateConfig } from './scan-test-colocation.ts';

export function parseTestColocation(raw: object | undefined): {
  config?: TestColocationGateConfig;
  invalid?: true;
} {
  if (raw === undefined) {
    return {};
  }
  const policy = 'policy' in raw ? raw.policy : undefined;
  for (const known of TEST_COLOCATION_POLICIES) {
    if (policy === known) {
      return { config: { policy: known } };
    }
  }
  return { invalid: true };
}
