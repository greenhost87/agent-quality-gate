import { ESLintUtils } from '@typescript-eslint/utils';

export const createRule = ESLintUtils.RuleCreator((name) => `https://quality-rules.invalid/rules/${name}`);
