import type { CompilerOptions } from 'typescript';

export interface ParsedTscArgs {
  projectPath: string;
  compilerOptions: CompilerOptions;
}

export interface ParsedKnipArgs {
  configPath: string;
  include: string[];
}

export interface ParsedConfigArgs {
  configPath: string;
  rest: string[];
}

export interface ParsedJscpdArgs {
  configPath: string;
  targets: string[];
}

export interface ParsedDepcruiseArgs {
  configPath: string;
  targets: string[];
}

export interface DepcruiseConfig {
  forbidden?: unknown[];
  allowed?: unknown[];
  required?: unknown[];
  options?: object;
}

export interface DepcruiseOptions {
  exclude: { path?: string | RegExp };
}

export interface JscpdJsonConfig {
  gitignore?: boolean;
  threshold?: number;
  minLines?: number;
  minTokens?: number;
  maxLines?: number;
  maxSize?: string;
  format?: string | string[];
  pattern?: string;
  reporters?: string | string[];
  output?: string;
  ignore?: string | string[];
  path?: string | string[];
  mode?: string;
  exitCode?: number;
}
