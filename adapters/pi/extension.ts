import { registerQualityGate } from './register-quality-gate.js';
import type { QualityGateExtensionApi } from './extension-api.types.js';

export default function (pi: QualityGateExtensionApi): void {
  registerQualityGate(pi);
}
