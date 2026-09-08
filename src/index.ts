/**
 * pi-usage main extension entry.
 *
 * Responsibilities:
 *   - On session start, identify the active provider and fetch a usage
 *     snapshot.
 *   - Render the result in the footer via ctx.ui.setFooter as a
 *     pi-tui Component (when usageStatus is enabled in usage.json).
 *   - Expose /usage (when usageCommand is enabled) and /minimax:usage
 *     (when providerCommands is enabled) slash commands.
 *
 * The fetcher is cached per-provider for 60s to avoid hammering the API
 * on every keystroke.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createUsageFooterComponent,
	renderUsageSegment,
	type UsageFooterState,
} from "./footer.js";
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
	setFooter(factory: (tui: any, theme: any, footerData: any) => unknown): void;
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

	// Module-level state for the footer Component. The factory reads from
	// this object on every render(width); the extension mutates it when
	// fresh quota data arrives, then calls requestRender to schedule a
	// redraw.
	const footerState: UsageFooterState = {
		displayName: undefined,
		windows: undefined,
	};
	let requestRender = (): void => undefined;

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

	async function installFooter(
		ctx: ContextLike,
		provider: Provider,
		outcome: ProviderFetchOutcome,
	): Promise<void> {
		// Update the footer state. If the fetch failed, leave windows
		// undefined so the Component renders an empty line rather than
		// leaking a stale segment.
		footerState.displayName = provider.displayName;
		footerState.windows = outcome.ok ? outcome.result.windows : undefined;

		ctx.ui.setFooter((tui, _theme, _footerData) => {
			// Capture the requestRender callback the TUI exposes. The
			// extension calls this after each state mutation.
			requestRender = () => tui.requestRender();
			return createUsageFooterComponent({
				getState: () => footerState,
				requestRender,
			});
		});

		// Force the first render now that state is populated.
		requestRender();
	}

	pi.on("session_start", async (_event, ctx) => {
		await configLoader.load();
		const config = configLoader.getConfig();
		const c = ctx as unknown as ContextLike;
		if (!config.usageStatus) return;

		const provider = await buildActive(c);
		if (!provider) return;
		const outcome = await fetchFresh(provider);
		cache.set(provider.id, { fetchedAt: Date.now(), outcome });
		await installFooter(c, provider, outcome);
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
		description: "Print the resolved usage.json config",
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
