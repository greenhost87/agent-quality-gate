import type { VerifyResult } from '../execute-verify/execute-verify.types.js';

export type QualityGateRun =
  | { kind: 'skipped'; message: string }
  | { kind: 'unavailable'; logPath: string }
  | { kind: 'ran'; projectRoot: string; result: VerifyResult };

export type FollowUpDecision =
  | { action: 'none' }
  | { action: 'continue' | 'escalate'; message: string };

export type RegisterQualityGateOptions = {
  configPath?: string;
};

export type CompactHintFlags = {
  duplication: boolean;
  presentationDuplication: boolean;
  databaseBoundary: boolean;
  playwrightE2e: boolean;
  handmadeJson: boolean;
};
