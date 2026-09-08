# @kaishin/pi-usage

Standalone [Pi](https://github.com/earendil-works/pi) extension that renders the active model's provider quota state in the footer and exposes a `/usage` command.

v1.1.1 ships with **MiniMax** as the only registered provider. Adding more providers is a one-file drop-in — see [`okf/concepts/architecture.md`](okf/concepts/architecture.md).

## What it renders

A single short segment appended to the existing TUI footer, e.g.:

```
● MiniMax  general 53% (4h 12m) │ wk 18% (5d)
● MiniMax  general 100% Limited
```

The `●` prefix matches [@kaishin/pi-footer](https://github.com/kaishin/pi-footer)'s activity indicator so the two extensions render coherently.

## Install

```bash
# From npm (when published)
pi install npm:@kaishin/pi-usage

# Or from source while developing
pi install /path/to/pi-usage
```

After install, register the credential once:

```bash
pi /login minimax
# paste your MINIMAX_API_KEY (also accepted from the MINIMAX_API_KEY env var)
```

Restart or `/reload` and the footer gains the segment on the next session start.

## Commands

| Command | What |
|---|---|
| `/usage` | Force-refresh the active provider and print all quota windows in a notification |
| `/minimax:usage` | Force-refresh MiniMax explicitly (works even if the active model is a different provider) |

## Test

```bash
npm install
npm test           # vitest run
npm run check      # tsc --noEmit
```

Coverage:

- `parseMiniMaxUsage` — inversion (remaining→used), limited status, clamp, sort, malformed input
- `MiniMaxProvider.fetch` — missing key, `base_resp.status_code != 0`, healthy response
- `renderUsageSegment` — empty, single window, primary+secondary, narrow width, limited state

## Bundle documentation

This package ships an [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog) bundle under [`okf/`](okf/):

- [`okf/index.md`](okf/index.md) — bundle root
- [`okf/concepts/overview.md`](okf/concepts/overview.md) — what this package does and what it deliberately does not
- [`okf/concepts/architecture.md`](okf/concepts/architecture.md) — provider abstraction, footer rendering, lifecycle
- [`okf/concepts/providers/minimax.md`](okf/concepts/providers/minimax.md) — MiniMax endpoint contract

The bundle lives next to the code so docs cannot drift behind releases.

## Origin

Forked from a MiniMax-only slice of the upstream [@latentminds/pi-quotas](https://github.com/latentminds-ai/pi-quotas) PR [#41](https://github.com/latentminds-ai/pi-quotas/pull/41), trimmed to a single provider and a footer-first render path, then re-shaped around an OKF bundle so the docs, the code, and the endpoint contract all live in one place.

## License

MIT
