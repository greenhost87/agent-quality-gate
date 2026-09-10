import * as v from 'valibot';

import type { GlobalProject } from '../../config/global-config/global-config.js';
import type {
  FallowConfig,
  OxlintConfig,
} from '../../config/verify-config-files/verify-config-files.js';

const ObjectSchema = v.looseObject({});
const InputSchema = v.unknown();
type InputValue = v.InferInput<typeof InputSchema>;

export type RuleRow = {
  scope: string;
  id: string;
  value: unknown;
};

export type ProjectSkillRenderInput = {
  skillName: string;
  projectName: string;
  project: GlobalProject;
  oxlintRows: readonly RuleRow[];
  fallowConfig: FallowConfig;
  formatter?: Record<string, unknown>;
  tsconfig?: Record<string, unknown>;
};

function optionalObject(value: InputValue): Record<string, unknown> | undefined {
  const parsed = v.safeParse(ObjectSchema, value);
  return parsed.success ? parsed.output : undefined;
}

function stringArray(value: InputValue): string[] {
  const parsed = v.safeParse(v.array(v.string()), value);
  return parsed.success ? parsed.output : [];
}

function enabled(value: InputValue): boolean {
  if (value === 'off' || value === 0) return false;
  const array = v.safeParse(v.array(v.unknown()), value);
  return !(array.success && (array.output[0] === 'off' || array.output[0] === 0));
}

export function collectOxlintRules(config: OxlintConfig): RuleRow[] {
  const rows: RuleRow[] = [];
  for (const [id, value] of Object.entries(config.rules ?? {})) {
    rows.push({ scope: 'all files', id, value });
  }
  for (const override of config.overrides ?? []) {
    const files = stringArray(override['files']).join(', ');
    const rules = optionalObject(override['rules']) ?? {};
    for (const [id, value] of Object.entries(rules)) {
      rows.push({ scope: files, id, value });
    }
  }
  return rows;
}

function ruleValue(rows: readonly RuleRow[], id: string): unknown {
  return rows.find((row) => row.id === id && enabled(row.value))?.value;
}

function optionObject(value: InputValue): Record<string, unknown> | undefined {
  const array = v.safeParse(v.array(v.unknown()), value);
  return array.success ? optionalObject(array.output[1]) : undefined;
}

function optionNumber(value: InputValue, key: string, fallback: number): number {
  const result = optionObject(value)?.[key];
  return typeof result === 'number' ? result : fallback;
}

function optionStrings(value: InputValue, key: string): string[] {
  return stringArray(optionObject(value)?.[key]);
}

function markdownJson(value: InputValue): string {
  return `\`${JSON.stringify(value)}\``;
}

function section(title: string, rules: readonly string[]): string[] {
  return rules.length === 0 ? [] : ['', `## ${title}`, '', ...rules];
}

function presetActive(project: GlobalProject, name: string): boolean {
  return project.presets.includes(name);
}

function layoutRules(project: GlobalProject): string[] {
  if (!presetActive(project, 'layout')) return [];
  const layout = optionalObject(project.presetConfig.layout) ?? {};
  const placement = optionalObject(layout.placement) ?? {};
  const testColocation = optionalObject(layout.testColocation);
  const packages = optionalObject(layout.packages) ?? {};
  const roots = stringArray(placement.directories);
  const forbiddenPrefixes = stringArray(placement.forbidConcernPrefix);
  const allowedRootModules = stringArray(packages.allowedRootModules);
  const colocationPolicy =
    typeof testColocation?.policy === 'string' ? testColocation.policy : 'not configured';
  return [
    `- Watched roots: ${roots.map((root) => `\`${root}\``).join(', ') || 'none'}. Put modules below a real concern directory.`,
    `- Concern-depth limits: ${markdownJson(optionalObject(placement.maxDepth) ?? {})}. Direct TypeScript-file caps: ${markdownJson(optionalObject(placement.maxFilesPerDirectory) ?? {})}.`,
    `- Concern-prefixed basenames are forbidden under ${forbiddenPrefixes.map((root) => `\`${root}\``).join(', ') || 'no roots'}, except an exact mirrored name.`,
    `- Test colocation policy: \`${colocationPolicy}\`. Application tests belong under root \`tests/\`; helpers belong in \`tests/support/\` or \`tests/setup/\`.`,
    `- Allowed root modules: ${allowedRootModules.map((file) => `\`${file}\``).join(', ') || 'none'}. Package dependencies: ${markdownJson(packages.declaredDependencies ?? {})}. Private roots: ${markdownJson(packages.privatePackages ?? [])}.`,
  ];
}

function presentationRules(project: GlobalProject): string[] {
  if (!presetActive(project, 'react-presentation') && !presetActive(project, 'nextjs')) return [];
  return [
    '- Keep shared primitives in UI, shell/chrome in layout, and domain UI in its feature. Features cannot import other features; UI and layout cannot import features.',
    '- Use shared UI from application views. Low-level UI libraries and ad-hoc markup/styles belong only inside configured UI/layout boundaries.',
    '- Do not spread props into JSX or element-construction prop bags. Fixed specialization props must follow forwarded props; prefer the primitive directly.',
    '- Keep render and memo calculations pure. Do not mutate props/state aliases, call impure APIs during render, set state during render, create nested components, or construct unstable context values.',
    '- Follow Hooks dependencies and ordering. Supply stable keys, explicit button types, safe target links and iframes, controlled-input handlers/readOnly, and valid DOM properties.',
    ...(presetActive(project, 'nextjs')
      ? [
          '- Route handlers named `route.*` belong under `app/api/**`. Use Next.js components instead of dangerous HTML, raw `<head>`/`<img>`, synchronous scripts, CSS tags, or unsupported document/page APIs.',
        ]
      : []),
  ];
}

function parsingRules(project: GlobalProject): string[] {
  return [
    ...(presetActive(project, 'config')
      ? [
          '- Read environment variables only through `system/config/environment.ts`. Never access or destructure `process.env` elsewhere.',
          '- Do not use `v.custom` or exported trivial Valibot schema aliases.',
        ]
      : []),
    ...(presetActive(project, 'bun-parse')
      ? [
          '- Parse structured external/file data with Bun and a concrete Valibot schema; infer output with `v.InferOutput`. Avoid raw JSON parsing, handmade generic JSON types, loose records, and manual object/array narrowing.',
          '- Keep `scripts/` CLI-only; production modules cannot import from it.',
        ]
      : []),
  ];
}

function databaseRules(project: GlobalProject): string[] {
  if (!presetActive(project, 'database') && !presetActive(project, 'database-sqlite')) return [];
  if (presetActive(project, 'database-sqlite')) {
    return [
      '- Keep SQLite access behind the managed database connection and domain DAO boundaries.',
      '- Build queries inside DAO operations. Existing migrations are immutable; add a new ordered migration for schema changes.',
      '- Database tests use the managed isolated database infrastructure and production-reachable DAOs.',
    ];
  }
  return [
    '- Put PostgreSQL operations in `system/database/<domain>/<name>.dao.ts`. Export directly declared named functions; no DAO classes, object bags, default exports, aliases, re-exports, or cross-DAO imports.',
    '- Build SQL inside DAO functions using the managed lazy `sql` surface. Do not wrap the client, use `sql.unsafe`, or pass/store/aggregate DAO operations.',
    '- Handle query results and empty-list semantics at the query site. Existing migrations are immutable; add a new ordered SQL migration for schema changes.',
    '- Database tests use the managed isolated database hook and production-reachable DAOs. Do not expose raw infrastructure or expand production API solely for tests.',
  ];
}

function playwrightRules(project: GlobalProject): string[] {
  if (!presetActive(project, 'playwright')) return [];
  const origins = stringArray(optionalObject(project.presetConfig.playwright)?.externalMockOrigins);
  return [
    '- Playwright specs use `tests/e2e/**/*.pw.ts`, `@playwright/test`, and the `page` fixture. Treat the app as a black box; do not import database internals, launch browsers, or spawn servers in specs.',
    origins.length === 0
      ? '- No external Playwright mock origins are configured; do not add route, HAR, or WebSocket substitutions.'
      : `- Network substitution is limited to: ${origins.map((origin) => `\`${origin}\``).join(', ')}.`,
  ];
}

export function renderProjectSkill(input: ProjectSkillRenderInput): string {
  const duplicates = optionalObject(input.fallowConfig.duplicates) ?? {};
  const health = optionalObject(input.fallowConfig.health) ?? {};
  const compiler = optionalObject(input.tsconfig?.compilerOptions) ?? {};
  const maxLines = optionNumber(ruleValue(input.oxlintRows, 'max-lines'), 'max', 400);
  const codeLineLimits = input.oxlintRows
    .filter((row) => row.id === 'aqg/max-code-lines' && enabled(row.value))
    .map((row) => `${row.scope}: ${String(optionNumber(row.value, 'max', 400))}`);
  const fileLineGuidance =
    codeLineLimits.length > 0
      ? `Keep files within code-line limits (${codeLineLimits.join('; ')}; later matching scopes take precedence), excluding imports, comments, and blank lines.`
      : `Keep files at or below ${String(maxLines)} nonblank, noncomment lines.`;
  const maxInlineMembers = optionNumber(
    ruleValue(input.oxlintRows, 'aqg/max-inline-parameter-object-members'),
    'max',
    3,
  );
  const suffixes = optionStrings(ruleValue(input.oxlintRows, 'aqg/no-class'), 'suffixes');
  const componentComplexity = optionNumber(ruleValue(input.oxlintRows, 'complexity'), 'max', 8);
  const maxCyclomatic = typeof health.maxCyclomatic === 'number' ? health.maxCyclomatic : 20;
  const maxCognitive = typeof health.maxCognitive === 'number' ? health.maxCognitive : 15;
  const minTokens = typeof duplicates.minTokens === 'number' ? duplicates.minTokens : 30;
  const minLines = typeof duplicates.minLines === 'number' ? duplicates.minLines : 3;
  const classRule =
    suffixes.length === 0
      ? 'Runtime classes are forbidden.'
      : `Runtime classes are forbidden except names ending in ${suffixes.map((suffix) => `\`${suffix}\``).join(' or ')}.`;
  return [
    '---',
    `name: ${input.skillName}`,
    `description: Applies the enforced ${input.projectName} TypeScript, module-layout, parsing, database, UI, and test coding rules. Use whenever writing, changing, or reviewing code in this project.`,
    '---',
    '',
    `# ${input.projectName} code rules`,
    '',
    'Apply these constraints while designing a change. `AGENTS.md` remains authoritative for product, safety, documentation, and verification workflow.',
    '',
    '## TypeScript and module shape',
    '',
    `- Write strict ESM TypeScript. Preserve configured compiler constraints and aliases (${markdownJson(compiler.paths ?? {})}).`,
    '- Validate untrusted values and keep precise types. Do not use `any`, non-null assertions, unsafe assertions, double assertions through `unknown`, unsafe value flows, or `unknown` parameters.',
    '- Define explicit named object shapes. Do not use `Pick`, `Omit`, `Partial`, `NonNullable`, intersections, indexed-access types, empty interfaces, identity aliases, or aliases that merely rename an export.',
    '- Derive exported string-literal types from one runtime catalog declared `as const`. Keep `*.types.ts` files type-only.',
    '- Use separate type-only imports and exports. Export declarations from their owner; do not add barrels, forwarding exports, export proxies, or runtime re-exports.',
    `- Prefer functions and data. ${classRule}`,
    '- Use static imports. Dynamic `import()` is allowed only in configured runtime-boundary files with relative string literals.',
    `- Extract inline parameter object types above ${String(maxInlineMembers)} members. ${fileLineGuidance}`,
    '- Handle promises explicitly: no floating promises, async executors, thenable misuse, or pointless `async`/`await`.',
    `- Follow the project formatter (${markdownJson(input.formatter ?? {})}).`,
    '',
    '## Reachability, reuse, and complexity',
    '',
    '- Every production file, export, type, dependency, enum member, and class member must be reachable and used. Delete obsolete API and migrate consumers directly; never add artificial usages.',
    '- Keep imports resolvable and dependencies declared. Avoid circular imports, re-export cycles, duplicate exports, and boundary violations.',
    '- Avoid thin forwarders, constant wrappers, identity aliases, thin UI wrappers, duplicated prop shapes, and speculative micro-modules.',
    `- Keep cyclomatic complexity at most ${String(maxCyclomatic)}, cognitive complexity at most ${String(maxCognitive)}, and component complexity at most ${String(componentComplexity)}.`,
    `- Avoid near-duplicate blocks from ${String(minTokens)} tokens and ${String(minLines)} lines. Reuse the smallest real shared primitive.`,
    '- Do not suppress diagnostics. Disable directives are forbidden; suppressions require reasons and cannot become stale.',
    ...section('Placement and package boundaries', layoutRules(input.project)),
    ...section('React and Next.js', presentationRules(input.project)),
    ...section('Configuration and parsing', parsingRules(input.project)),
    ...section('Database', databaseRules(input.project)),
    ...section('Tests and Playwright', [
      '- Exercise imported production implementations. Do not replace, spy on, mutate, hand-port, or copy project implementation modules. Only external packages and builtins are mockable boundaries.',
      '- Keep expectations independent of production logic. Do not leave skipped/focused tests, JSON clone tricks, double-wrapped equality assertions, or inline multiline test data.',
      ...playwrightRules(input.project),
      ...(presetActive(input.project, 'n8n-lints')
        ? [
            '- In `catch`, omit an unused parameter. Use template literals only for interpolation or multiline content.',
          ]
        : []),
    ]),
    '',
  ].join('\n');
}
