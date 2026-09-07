/**
 * pi-usage main extension entry.
 *
 * Responsibilities:
 *   - On session start, identify the active provider and fetch a usage
 *     snapshot.
 *   - Render the result in the footer via `ctx.ui.setFooter` (when
 *     `usageStatus` is enabled in `usage.json`).
 *   - Expose `/usage` (when `usageCommand` is enabled) and `/minimax:usage`
 *     (when `providerCommands` is enabled) slash commands.
 *
 * The fetcher is cached per-provider for 60s to avoid hammering the API on
 * every keystroke.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderUsageSegment } from "./footer.js";
import { configLoader } from "./config.js";
import { buildProviderFor } from "./providers/index.js";
import type {
	Provider,
	ProviderFetchOutcome,
} from "./providers/index.js";

const CACHE_TTL_MS = 60_000;

interface CachedSnapshot {
	fetchedAt: number;
	outcome: ProviderFetchOutcome;
}

function isStale(snapshot: CachedSnapshot | undefined): boolean {
	if (!snapshot) return true;
	return Date.now() - snapshot.fetchedAt > CACHE_TTL_MS;
}

function describeOutcome(
	displayName: string,
	outcome: ProviderFetchOutcome,
): string | undefined {
	if (!outcome.ok) return undefined;
	return renderUsageSegment(displayName, outcome.result.windows);
}

async function fetchFresh(provider: Provider): Promise<ProviderFetchOutcome> {
	try {
		return await provider.fetch();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}

type ModelRegistryLike = {
	getApiKeyForProvider(provider: string): Promise<string | undefined>;
};

type ModelLike = {
	provider?: string;
};

type UiLike = {
	setFooter(text: string, priority: number): void;
	notify(message: string, kind: string): void;
};

type ContextLike = {
	model?: ModelLike;
	modelRegistry: ModelRegistryLike;
	ui: UiLike;
};

function formatWindows(
	displayName: string,
	outcome: Extract<ProviderFetchOutcome, { ok: true }>,
): string {
	const lines = outcome.result.windows.map(
		(w) =>
			`  ${w.label}  ${Math.round(w.usedPercent)}%` +
			`${w.limited ? "  Limited" : ""}`,
	);
	return `${displayName}\n${lines.join("\n")}`;
}

export default function piUsage(pi: ExtensionAPI): void {
	const cache = new Map<string, CachedSnapshot>();

	async function resolveKeys(
		ctx: ContextLike,
		providerIds: string[],
	): Promise<Map<string, string | undefined>> {
		const out = new Map<string, string | undefined>();
		await Promise.all(
			providerIds.map(async (id) => {
				out.set(id, await ctx.modelRegistry.getApiKeyForProvider(id));
			}),
		);
		return out;
	}

	function syncResolver(keys: Map<string, string | undefined>) {
		return (id: string) => keys.get(id);
	}

	async function snapshotFor(
		providerId: string,
		ctx: ContextLike,
		force = false,
	): Promise<{ provider: Provider; segment: string } | undefined> {
		const cached = cache.get(providerId);
		if (!force && !isStale(cached)) {
			const keys = await resolveKeys(ctx, [providerId]);
			const provider = buildProviderFor(providerId, syncResolver(keys));
			if (!provider) return undefined;
			const segment = describeOutcome(provider.displayName, cached!.outcome);
			return segment ? { provider, segment } : undefined;
		}

		const keys = await resolveKeys(ctx, [providerId]);
		const provider = buildProviderFor(providerId, syncResolver(keys));
		if (!provider) return undefined;

		const outcome = await fetchFresh(provider);
		cache.set(providerId, { fetchedAt: Date.now(), outcome });
		const segment = describeOutcome(provider.displayName, outcome);
		return segment ? { provider, segment } : undefined;
	}

	async function snapshotForProvider(
		ctx: ContextLike,
		provider: Provider,
		force = false,
	): Promise<ProviderFetchOutcome> {
		const cached = cache.get(provider.id);
		if (!force && !isStale(cached)) return cached!.outcome;
		const outcome = await fetchFresh(provider);
		cache.set(provider.id, { fetchedAt: Date.now(), outcome });
		return outcome;
	}

	async function buildActive(ctx: ContextLike): Promise<Provider | undefined> {
		const providerId = ctx.model?.provider;
		if (!providerId) return undefined;
		const keys = await resolveKeys(ctx, [providerId]);
		return buildProviderFor(providerId, syncResolver(keys));
	}

	pi.on("session_start", async (_event, ctx) => {
		await configLoader.load();
		const config = configLoader.getConfig();
		if (!config.usageStatus) return;

		const provider = await buildActive(ctx as unknown as ContextLike);
		if (!provider) return;
		const outcome = await fetchFresh(provider);
		cache.set(provider.id, { fetchedAt: Date.now(), outcome });
		const segment = describeOutcome(provider.displayName, outcome);
		if (segment) (ctx as unknown as ContextLike).ui.setFooter(segment, 1);
	});

	pi.registerCommand("usage", {
		description: "Display remaining quota for the active provider",
		handler: async (_args, ctx) => {
			await configLoader.load();
			const config = configLoader.getConfig();
			const c = ctx as unknown as ContextLike;

			if (!config.usageCommand) {
				c.ui.notify(
					"`/usage` is disabled. Re-enable it in ~/.pi/agent/extensions/usage.json.",
					"warning",
				);
				return;
			}

			const provider = await buildActive(c);
			if (!provider) {
				const active = c.model?.provider ?? "(none)";
				c.ui.notify(
					`No usage tracker registered for provider "${active}"`,
					"warning",
				);
				return;
			}
			const outcome = await snapshotForProvider(c, provider, true);
			if (!outcome.ok) {
				c.ui.notify(`${provider.displayName}: ${outcome.error}`, "info");
				return;
			}
			c.ui.notify(formatWindows(provider.displayName, outcome), "info");
		},
	});

	pi.registerCommand("minimax:usage", {
		description: "Display remaining MiniMax quotas",
		handler: async (_args, ctx) => {
			await configLoader.load();
			const config = configLoader.getConfig();
			const c = ctx as unknown as ContextLike;

			if (!config.providerCommands) {
				c.ui.notify(
					"Per-provider usage commands are disabled. Re-enable `providerCommands` in ~/.pi/agent/extensions/usage.json.",
					"warning",
				);
				return;
			}

			const keys = await resolveKeys(c, ["minimax"]);
			const provider = buildProviderFor("minimax", syncResolver(keys));
			if (!provider) {
				c.ui.notify("MiniMax provider is not configured", "warning");
				return;
			}
			const outcome = await snapshotForProvider(c, provider, true);
			if (!outcome.ok) {
				c.ui.notify(`MiniMax: ${outcome.error}`, "info");
				return;
			}
			c.ui.notify(formatWindows("MiniMax", outcome), "info");
		},
	});

	pi.registerCommand("usage:settings", {
		description: "Open usage.json in $EDITOR (or print the resolved config)",
		handler: async (_args, ctx) => {
			const c = ctx as unknown as ContextLike;
			await configLoader.load();
			const config = configLoader.getConfig();
			const lines = [
				`configVersion:     ${config.configVersion}`,
				`usageCommand:      ${config.usageCommand}`,
				`providerCommands:  ${config.providerCommands}`,
				`usageStatus:       ${config.usageStatus}`,
				`quotaWarnings:     ${config.quotaWarnings}`,
				`deferToSynthetic:  ${config.deferToSynthetic}`,
			];
			c.ui.notify(lines.join("\n"), "info");
		},
	});
}
