# Bundle Update Log

## 2026-09-07
* **Fix**: Replaced the wrong `ui.setFooter(text, priority)` call with the correct factory API. The actual pi-coding-agent signature is `setFooter((tui, theme, footerData) => Component)` — the factory returns a pi-tui Component whose `render(width)` is invoked on each redraw. The previous call passed the pre-rendered string as the factory, which threw "factory is not a function" on every reload. Bumped to `1.1.1`.
* **Feature**: Added a `usage.json` config loader (`src/config.ts`) that gates the `/usage` command, `/minimax:usage` command, and footer status on the same feature toggles `@latentminds/pi-quotas` exposed under `quotas.json`. Bumped to `1.1.0`. The config file path is `~/.pi/agent/extensions/usage.json` and is intended to be rcm-tracked.
* **Release**: Bumped `@kaishin/pi-usage` from `0.1.0` to `1.0.0` for first public npm release. The API surface is small and intentional, docs are in place, and `pi-okf validate --strict` is clean; semver `0.x` no longer reflects reality.
* **Initialization**: Established the bundle with `okf_version: "0.2"`. Three concepts authored: `overview`, `architecture`, `providers/minimax`.
* **Creation**: Initial implementation of `@kaishin/pi-usage` v0.1.0 with MiniMax as the first registered provider.
