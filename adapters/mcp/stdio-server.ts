#!/usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  RootsListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as v from 'valibot';

import { reportCommandError } from '../../process/command/command.js';
import { runMcpVerify } from '../../gate/mcp-verify/mcp-verify.js';
import { VERIFY_TOOL_NAME } from '../hooks/verify-tool-name.js';
import { resolveMcpWorkspaceRoot } from './workspace-root.js';

const VerifyInputSchema = v.strictObject({});

const VERIFY_INPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const VERIFY_TOOL_DESCRIPTION =
  'Run agent-quality-gate Oxlint and Fallow checks for the current configured workspace. On failure, fix only the listed source-file violations, then call this tool again. Do not hunt for verify binaries, fallow/jscpd config, or agent-quality-gate packages.';

export function createAgentQualityGateMcpServer(
  options: AgentQualityGateMcpServerOptions = {},
): McpServer {
  const mcp = new McpServer(
    {
      name: 'agent-quality-gate',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: { listChanged: true },
      },
    },
  );

  mcp.server.setRequestHandler(ListToolsRequestSchema, async () => {
    const { root: cwd } = await resolveMcpWorkspaceRoot(mcp.server, options);
    return {
      tools:
        cwd === undefined
          ? []
          : [
              {
                name: VERIFY_TOOL_NAME,
                title: 'Verify',
                description: VERIFY_TOOL_DESCRIPTION,
                inputSchema: VERIFY_INPUT_JSON_SCHEMA,
              },
            ],
    };
  });

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

    const resolution = await resolveMcpWorkspaceRoot(mcp.server, options);
    if (resolution.root === undefined) {
      throw new McpError(ErrorCode.InvalidRequest, 'Verify is unavailable for this workspace');
    }
    const result = await runMcpVerify(resolution.root, {
      configPath: options.configPath,
      workspaceRootSource: resolution.source,
    });
    return {
      content: [{ type: 'text' as const, text: result.text }],
      isError: result.isError,
    };
  });

  mcp.server.setNotificationHandler(RootsListChangedNotificationSchema, () => {
    mcp.sendToolListChanged();
  });
  return mcp;
}

async function main(): Promise<void> {
  const mcp = createAgentQualityGateMcpServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

try {
  await main();
} catch (error) {
  reportCommandError('agent-quality-gate mcp', error instanceof Error ? error : String(error));
  process.exitCode = 1;
}

export type AgentQualityGateMcpServerOptions = {
  hostCwd?: string;
  configPath?: string;
};
