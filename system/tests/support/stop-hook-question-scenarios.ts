import { describe, it } from 'bun:test';

import { askQuestionAnsweredTranscript, askQuestionTranscript } from './stop-hook-test-fixtures.js';

export type StopHookScenarioInput = {
  cwd: string;
  session_id: string;
  transcript_path: string;
  stop_hook_active: boolean;
};

export type StopHookScenarioFixtures = {
  stopInput: (cwd: string, sessionId: string) => StopHookScenarioInput;
  setupConfiguredProject: (
    fixtureCase: 'clean-function' | 'debugger-with-export',
    prefix: string,
  ) => Promise<{ cwd: string; configPath: string }>;
  writeTranscriptLines: (path: string, entries: readonly object[]) => Promise<void>;
  makeTranscriptPath: (prefix: string) => Promise<string>;
};

export type QuestionToolStopScenarios<Output extends object> = {
  label: string;
  fixtures: StopHookScenarioFixtures;
  /** Temp-directory namespace, e.g. `quality-gate-claude`. */
  prefix: string;
  /** Session-id namespace, e.g. `claude-stop`. */
  sessionPrefix: string;
  questionToolName: string;
  handleStop: (input: StopHookScenarioInput, options: { configPath: string }) => Promise<Output>;
  expectSkipped: (output: Output) => void;
  expectFollowUp: (output: Output) => void;
};

/** Shared ask-user-question stop-hook scenarios; follow-up assertions stay per harness. */
export function describeQuestionToolStopScenarios<Output extends object>(
  scenarios: QuestionToolStopScenarios<Output>,
): void {
  const {
    label,
    fixtures,
    prefix,
    sessionPrefix,
    questionToolName,
    handleStop,
    expectSkipped,
    expectFollowUp,
  } = scenarios;
  async function setupQuestionTranscript(
    suffix: string,
    entries: readonly object[],
  ): Promise<{ cwd: string; configPath: string; transcriptPath: string }> {
    const { cwd, configPath } = await fixtures.setupConfiguredProject(
      'debugger-with-export',
      `${prefix}-${suffix}-`,
    );
    const transcriptPath = await fixtures.makeTranscriptPath(`${prefix}-${suffix}-transcript-`);
    await fixtures.writeTranscriptLines(transcriptPath, entries);
    return { cwd, configPath, transcriptPath };
  }

  describe(label, () => {
    it(`skips follow-up when the last assistant transcript turn used ${questionToolName}`, async () => {
      const { cwd, configPath, transcriptPath } = await setupQuestionTranscript(
        'askq',
        askQuestionTranscript(questionToolName),
      );

      expectSkipped(
        await handleStop(
          { ...fixtures.stopInput(cwd, `${sessionPrefix}-askq`), transcript_path: transcriptPath },
          { configPath },
        ),
      );
    });

    it(`still follows up when ${questionToolName} is not in the last assistant turn`, async () => {
      const { cwd, configPath, transcriptPath } = await setupQuestionTranscript(
        'askq-later',
        askQuestionAnsweredTranscript(questionToolName),
      );

      const output = await handleStop(
        {
          ...fixtures.stopInput(cwd, `${sessionPrefix}-askq-later`),
          transcript_path: transcriptPath,
        },
        { configPath },
      );
      expectFollowUp(output);
    });
  });
}
