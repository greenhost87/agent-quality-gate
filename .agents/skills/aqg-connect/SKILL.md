---
name: aqg-connect
description: Onboard a project into Agent Quality Gate (AQG) or revise its global project entry.
---

# AQG connection

Produce one evidence-based global project entry, prove that AQG selects it, and keep the target repository read-only.

## Procedure

1. **Establish the target.** Resolve one canonical absolute project root and record its initial Git status. Ask the user only when no root was supplied or more than one remains plausible. Complete this step with exactly one root and an initial-state record.
2. **Derive the project entry.** Read the target's applicable agent instructions and the minimum manifests, tool configuration, and source tree needed to identify its TypeScript/JavaScript production/runtime entries, generated or vendored paths, and architecture. Then read the active global config, AQG's supported-project-fields documentation in [`docs/configuration.md`](../../../docs/configuration.md), and the manifest plus README of each preset under consideration. A project without TypeScript/JavaScript runtime entries needs a supported verification path before onboarding can complete. Complete this step with every proposed field justified by target evidence and the owning AQG contract.
3. **Update global policy.** Edit `$AGENT_QUALITY_GATE_HOME/config.yaml`, using `~/.agent-quality-gate/config.yaml` when the variable is unset. Preserve unrelated configuration and leave exactly one `projects` item whose `root` equals the canonical target root. For read-only onboarding, set both effective `autoFix` options to `false`, overriding `projectDefaults` where needed. Complete this step when the resulting YAML retains all unrelated data and the effective project entry matches the decisions below.
4. **Validate from the AQG checkout.** Run:

   ```sh
   bun run verify:cwd -- /absolute/project/root
   ```

   Before running the command, inspect enabled preset preflights for writes. Database presets restore changed or deleted committed migrations, even with auto-fix disabled; existing migration changes therefore block read-only validation and must be reported without running that preflight. Complete this step only after the command has selected the configured project rather than skipping it.

5. **Classify the result.** `verify: ok` and ordinary AQG findings are successful connection signals. A skipped or unconfigured project, invalid effective configuration, incompatible preset, or AQG infrastructure failure is an incomplete connection: repair only the connection and rerun step 4. Complete this step with one classified final result.
6. **Prove the boundary.** Inspect the final effective global entry and compare the target's final Git status with the initial record. If onboarding changed the AQG checkout, run its required completion check. Complete onboarding only when the exact root remains configured, the target has no onboarding changes, and all required AQG-checkout checks pass.

## Project-entry decisions

- Treat [`docs/configuration.md`](../../../docs/configuration.md), [`system/configs/global-config.yaml`](../../../system/configs/global-config.yaml), and preset manifests/readmes as the configuration source of truth. Nearby project entries show local conventions only; derive this target independently.
- Choose entries that represent real TypeScript/JavaScript production, public, or runtime roots. Include each enabled preset's managed production file at its resolved destination. Keep tests, fixtures, examples, generated output, dependencies, migrations, and test support outside the entry set unless the preset contract explicitly requires them.
- Activate a preset only when its contract matches the observed architecture. Resolve transitive requirements, compatibility, managed destinations, and options before editing the entry.
- Derive layout placement roots, depth, and test-colocation policy from the actual tree. Retain existing project-specific policy only while the target still supports it.
- Reserve `ignorePatterns` for generated, vendored, or independently out-of-scope paths. Keep the evidence-based entry, presets, options, and ignores stable when validation reports policy findings.

## Target boundary

Keep onboarding writes in the global AQG config. Preserve target dependencies, source, tests, tooling, package scripts, agent instructions, and local lint configuration exactly as found. Preserve all pre-existing target changes.

## Report

State the global config path, canonical project root, classification from step 5, and whether the target worktree remained unchanged. For ordinary findings, report them without remediation; for a blocker, identify the configuration or infrastructure cause.
