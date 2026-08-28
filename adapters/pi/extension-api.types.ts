import type { SessionBranchEntry } from './session-ask-user.js';

export type EmptyToolParams = Record<string, never>;

export type QualityGateToolResult = {
  content: { type: 'text'; text: string }[];
  details: Record<string, never>;
};

export type QualityGateSessionManager = {
  getBranch(): readonly SessionBranchEntry[];
};

export type QualityGateExtensionContext = {
  cwd: string;
  ui: {
    notify(message: string, level: 'info' | 'warning' | 'error'): void;
  };
  sessionManager?: QualityGateSessionManager;
};

export type AgentSettledEvent = {
  reason?: string;
};

export type SessionStartEvent = {
  reason: string;
};

export type QualityGateExtensionApi = {
  registerTool(definition: {
    name: string;
    label: string;
    description: string;
    parameters: object;
    promptSnippet: string;
    promptGuidelines: string[];
    execute: (
      toolCallId: string,
      params: EmptyToolParams,
      signal: AbortSignal,
      onUpdate: ((message: string) => void) | undefined,
      ctx: QualityGateExtensionContext,
    ) => Promise<QualityGateToolResult>;
  }): void;
  getActiveTools(): string[];
  setActiveTools(names: readonly string[]): void;
  on(
    event: 'session_start' | 'agent_settled',
    handler: (
      event: SessionStartEvent | AgentSettledEvent,
      ctx: QualityGateExtensionContext,
    ) => Promise<void>,
  ): void;
  sendUserMessage(content: string, options?: { deliverAs?: 'followUp' | 'steer' }): void;
};
