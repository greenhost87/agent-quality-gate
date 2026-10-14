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

export type AgentEndMessage = {
  role?: string;
  stopReason?: string;
};

export type AgentEndEvent = {
  messages: readonly AgentEndMessage[];
};

export type SessionStartEvent = {
  reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork';
};

export type QualityGateToolComponent = {
  render(width: number): string[];
  invalidate(): void;
};

export type QualityGateToolRenderContext = {
  state: Record<string, unknown>;
  lastComponent?: QualityGateToolComponent;
};

export type QualityGateToolDefinition = {
  name: string;
  label: string;
  renderShell?: 'self';
  description: string;
  parameters: object;
  promptSnippet: string;
  promptGuidelines: string[];
  renderCall?: (
    params: EmptyToolParams,
    theme: unknown,
    context: QualityGateToolRenderContext,
  ) => QualityGateToolComponent;
  renderResult?: (
    result: QualityGateToolResult,
    options: { isPartial?: boolean },
    theme: unknown,
    context: QualityGateToolRenderContext,
  ) => QualityGateToolComponent;
  execute: (
    toolCallId: string,
    params: EmptyToolParams,
    signal: AbortSignal,
    onUpdate: ((message: string) => void) | undefined,
    ctx: QualityGateExtensionContext,
  ) => Promise<QualityGateToolResult>;
};

export type QualityGateExtensionApi = {
  registerTool(definition: QualityGateToolDefinition): void;
  getActiveTools(): string[];
  setActiveTools(names: readonly string[]): void;
  on(
    event: 'session_start' | 'agent_end',
    handler: (
      event: SessionStartEvent | AgentEndEvent,
      ctx: QualityGateExtensionContext,
    ) => Promise<void>,
  ): void;
  sendMessage(
    message: {
      customType: string;
      content: string;
      display: boolean;
    },
    options: { triggerTurn: true; deliverAs: 'followUp' },
  ): void;
};
