# Preset: `playwright`

Playwright Test house style for browser e2e. Independent of `database`.

```yaml
presets:
  playwright:
    e2eDirectory: tests/e2e
```

Set `e2eDirectory` to the project-relative E2E directory. Its default is empty, so directory-scoped runner and black-box checks are inactive until configured. In that directory, the runner rule accepts `*.pw.{js,jsx,ts,tsx}`, `*.helpers.{js,jsx,ts,tsx}`, and `*.types.ts` files. It rejects named `test`/`it`/`describe` imports from `bun:test`, direct `chromium`/`firefox`/`webkit.launch()` calls, `Bun.spawn`, child-process imports, and imports of the Bun isolated-database helper. The black-box rule rejects DAO and `system/database` imports. Use Playwright's `page` fixture to drive the application.

`processRunnerImports` optionally lists additional exact module specifiers rejected in the configured E2E directory. The config rule checks `use.baseURL` and `webServer` on a default-exported object or inline `defineConfig({ ... })` object; other configuration shapes are not inspected by that rule.

This preset does not install Playwright and does not manage `playwright.config.ts`. The `webServer.command` stays project-owned.

Point `webServer.command` at a project-owned script outside `tests/` and the configured E2E directory. The generated `.aqg/hints/presets/playwright/playwright-e2e.md` gives general black-box, baseURL, webServer, and external-origin guidance.

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

With this preset active, a project that declares `@playwright/test` in a dependency section, or whose configured `e2eDirectory` exists, must have a root `playwright.config.ts`, `.mts`, `.cts`, `.js`, `.mjs`, or `.cjs` file. Missing config produces `playwright/config`. An unconfigured `tests/e2e/` directory alone does not trigger this preflight.
