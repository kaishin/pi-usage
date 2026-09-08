---
type: Reference
title: Overview
description: What @kaishin/pi-usage does, who it is for, and what it deliberately does not do.
status: stable
generated: { by: human:kaishin, at: 2026-09-07T11:00:00Z }
tags: [overview, scope]
---

# Scope

`@kaishin/pi-usage` is a single-purpose [Pi](https://github.com/earendil-works/pi) extension that surfaces the active model's provider's quota / rate-limit state in two places:

1. **The footer**, via `ctx.ui.setFooter` — a single short segment appended to the existing TUI status line.
2. **A `/usage` command** — prints the same windows in a multi-line notification.

For v1.1.1 the only registered provider is `minimax` (the [MiniMax](https://MiniMax.io) Token Plan). Adding another provider is a one-file drop-in; see [Architecture](architecture.md).

# What it deliberately does not do

- **No session token accounting.** Token IO since session start is rendered by `@kaishin/pi-footer`, not here. The two extensions are siblings — install both for the full status line.
- **No automatic fallbacks between providers.** If the active model is `claude-sonnet-4.5` we say nothing; pi-usage only knows about MiniMax today.
- **No OAuth refresh flow.** MiniMax uses static API keys. If a future provider needs OAuth, that logic belongs inside its own provider module.
- **No persistent state.** Snapshots are cached in memory for 60 seconds and discarded. Quota history lives upstream (MiniMax's dashboard).

# Why this exists

`@latentminds/pi-quotas` already covers MiniMax (see PR [#41](https://github.com/latentminds-ai/pi-quotas/pull/41) authored alongside this package). The reasons to maintain a sibling package:

- **Smaller surface.** pi-quotas ships ten providers; pi-usage ships one and is therefore cheaper to audit.
- **Footer-only default.** pi-quotas' dashboard is rich but opt-in; pi-usage renders in the footer by default and offers a `/usage` command for the long form.
- **Owns its docs.** This OKF bundle lives in the same repo as the code, so docs cannot drift behind releases.

# Installation

```bash
# install via npm (when published)
pi install npm:@kaishin/pi-usage

# or from source while developing
pi install /path/to/pi-usage
```

After install, `pi /login minimax` registers the API key, and the footer gains the quota segment on the next session start.

# See also

- [Architecture](architecture.md)
- [Provider: MiniMax](providers/minimax.md)
- [@kaishin/pi-footer](https://github.com/kaishin/pi-footer) — companion extension that renders the rest of the footer
