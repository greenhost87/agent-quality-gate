import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../config/global-config/global-config.js';
import { VERIFY_TOOL_NAME } from '../hooks/verify-tool-name.js';

export async function activeToolNamesForCwd(
  cwd: string,
  activeTools: readonly string[],
  configPath?: string,
): Promise<string[]> {
  const withoutVerify = activeTools.filter((name) => name !== VERIFY_TOOL_NAME);
  const configured =
    findProjectForCwd(cwd, (await readGlobalQualityGateConfig(configPath)).projects) !== undefined;
  if (!configured) {
    return withoutVerify;
  }
  return [...withoutVerify, VERIFY_TOOL_NAME];
}
