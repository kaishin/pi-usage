/**
 * Provider registry. To add a new provider:
 *   1. Implement `Provider` in `src/providers/<id>.ts`.
 *   2. Add a builder entry below that pulls the credential via the
 *      provided `ApiKeyResolver` (with env fallback where applicable).
 */

import { MiniMaxProvider } from "./minimax.js";
import type { Provider } from "./types.js";

export type {
	Provider,
	QuotaWindow,
	ProviderFetchOutcome,
	ProviderFetchResult,
} from "./types.js";

/** Sync lookup of a previously-resolved API key. */
export type ApiKeyResolver = (providerId: string) => string | undefined;

/**
 * Builder for the provider that matches `ctx.model.provider`. Returns
 * `undefined` when no provider is registered for the active model — the
 * extension then no-ops rather than erroring.
 */
export function buildProviderFor(
	providerId: string | undefined,
	resolveApiKey: ApiKeyResolver,
): Provider | undefined {
	if (!providerId) return undefined;

	switch (providerId) {
		case "minimax":
			return new MiniMaxProvider({
				apiKey: resolveApiKey("minimax") ?? process.env.MINIMAX_API_KEY,
			});
		default:
			return undefined;
	}
}
