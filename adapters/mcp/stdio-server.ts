#!/usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as v from 'valibot';

import { reportCommandError } from '../../process/command/command.js';
import { runMcpVerify } from '../../gate/mcp-verify/mcp-verify.js';
import { VERIFY_TOOL_NAME } from '../hooks/verify-tool-name.js';

const CWD_DESCRIPTION = 'Absolute path to the workspace or project root to verify.';

const VerifyInputSchema = v.object({
  cwd: v.pipe(v.string(), v.minLength(1), v.description(CWD_DESCRIPTION)),
});

const VERIFY_INPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    cwd: {
      type: 'string',
      minLength: 1,
      description: CWD_DESCRIPTION,
    },
  },
  required: ['cwd'],
};

const VERIFY_TOOL_DESCRIPTION =
  'Run agent-quality-gate Oxlint and Fallow checks for a configured workspace. Pass the absolute workspace or project root as cwd. On failure, fix only the listed source-file violations, then call this tool again with the same cwd. Do not hunt for verify binaries, fallow/jscpd config, or agent-quality-gate packages.';

const mcp = new McpServer(
  {
    name: 'agent-quality-gate',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: VERIFY_TOOL_NAME,
      title: 'Verify',
      description: VERIFY_TOOL_DESCRIPTION,
      inputSchema: VERIFY_INPUT_JSON_SCHEMA,
    },
  ],
}));

mcp.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== VERIFY_TOOL_NAME) {
    throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
  }

  const parsed = v.safeParse(VerifyInputSchema, request.params.arguments ?? {});
  if (!parsed.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Input validation error: Invalid arguments for tool ${VERIFY_TOOL_NAME}: ${v.summarize(parsed.issues)}`,
    );
  }

  const result = await runMcpVerify(parsed.output.cwd);
  return {
    content: [{ type: 'text' as const, text: result.text }],
    isError: result.isError,
  };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

try {
  await main();
} catch (error) {
  reportCommandError('agent-quality-gate mcp', error instanceof Error ? error : String(error));
  process.exitCode = 1;
}
