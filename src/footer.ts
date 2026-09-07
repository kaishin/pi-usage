/**
 * Footer segment renderer for the active provider's quota state.
 *
 * Produces a short string like:
 *
 *   ● MiniMax  general 53% (4h 12m) │ wk 18% (5d)
 *   ● MiniMax  general 100% Limited
 *
 * Width-responsive: collapses to a single window when the available
 * column count is tight.
 */

import type { QuotaWindow } from "./providers/index.js";

const RESET_SOON_MS = 5 * 60 * 1000;

function formatResetIn(resetsAt: Date): string {
	const ms = resetsAt.getTime() - Date.now();
	if (ms <= 0) return "now";

	const totalMinutes = Math.round(ms / 60_000);
	if (totalMinutes < 60) return `${totalMinutes}m`;

	const totalHours = Math.round(ms / (60 * 60 * 1000));
	if (totalHours < 24) {
		const m = Math.round((ms % (60 * 60 * 1000)) / 60_000);
		return m > 0 ? `${totalHours}h ${m}m` : `${totalHours}h`;
	}

	const days = Math.floor(ms / (24 * 60 * 60 * 1000));
	const hours = Math.round((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
	if (days <= 6) {
		return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	}
	return `${days}d`;
}

/** Format an integer percent as a compact 1–3 character string. */
function fmtPercent(p: number): string {
	return `${Math.round(p)}%`;
}

/**
 * Render a single footer segment for the active provider.
 *
 * Returns `undefined` when there is nothing meaningful to show (e.g. the
 * caller's provider has no registered fetcher).
 */
export function renderUsageSegment(
	displayName: string,
	windows: QuotaWindow[],
	options: { availableWidth?: number } = {},
): string | undefined {
	if (windows.length === 0) return undefined;

	const width = options.availableWidth ?? Infinity;

	// Sort by window length so the most-imminent reset comes first.
	const sorted = [...windows].sort((a, b) => {
		if (a.windowSeconds !== b.windowSeconds) {
			return a.windowSeconds - b.windowSeconds;
		}
		return a.label.localeCompare(b.label);
	});

	const limited = sorted.some((w) => w.limited);
	const anyLimited = sorted.find((w) => w.limited);

	// Limited-by-status windows take priority: render a single warning line.
	if (limited && anyLimited && width >= 28) {
		return `● ${displayName}  ${anyLimited.label} 100% Limited`;
	}

	const primary = sorted[0];
	const secondary = sorted.find(
		(w) => w.windowSeconds !== primary.windowSeconds,
	);

	const primaryPart =
		primary.limited
			? `${primary.label} Limited`
			: `${primary.label} ${fmtPercent(primary.usedPercent)} (${formatResetIn(primary.resetsAt)})`;

	if (!secondary || width < 38) {
		return `● ${displayName}  ${primaryPart}`;
	}

	const secondaryPart = secondary.limited
		? `${secondary.label} Limited`
		: `${secondary.label} ${fmtPercent(secondary.usedPercent)} (${formatResetIn(secondary.resetsAt)})`;

	return `● ${displayName}  ${primaryPart} │ ${secondaryPart}`;
}
