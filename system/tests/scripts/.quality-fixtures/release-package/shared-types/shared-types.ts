import type {
  PresetVerifyContext,
  VerifyRequest,
  VerifyResult,
} from 'agent-quality-gate/shared/verify';
import type { AstIndex, OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';

type ProjectRoot = PresetVerifyContext['projectRoot'];
type Request = VerifyRequest;
type Result = VerifyResult;
type Index = AstIndex;
type BenchInput = BenchCreateOnceRuleInput;

const projectRoot: ProjectRoot = '.';
const ruleSetting: OxlintRuleSetting = { severity: 'error', phase: 'lint' };

void projectRoot;
void ruleSetting;
void (null as Request | Result | Index | BenchInput | null);
