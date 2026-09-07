---
type: Reference
title: Architecture
description: Provider abstraction, footer rendering, lifecycle hooks, and extension entry point.
status: stable
generated: { by: human:kaishin, at: 2026-09-07T11:00:00Z }
tags: [architecture, code]
---

# Module map

```
src/
├── index.ts                 # Pi extension entry, registers hooks + commands
├── footer.ts                # renderUsageSegment(): short footer text
└── providers/
    ├── types.ts             # Provider, QuotaWindow, ProviderFetchOutcome
    ├── index.ts             # buildProviderFor(): registry + auth resolver
    └── minimax.ts           # MiniMaxProvider + parseMiniMaxUsage
```

# Provider abstraction

A provider implements `src/providers/types.ts:Provider` — four members:

```ts
interface Provider {
  readonly id: string;                  // matches ctx.model.provider
  readonly displayName: string;          // "MiniMax"
  readonly fallbackEnvVar?: string;      // e.g. "MINIMAX_API_KEY"
  fetch(signal?: AbortSignal): Promise<ProviderFetchOutcome>;
}
```

`ProviderFetchOutcome` is a discriminated union: `{ ok: true, result: { windows, limited? } }` or `{ ok: false, error }`. The fetcher owns its own HTTP, JSON parsing, and timeout — the rest of the package only deals in `QuotaWindow[]`.

# Adding a provider

1. Create `src/providers/<id>.ts` implementing `Provider`.
2. Add a case to `buildProviderFor` in `src/providers/index.ts` that pulls the credential via `resolveApiKey(authStorage, "<id>", "<ENV_VAR>")`.
3. Add a concept doc at `okf/concepts/providers/<id>.md` describing the endpoint contract.
4. Add tests under `test/providers/`.

No changes are required to `index.ts` or `footer.ts`.

# Footer rendering

`renderUsageSegment(displayName, windows, { availableWidth? })` produces a one-line summary. Rules:

- Windows are sorted by `windowSeconds` ascending so the most-imminent reset is primary.
- If any window has `limited: true`, the segment collapses to a single `Limited` line.
- Otherwise the primary and secondary windows are joined with `│`, unless `availableWidth` is below 38 columns.
- The `●` prefix matches `@kaishin/pi-footer`'s activity indicator so the two extensions render coherently.

The extension writes the segment via `ctx.ui.setFooter(segment, 1)` — priority 1 so it sits above pi's default status line but below any higher-priority overlay.

# Lifecycle

| Hook / command | Where | Purpose |
|---|---|---|
| `session_start` | `index.ts` | Fetch initial snapshot, write footer |
| `/usage` | `index.ts` | Force-refresh and print all windows |
| `/minimax:usage` | `index.ts` | Force-refresh the MiniMax provider specifically |

Snapshots are cached per-provider for 60 seconds (`CACHE_TTL_MS`). The cache lives in module scope and is dropped on extension reload.

# Auth

`buildProviderFor` calls `authStorage.getApiKey(providerId)` first and falls back to the provider's `fallbackEnvVar`. This matches the convention used by [`@latentminds/pi-quotas`](https://github.com/latentminds-ai/pi-quotas).

# See also

- [Overview](overview.md)
- [Provider: MiniMax](providers/minimax.md)
