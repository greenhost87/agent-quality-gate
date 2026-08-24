import type {
  ModulePlacementConfig,
  PackageBoundariesConfig,
} from '../global-config/global-config.js';

export type MaxInlineParameterObjectMembersOptions = {
  max: number;
};

export type ConfiguredRuleOptions =
  | PackageBoundariesConfig
  | ModulePlacementConfig
  | MaxInlineParameterObjectMembersOptions;

export type ConfiguredRuleEntry = {
  ruleName: string;
  options: ConfiguredRuleOptions;
};
