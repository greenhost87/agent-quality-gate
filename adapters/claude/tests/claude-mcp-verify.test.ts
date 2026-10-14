import { join } from 'node:path';

import { afterEach } from 'bun:test';

import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { describeMcpVerifyScenarios } from '#system/tests/support/mcp-verify-scenarios.js';
import { createStopHookTestFixtures } from '#system/tests/support/stop-hook-test-fixtures.js';

useIsolatedAgentQualityGateHome();

const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'mcp-verify');
const fixtures = createStopHookTestFixtures('claude-mcp', FIXTURES_ROOT);

afterEach(fixtures.cleanup);

describeMcpVerifyScenarios('claude mcp verify', fixtures, 'quality-gate-claude-mcp');
