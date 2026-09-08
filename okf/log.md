# Bundle Update Log

## 2026-09-07
* **Fix**: Prettier `/usage` dashboard with progress bars (16-char `█`/`░` blocks) and severity coloring (green <80%, yellow 80–89%, red ≥90% or `limited`). Bumped to `1.1.2`. The previous output was bare `label N%` lines that didn't match the visual richness of the upstream pi-quotas dashboard.
* **Fix**: Replaced the wrong `ui.setFooter(text, priority)` call with the correct factory API; bumped to `1.1.1`.
* **Feature**: Added a `usage.json` config loader (`src/config.ts`) that gates the `/usage` command, `/minimax:usage` command, and footer status on the same feature toggles `@latentminds/pi-quotas` exposed under `quotas.json`. Bumped to `1.1.0`. The config file path is `~/.pi/agent/extensions/usage.json` and is intended to be rcm-tracked.
* **Release**: Bumped `@kaishin/pi-usage` from `0.1.0` to `1.0.0` for first public npm release. The API surface is small and intentional, docs are in place, and `pi-okf validate --strict` is clean; semver `0.x` no longer reflects reality.
* **Initialization**: Established the bundle with `okf_version: "0.2"`. Three concepts authored: `overview`, `architecture`, `providers/minimax`.
* **Creation**: Initial implementation of `@kaishin/pi-usage` v0.1.0 with MiniMax as the first registered provider.
