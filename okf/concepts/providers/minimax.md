---
type: API Endpoint
title: Provider — MiniMax
description: MiniMax Token Plan usage endpoint, auth, response shape, and parsing rules.
status: stable
generated: { by: human:kaishin, at: 2026-09-07T11:00:00Z }
verified: { by: human:kaishin, at: 2026-09-07T11:00:00Z }
tags: [provider, minimax, api]
sources:
  - id: minimax-coding-plan
    resource: https://api.minimax.io/v1/api/openplatform/coding_plan/remains
    title: MiniMax Token Plan — coding_plan/remains
    last_modified: 2026-08-01
  - id: pi-catalog
    resource: https://github.com/latentminds-ai/pi-quotas
    title: latentminds/pi-quotas — parseMiniMaxUsage
    author: human:kaishin
    last_modified: 2026-09-07
---

# Endpoint

| | |
|---|---|
| Method | `GET` |
| URL | `https://api.minimax.io/v1/api/openplatform/coding_plan/remains` |
| Auth | `Authorization: Bearer <MINIMAX_API_KEY>` |
| Timeout | 15 s |
| Provider id | `minimax` (matches pi's `ctx.model.provider`) |

China-region accounts should override the host to `api.minimaxi.com`. That swap is not yet wired up — flagged as a follow-up.

# Request

```http
GET /v1/api/openplatform/coding_plan/remains HTTP/1.1
Host: api.minimax.io
Authorization: Bearer sk-cp-…
Accept: application/json
```

No body. No query parameters.

# Response

```json
{
  "model_remains": [
    {
      "start_time": 1788757200000,
      "end_time": 1788775200000,
      "remains_time": 906292,
      "current_interval_total_count": 1000,
      "current_interval_usage_count": 530,
      "model_name": "general",
      "current_weekly_total_count": 7000,
      "current_weekly_usage_count": 1234,
      "weekly_start_time": 1788739200000,
      "weekly_end_time": 1789344000000,
      "weekly_remains_time": 569706292,
      "current_interval_status": 1,
      "current_interval_remaining_percent": 47,
      "current_weekly_status": 3,
      "current_weekly_remaining_percent": 100
    }
  ],
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

# Field reference

| Field | Meaning |
|---|---|
| `model_remains[]` | One entry per model class. Observed: `general`, `video`. |
| `model_name` | Class label used as the window label base. |
| `start_time`, `end_time` | Rolling interval (typically 5h) start / reset, epoch ms. |
| `weekly_start_time`, `weekly_end_time` | Weekly window start / reset, epoch ms. |
| `remains_time`, `weekly_remains_time` | Milliseconds until reset (redundant with `end_time` but cheaper to read). |
| `*_total_count`, `*_usage_count` | Coarse counts. Often 0 on the rolling window when the interval has just started. |
| `*_status` | Observed enum: `1` = limited, `3` = healthy. Surfaced as `QuotaWindow.limited`. |
| `*_remaining_percent` | **Remaining** (0–100), not used. Inverted in the parser. |

# Parsing rules

`parseMiniMaxUsage` lives in the package's `src/providers/minimax.ts`:

1. Skip entries missing `start_time` / `end_time` (or weekly equivalents).
2. Derive `windowSeconds` from `end_time - start_time` (and weekly equivalents). Do not hardcode 5h or 7d.
3. Convert each `*_remaining_percent` to `usedPercent = clamp(100 - remaining, 0, 100)`.
4. Sort windows: shortest window first, then alphabetical by label.

# Failure modes

| HTTP | `base_resp.status_code` | Behavior |
|---|---|---|
| non-2xx | any | Returns `{ ok: false, error: <body or status> }`. |
| 200 | `0` | Success. |
| 200 | non-zero | Returns `{ ok: false, error: <status_msg> }`. Without this branch the dashboard would silently show empty windows. |

# Auth resolution

1. `authStorage.getApiKey("minimax")` (set by `pi /login minimax`).
2. `process.env.MINIMAX_API_KEY`.

# Open questions

- **China region**: `api.minimaxi.com` is documented but not yet wired. Track in [Architecture](../architecture.md) "Adding a provider" once resolved.
- **Per-model class windows**: each `model_name` currently produces two windows (`general`, `general / wk`). Users with multi-class plans may want per-model subtitles. Deferred.
