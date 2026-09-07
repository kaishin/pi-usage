/**
 * Provider abstraction for pi-usage.
 *
 * A provider knows how to:
 *   1. Identify itself from the active pi session's `ctx.model.provider`.
 *   2. Pull an access token from the auth storage registered for it.
 *   3. Fetch the upstream usage/quota payload.
 *   4. Parse that payload into one or more QuotaWindow values.
 *
 * To add a new provider:
 *   - implement the `Provider` interface below
 *   - register it in `src/providers/index.ts` (PROVIDERS)
 *   - add a concept doc under `okf/concepts/providers/<id>.md`
 */

export interface QuotaWindow {
	/** Provider id, e.g. "minimax". */
	provider: string;
	/** Short label for display, e.g. "general" or "general / wk". */
	label: string;
	/** 0–100. The dashboard interprets this as *consumed* (used). */
	usedPercent: number;
	/** When this window resets. */
	resetsAt: Date;
	/** Window length in seconds (used for pace / progress rendering). */
	windowSeconds: number;
	/** Optional coarse-grained counts if the upstream supplies them. */
	usedValue?: number;
	limitValue?: number;
	/** True when the upstream reports the account as rate-limited / exhausted. */
	limited?: boolean;
	/** Set to render a pace indicator in the footer. */
	showPace?: boolean;
	/** Render label, e.g. "Resets" or "Limited". */
	nextLabel?: string;
}

export interface ProviderFetchResult {
	windows: QuotaWindow[];
	/** True if the upstream says the account is in a hard limited state. */
	limited?: boolean;
	/** Human-readable summary for the footer when no rich render is needed. */
	summary?: string;
}

export type ProviderFetchOutcome =
	| { ok: true; result: ProviderFetchResult }
	| { ok: false; error: string };

export interface Provider {
	/** Provider id, must match pi's `ctx.model.provider`. */
	readonly id: string;
	/** Human-readable display name, e.g. "MiniMax". */
	readonly displayName: string;
	/** Env var to fall back to if no credential is stored in pi's auth storage. */
	readonly fallbackEnvVar?: string;
	/** Fetch the live usage/quota state for this provider. */
	fetch(signal?: AbortSignal): Promise<ProviderFetchOutcome>;
}
