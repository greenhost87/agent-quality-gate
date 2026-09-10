# Preset: `playwright`

Playwright Test house style for browser e2e. Independent of `database`.

```yaml
presets:
  - playwright
```

When active, verify requires Playwright Test as the e2e runner: `tests/e2e/**/*.pw.ts`, the `page` fixture, and `use.baseURL` plus `webServer` in `playwright.config.ts`. It rejects `bun:test` in e2e, `chromium.launch`, in-spec server `spawn`, DAO / `system/database` imports, and the Bun isolated-database hook.

This preset does not install Playwright and does not manage `playwright.config.ts`. The `webServer.command` stays project-owned.

Managed file `scripts/playwright-web-server.ts` is a comment stub that documents the intended Postgres + Testcontainers webServer flow; it is not a runnable starter. Verify checks its `contentHash` and refreshes the example under `.aqg/playwright/…`. Point `webServer.command` at a project-owned script (not this managed stub, and not under `tests/` or e2e).

## External network substitutions

`playwright/external-network-only` rejects interception of the application backend. By default no network substitution is allowed. Declare external provider origins in the trusted AQG configuration, not in the application repository:

```yaml
presetConfig:
  playwright:
    externalMockOrigins:
      - https://payments.example.com
```

Use direct `page.route('https://payments.example.com/**', handler)` calls. Relative URLs, wildcard hosts, regular expressions, predicates, computed matchers, and detached interception methods are rejected. HAR routing requires an explicit external `url` option. WebSocket routing follows the same policy with explicit `ws://` or `wss://` origins. Shared helpers importing `@playwright/test` are checked too. Never list an application origin as an external provider.

## Enable

A project that already depends on `@playwright/test`, or that has `tests/e2e/`, must also have a root Playwright config file. Missing config fails verify as `playwright-config:`.
