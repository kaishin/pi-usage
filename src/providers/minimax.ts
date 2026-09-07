/**
 * MiniMax (minimax provider id in pi) Token Plan usage.
 *
 * Endpoint: `GET https://api.minimax.io/v1/api/openplatform/coding_plan/remains`
 * Auth:     `Authorization: Bearer <MINIMAX_API_KEY>`
 *
 * Response shape (one entry per model class — observed: "general", "video"):
 *
 *   {
 *     model_remains: [
 *       {
 *         start_time: number,                          // ms epoch, interval start
 *         end_time: number,                            // ms epoch, interval reset
 *         remains_time: number,                        // ms until reset
 *         current_interval_total_count: number,
 *         current_interval_usage_count: number,
 *         model_name: string,                          // "general" | "video" | ...
 *         current_weekly_total_count: number,
 *         current_weekly_usage_count: number,
 *         weekly_start_time: number,                   // ms epoch
 *         weekly_end_time: number,                     // ms epoch
 *         weekly_remains_time: number,
 *         current_interval_status: number,             // 1 = limited, 3 = healthy (observed)
 *         current_interval_remaining_percent: number,  // 0–100, REMAINING (not used)
 *         current_weekly_status: number,
 *         current_weekly_remaining_percent: number,    // 0–100, REMAINING
 *       },
 *       ...
 *     ],
 *     base_resp: { status_code: number, status_msg: string }
 *   }
 *
 * Important: `*_remaining_percent` is "remaining", not "used". We invert to
 * `usedPercent` so the dashboard, progress bar, and warnings render healthy
 * vs exhausted accounts the right way around.
 */

import type {
	Provider,
	ProviderFetchOutcome,
	QuotaWindow,
} from "./types.js";

export type { Provider, ProviderFetchOutcome, QuotaWindow } from "./types.js";

const ENDPOINT = "https://api.minimax.io/v1/api/openplatform/coding_plan/remains";
const TIMEOUT_MS = 15_000;

function remainingToUsedPercent(remaining: unknown): number {
	const n = Number(remaining);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(100, 100 - n));
}

interface MiniMaxModelRemains {
	start_time?: number;
	end_time?: number;
	remains_time?: number;
	current_interval_total_count?: number;
	current_interval_usage_count?: number;
	model_name?: string;
	current_weekly_total_count?: number;
	current_weekly_usage_count?: number;
	weekly_start_time?: number;
	weekly_end_time?: number;
	weekly_remains_time?: number;
	current_interval_status?: number;
	current_interval_remaining_percent?: number;
	current_weekly_status?: number;
	current_weekly_remaining_percent?: number;
}

interface MiniMaxResponse {
	model_remains?: MiniMaxModelRemains[] | null;
	base_resp?: { status_code?: number; status_msg?: string };
}

export function parseMiniMaxUsage(data: MiniMaxResponse): QuotaWindow[] {
	const windows: QuotaWindow[] = [];
	const models = Array.isArray(data?.model_remains) ? data.model_remains : [];

	for (const entry of models) {
		if (!entry || typeof entry !== "object") continue;
		const labelBase = String(entry.model_name ?? "Tokens");

		// Rolling interval window.
		if (
			typeof entry.start_time === "number" &&
			typeof entry.end_time === "number" &&
			entry.end_time > entry.start_time &&
			entry.current_interval_remaining_percent != null
		) {
			const windowSeconds = Math.round(
				(entry.end_time - entry.start_time) / 1000,
			);
			const limited = entry.current_interval_status === 1;
			windows.push({
				provider: "minimax",
				label: labelBase,
				usedPercent: remainingToUsedPercent(
					entry.current_interval_remaining_percent,
				),
				resetsAt: new Date(entry.end_time),
				windowSeconds,
				usedValue: Number(entry.current_interval_usage_count ?? 0),
				limitValue: Number(entry.current_interval_total_count ?? 0),
				limited,
				showPace: true,
				nextLabel: limited ? "Limited" : "Resets",
			});
		}

		// Weekly window. windowSeconds already spans the full seven-day period
		// so paceScale is left at the default (none) — see providers.ts in
		// upstream pi-quotas for the same reasoning.
		if (
			typeof entry.weekly_start_time === "number" &&
			typeof entry.weekly_end_time === "number" &&
			entry.weekly_end_time > entry.weekly_start_time &&
			entry.current_weekly_remaining_percent != null
		) {
			const windowSeconds = Math.round(
				(entry.weekly_end_time - entry.weekly_start_time) / 1000,
			);
			const limited = entry.current_weekly_status === 1;
			windows.push({
				provider: "minimax",
				label: `${labelBase} / wk`,
				usedPercent: remainingToUsedPercent(
					entry.current_weekly_remaining_percent,
				),
				resetsAt: new Date(entry.weekly_end_time),
				windowSeconds,
				usedValue: Number(entry.current_weekly_usage_count ?? 0),
				limitValue: Number(entry.current_weekly_total_count ?? 0),
				limited,
				showPace: true,
				nextLabel: limited ? "Limited" : "Resets",
			});
		}
	}

	// Stable ordering: shortest window first, then alphabetical by label.
	windows.sort((a, b) => {
		if (a.windowSeconds !== b.windowSeconds) {
			return a.windowSeconds - b.windowSeconds;
		}
		return a.label.localeCompare(b.label);
	});

	return windows;
}

interface MiniMaxProviderOptions {
	/** Resolved API key — typically pulled from pi's auth storage or env. */
	apiKey?: string;
}

export class MiniMaxProvider implements Provider {
	readonly id = "minimax";
	readonly displayName = "MiniMax";
	readonly fallbackEnvVar = "MINIMAX_API_KEY";

	private readonly apiKey: string | undefined;

	constructor(opts: MiniMaxProviderOptions) {
		this.apiKey = opts.apiKey;
	}

	async fetch(signal?: AbortSignal): Promise<ProviderFetchOutcome> {
		if (!this.apiKey) {
			return {
				ok: false,
				error: "No MiniMax API key (run `pi /login minimax` or set MINIMAX_API_KEY)",
			};
		}

		const signals: AbortSignal[] = [AbortSignal.timeout(TIMEOUT_MS)];
		if (signal) signals.push(signal);
		const combined = AbortSignal.any(signals);

		let response: Response;
		try {
			response = await fetch(ENDPOINT, {
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					Accept: "application/json",
				},
				signal: combined,
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Network error";
			return { ok: false, error: message };
		}

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			return {
				ok: false,
				error: body.trim() || `HTTP ${response.status}`,
			};
		}

		let data: MiniMaxResponse;
		try {
			data = (await response.json()) as MiniMaxResponse;
		} catch {
			return { ok: false, error: "MiniMax returned non-JSON response" };
		}

		// The MiniMax API returns HTTP 200 even for logical failures; surface
		// those as an explicit error so we never silently emit empty windows.
		const statusCode = Number(data?.base_resp?.status_code ?? 0);
		if (statusCode !== 0) {
			return {
				ok: false,
				error:
					data?.base_resp?.status_msg ?? `MiniMax error ${statusCode}`,
			};
		}

		const windows = parseMiniMaxUsage(data);
		if (windows.length === 0) {
			return { ok: false, error: "MiniMax returned no quota windows" };
		}

		const limited = windows.some((w) => w.limited);
		return {
			ok: true,
			result: { windows, limited },
		};
	}
}
