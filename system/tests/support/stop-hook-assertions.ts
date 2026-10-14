import { expect } from 'bun:test';

/** Assert the shared stop-hook follow-up text shown when verify fails. */
export function expectFollowUpViolationText(text: string | undefined): void {
  expect(text).toContain('no-debugger');
  expect(text).toContain('Fix only the violations listed below (and any hint: lines)');
  expect(text).toContain('Apply fixes directly; do not investigate the gate');
  expect(text).toContain(
    'search prior fixes, transcripts, chats, git history, or gate tooling/config/packages',
  );
  expect(text).toContain('Then call native or MCP verify again');
}

/** Unwrap a required stop-hook output field, failing with `message` when absent. */
export function requiredOutputText(value: string | undefined, message: string): string {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

/** Assert the escalation text shown once the follow-up retry budget is exhausted. */
export function expectBudgetExhaustedText(text: string | undefined): void {
  expect(text).toContain('Retry budget exhausted. Stop and report the blocker to the user.');
}
