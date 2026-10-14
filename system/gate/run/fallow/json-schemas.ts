import * as v from 'valibot';

const pathLineColFields = {
  path: v.string(),
  line: v.optional(v.number()),
  col: v.optional(v.number()),
} as const;

const PathLineColSchema = v.object(pathLineColFields);

const CircularDependencySchema = v.object({
  files: v.optional(v.pipe(v.array(v.string()), v.minLength(1))),
  cycle: v.optional(v.pipe(v.array(v.string()), v.minLength(1))),
  length: v.optional(v.number()),
  line: v.optional(v.number()),
  col: v.optional(v.number()),
  edges: v.optional(v.array(PathLineColSchema)),
});

const ReExportCycleSchema = v.object({
  files: v.pipe(v.array(v.string()), v.minLength(1)),
  kind: v.optional(v.string()),
});

const UnresolvedImportSchema = v.object({
  specifier: v.string(),
  ...pathLineColFields,
});

const BoundaryViolationSchema = v.object({
  from_path: v.string(),
  to_path: v.string(),
  from_zone: v.optional(v.string()),
  to_zone: v.optional(v.string()),
  import_specifier: v.optional(v.string()),
  line: v.optional(v.number()),
  col: v.optional(v.number()),
});

const ComplexityFindingSchema = v.object({
  path: v.string(),
  name: v.optional(v.string()),
  line: v.optional(v.number()),
  col: v.optional(v.number()),
  cyclomatic: v.optional(v.number()),
  cognitive: v.optional(v.number()),
  severity: v.optional(v.string()),
  /** Fallow emits a string (e.g. `all`) or occasionally a list of metric names. */
  exceeded: v.optional(v.union([v.string(), v.array(v.string())])),
});

const UnusedExportSchema = v.object({
  export_name: v.optional(v.string()),
  ...pathLineColFields,
});

const DependencyPackageSchema = v.object({
  name: v.optional(v.string()),
  package_name: v.optional(v.string()),
  path: v.optional(v.string()),
  line: v.optional(v.number()),
  location: v.optional(v.union([v.string(), v.object({})])),
});

const UnlistedDependencySchema = v.object({
  package_name: v.string(),
  imported_from: v.optional(v.array(PathLineColSchema), []),
});

const DuplicateExportSchema = v.object({
  export_name: v.string(),
  locations: v.optional(v.array(PathLineColSchema), []),
});

const ListedDependencyFindingSchema = v.object({
  package_name: v.string(),
  path: v.optional(v.string()),
  line: v.optional(v.number()),
});

const StructuralLineSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

const StructuralLocationSchema = v.object({
  file: v.string(),
  line: StructuralLineSchema,
  component: v.string(),
});

export const StructuralFindingFieldsSchema = {
  prop_drilling_chains: v.optional(
    v.array(
      v.object({
        prop: v.string(),
        hops: v.pipe(v.array(StructuralLocationSchema), v.minLength(1)),
      }),
    ),
    [],
  ),
  thin_wrappers: v.optional(
    v.array(
      v.object({
        file: v.string(),
        line: StructuralLineSchema,
        component: v.string(),
        child_component: v.string(),
      }),
    ),
    [],
  ),
  duplicate_prop_shapes: v.optional(
    v.array(
      v.object({
        file: v.string(),
        line: StructuralLineSchema,
        component: v.string(),
        shape: v.array(v.string()),
      }),
    ),
    [],
  ),
} as const;

const StructuralFieldsObjectSchema = v.object(StructuralFindingFieldsSchema);

export type StructuralFindingFields = v.InferOutput<typeof StructuralFieldsObjectSchema>;

/**
 * Loose on purpose: preset-owned rules (enabled only in the combined-run
 * config variant, Stage V4) emit extra finding arrays under their own keys.
 * Core phases read only the declared keys; the hygiene completeness guard
 * attributes the preset-owned keys by name instead of interpreting them.
 */
const DeadCodeIssueArraysObjectSchema = v.looseObject({
  total_issues: v.optional(v.number()),
  ...StructuralFindingFieldsSchema,
  circular_dependencies: v.optional(v.array(CircularDependencySchema), []),
  re_export_cycles: v.optional(v.array(ReExportCycleSchema), []),
  unresolved_imports: v.optional(v.array(UnresolvedImportSchema), []),
  boundary_violations: v.optional(v.array(BoundaryViolationSchema), []),
  unused_exports: v.optional(v.array(UnusedExportSchema), []),
  unused_files: v.optional(v.array(v.object({ path: v.string() })), []),
  unused_class_members: v.optional(
    v.array(
      v.object({
        path: v.string(),
        parent_name: v.optional(v.string()),
        class_name: v.optional(v.string()),
        member_name: v.optional(v.string()),
        member: v.optional(v.string()),
        line: v.optional(v.number()),
        col: v.optional(v.number()),
      }),
    ),
    [],
  ),
  unused_dependencies: v.optional(v.array(DependencyPackageSchema), []),
  unused_dev_dependencies: v.optional(v.array(DependencyPackageSchema), []),
  unused_optional_dependencies: v.optional(v.array(DependencyPackageSchema), []),
  unused_enum_members: v.optional(
    v.array(
      v.object({
        path: v.string(),
        parent_name: v.optional(v.string()),
        enum_name: v.optional(v.string()),
        member_name: v.optional(v.string()),
        member: v.optional(v.string()),
        line: v.optional(v.number()),
        col: v.optional(v.number()),
      }),
    ),
    [],
  ),
  unused_types: v.optional(
    v.array(
      v.object({
        path: v.string(),
        type_name: v.optional(v.string()),
        export_name: v.optional(v.string()),
        name: v.optional(v.string()),
        line: v.optional(v.number()),
        col: v.optional(v.number()),
      }),
    ),
    [],
  ),
  unlisted_dependencies: v.optional(v.array(UnlistedDependencySchema), []),
  duplicate_exports: v.optional(v.array(DuplicateExportSchema), []),
  type_only_dependencies: v.optional(v.array(ListedDependencyFindingSchema), []),
  test_only_dependencies: v.optional(v.array(ListedDependencyFindingSchema), []),
  dev_dependencies_in_production: v.optional(v.array(DependencyPackageSchema), []),
});

const DeadCodeIssueArraysSchema = v.pipe(
  DeadCodeIssueArraysObjectSchema,
  v.check(
    (check) => check.total_issues !== undefined || knownDeadCodeIssueCount(check) > 0,
    'Fallow check requires an issue summary or findings',
  ),
);

const CombinedDupesSchema = v.object({
  clone_groups: v.array(
    v.object({
      instances: v.pipe(
        v.array(
          v.object({
            file: v.string(),
            start_line: v.number(),
            end_line: v.optional(v.number()),
          }),
        ),
        v.minLength(1),
      ),
    }),
  ),
});

export const HealthSchema = v.looseObject({
  kind: v.literal('health'),
  findings: v.array(ComplexityFindingSchema),
});

/** Nested health section of a top-level combined run (no `kind` wrapper). */
export const CombinedHealthSchema = v.looseObject({
  findings: v.array(ComplexityFindingSchema),
});

export type CombinedHealthSection = v.InferOutput<typeof CombinedHealthSchema>;

export type CombinedDupesSection = v.InferOutput<typeof CombinedDupesSchema>;

/** Opaque UI result provided to external preset check modules when available. */
export const CombinedUiSectionSchema = v.looseObject({
  schema_version: v.literal(1),
  scenarios: v.array(v.unknown()),
  coverage: v.array(v.unknown()),
  unresolved_interactions: v.array(v.unknown()),
  warnings: v.optional(v.array(v.unknown())),
  diagnostics: v.array(v.unknown()),
  summary: v.unknown(),
  completeness: v.unknown(),
});

export type CombinedUiSection = v.InferOutput<typeof CombinedUiSectionSchema>;

/** Hygiene combined output: requires `kind` plus `check` and/or `dupes`. */
export const CombinedSchema = v.pipe(
  v.looseObject({
    kind: v.literal('combined'),
    check: v.optional(DeadCodeIssueArraysSchema),
    dupes: v.optional(CombinedDupesSchema),
    health: v.optional(CombinedHealthSchema),
    ui: v.optional(CombinedUiSectionSchema),
  }),
  v.check(
    (value) => value.check !== undefined || value.dupes !== undefined,
    'combined Fallow JSON requires check or dupes',
  ),
);

/** Dedicated UI launch envelope from `fallow --only ui`. */
export const CombinedUiOnlySchema = v.looseObject({
  kind: v.literal('combined'),
  ui: CombinedUiSectionSchema,
});

/** Dead-code / cycles / boundaries root: requires explicit `kind: "dead-code"`. */
export const DeadCodeSchema = v.pipe(
  v.looseObject({
    kind: v.literal('dead-code'),
    ...DeadCodeIssueArraysObjectSchema.entries,
  }),
  v.check(
    (check) => check.total_issues !== undefined || knownDeadCodeIssueCount(check) > 0,
    'Fallow dead-code requires an issue summary or findings',
  ),
);

export const FallowErrorSchema = v.object({
  error: v.literal(true),
  message: v.optional(v.string()),
});

/** Parsed Fallow JSON root before category-specific schema validation. */
export type FallowStdoutJson = {
  readonly kind?: string;
};

/** Domain schema for Fallow tool stdout after JSON parse (object root). */
export const FallowStdoutJsonSchema = v.pipe(
  v.looseObject({}),
  v.transform((value): FallowStdoutJson => value),
);

export type DeadCodeIssueArrays = v.InferOutput<typeof DeadCodeIssueArraysObjectSchema>;
export type HealthOutput = v.InferOutput<typeof HealthSchema>;
export type CombinedOutput = v.InferOutput<typeof CombinedSchema>;

/** Count findings in standard and manifest-declared Fallow arrays. */
export function knownDeadCodeIssueCount(
  check: DeadCodeIssueArrays,
  additionalKeys: readonly string[] = [],
): number {
  return (
    check.circular_dependencies.length +
    check.re_export_cycles.length +
    check.unresolved_imports.length +
    check.boundary_violations.length +
    check.unused_exports.length +
    check.unused_files.length +
    check.unused_class_members.length +
    check.unused_dependencies.length +
    check.unused_dev_dependencies.length +
    check.unused_optional_dependencies.length +
    check.unused_enum_members.length +
    check.unused_types.length +
    check.unlisted_dependencies.length +
    check.duplicate_exports.length +
    check.type_only_dependencies.length +
    check.test_only_dependencies.length +
    check.dev_dependencies_in_production.length +
    Object.entries(check).reduce((count, [key, entry]) => {
      if (!additionalKeys.includes(key)) return count;
      const value = v.safeParse(v.array(v.unknown()), entry);
      return count + (value.success ? value.output.length : 0);
    }, 0)
  );
}
