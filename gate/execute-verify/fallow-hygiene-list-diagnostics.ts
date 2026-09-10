import type { Diagnostic, DiagnosticLocation } from './check-result.js';
import type { CombinedOutput, DeadCodeIssueArrays } from './fallow-json-schemas.js';

type NamedMemberIssue = {
  path: string;
  line?: number;
  col?: number;
  parent_name?: string;
  class_name?: string;
  enum_name?: string;
  member_name?: string;
  member?: string;
};

export function locationFromPathLineCol(
  path: string,
  line: number | undefined,
  col: number | undefined,
): DiagnosticLocation {
  return {
    path,
    ...(line === undefined ? {} : { line }),
    ...(col === undefined ? {} : { column: col }),
  };
}

function memberDisplayName(
  parentName: string | undefined,
  alternateParent: string | undefined,
  memberName: string | undefined,
  alternateMember: string | undefined,
  fallback: string,
): string {
  const parent = parentName ?? alternateParent;
  const member = memberName ?? alternateMember;
  const name = [parent, member].filter(Boolean).join('.');
  return name.length > 0 ? name : fallback;
}

function namedMemberDiagnostics(
  items: readonly NamedMemberIssue[],
  ruleId: string,
  fallback: string,
  alternateParentOf: (item: NamedMemberIssue) => string | undefined,
): Diagnostic[] {
  return items.map((item) => ({
    source: 'fallow',
    ruleId,
    severity: 'error' as const,
    message: memberDisplayName(
      item.parent_name,
      alternateParentOf(item),
      item.member_name,
      item.member,
      fallback,
    ),
    location: locationFromPathLineCol(item.path, item.line, item.col),
  }));
}

export function unusedListDiagnostics(check: DeadCodeIssueArrays): Diagnostic[] {
  return [
    ...check.unused_exports.map((unused) => ({
      source: 'fallow' as const,
      ruleId: 'unused-export',
      severity: 'error' as const,
      message: unused.export_name ?? 'unused export',
      location: locationFromPathLineCol(unused.path, unused.line, unused.col),
    })),
    ...check.unused_files.map((file) => ({
      source: 'fallow' as const,
      ruleId: 'unused-file',
      severity: 'error' as const,
      message: 'unused file',
      location: { path: file.path },
    })),
    ...namedMemberDiagnostics(
      check.unused_class_members,
      'unused-class-member',
      'unused class member',
      (item) => item.class_name,
    ),
    ...dependencyPackageDiagnostics(check.unused_dependencies, 'unused-dependency'),
    ...dependencyPackageDiagnostics(check.unused_dev_dependencies, 'unused-dev-dependency'),
    ...dependencyPackageDiagnostics(
      check.unused_optional_dependencies,
      'unused-optional-dependency',
    ),
    ...check.dev_dependencies_in_production.map((dep) => ({
      source: 'fallow' as const,
      ruleId: 'dev-dep-in-prod',
      severity: 'error' as const,
      message: dep.package_name ?? dep.name ?? 'dependency',
      ...(dep.path === undefined ? {} : { location: { path: dep.path } }),
      groupHeader: 'dev-dep-in-prod',
    })),
    ...namedMemberDiagnostics(
      check.unused_enum_members,
      'unused-enum-member',
      'unused enum member',
      (item) => item.enum_name,
    ),
    ...check.unused_types.map((unused) => ({
      source: 'fallow' as const,
      ruleId: 'unused-type',
      severity: 'error' as const,
      message: unused.type_name ?? unused.export_name ?? unused.name ?? 'unused type',
      location: locationFromPathLineCol(unused.path, unused.line, unused.col),
    })),
    ...multiSiteDiagnostics(
      check.unlisted_dependencies.map((dep) => ({
        message: dep.package_name,
        sites: dep.imported_from,
      })),
      'unlisted-dependency',
      'import-site',
    ),
    ...multiSiteDiagnostics(
      check.duplicate_exports.map((item) => ({
        message: item.export_name,
        sites: item.locations,
      })),
      'duplicate-export',
      'duplicate-export',
      'duplicate-export',
    ),
    ...dependencyPackageDiagnostics(check.type_only_dependencies, 'type-only-dependency'),
    ...dependencyPackageDiagnostics(check.test_only_dependencies, 'test-only-dependency'),
  ];
}

type DependencyPackage = {
  name?: string;
  package_name?: string;
  path?: string;
  line?: number;
};

type PathLineColSite = {
  path: string;
  line?: number;
  col?: number;
};

function dependencyPackageDiagnostics(
  items: readonly DependencyPackage[],
  ruleId: string,
): Diagnostic[] {
  return items.map((dep) => ({
    source: 'fallow' as const,
    ruleId,
    severity: 'error' as const,
    message: dep.package_name ?? dep.name ?? 'dependency',
    ...(dep.path === undefined
      ? {}
      : { location: locationFromPathLineCol(dep.path, dep.line, undefined) }),
  }));
}

function multiSiteDiagnostics(
  items: readonly { message: string; sites: readonly PathLineColSite[] }[],
  ruleId: string,
  relatedRole: string,
  groupHeader?: string,
): Diagnostic[] {
  return items.map((item) => {
    const primary = item.sites[0];
    const related = item.sites.slice(1).map((site) => ({
      ...locationFromPathLineCol(site.path, site.line, site.col),
      role: relatedRole,
    }));
    return {
      source: 'fallow' as const,
      ruleId,
      severity: 'error' as const,
      message: item.message,
      ...(primary === undefined
        ? {}
        : { location: locationFromPathLineCol(primary.path, primary.line, primary.col) }),
      ...(related.length === 0 ? {} : { related }),
      ...(groupHeader === undefined ? {} : { groupHeader }),
    };
  });
}

export function codeDuplicationDiagnostics(output: CombinedOutput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const group of output.dupes?.clone_groups ?? []) {
    const locations = group.instances.map((instance) => ({
      path: instance.file,
      line: instance.start_line,
      ...(instance.end_line === undefined ? {} : { endLine: instance.end_line }),
    }));
    const [location, ...related] = locations;
    if (location === undefined) continue;
    diagnostics.push({
      source: 'fallow',
      ruleId: 'code-duplication',
      severity: 'error',
      message: 'duplicate block',
      location,
      related: related.map((site) => ({ ...site, role: 'clone' })),
      groupHeader: 'code-duplication',
    });
  }
  return diagnostics;
}
