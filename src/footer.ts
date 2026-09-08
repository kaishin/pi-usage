/**
 * Footer segment renderer for the active provider's quota state.
 *
 * Three exports:
 *
 *   - renderUsageSegment(): pure function, returns the single-line
 *     string used in the footer Component.
 *
 *   - renderUsageDashboard(): pure function, returns a multi-line
 *     string with progress bars and severity coloring for the /usage
 *     command.
 *
 *   - createUsageFooterComponent(): a pi-tui Component that wraps
 *     renderUsageSegment so pi can drop it into the footer slot via
 *     ctx.ui.setFooter((tui, theme, footerData) => Component).
 *
 * Width-responsive: collapses to a single window when the available
 * column count is tight.
 */

import type { Component } from "@earendil-works/pi-tui";
import type { QuotaWindow } from "./providers/index.js";

const RESET = "\x1b[0m";
const FG_RED = "\x1b[31m";
const FG_YELLOW = "\x1b[33m";
const FG_GREEN = "\x1b[32m";
const FG_CYAN = "\x1b[36m";
const FG_DIM = "\x1b[2m";
const FG_BOLD = "\x1b[1m";

const BAR_WIDTH = 16;

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

function severityFor(window: QuotaWindow): "error" | "warning" | "ok" {
	if (window.limited) return "error";
	if (window.usedPercent >= 90) return "error";
	if (window.usedPercent >= 80) return "warning";
	return "ok";
}

function severityColor(severity: "error" | "warning" | "ok"): string {
	switch (severity) {
		case "error":
			return FG_RED;
		case "warning":
			return FG_YELLOW;
		case "ok":
			return FG_GREEN;
	}
}

function progressBar(percent: number): string {
	const safe = Math.max(0, Math.min(100, percent));
	const filled = Math.round((safe / 100) * BAR_WIDTH);
	const empty = BAR_WIDTH - filled;
	return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Render a single-line footer segment for the active provider.
 *
 * Returns `undefined` when there is nothing meaningful to show.
 */
export function renderUsageSegment(
	displayName: string,
	windows: QuotaWindow[],
	options: { availableWidth?: number } = {},
): string | undefined {
	if (windows.length === 0) return undefined;

	const width = options.availableWidth ?? Infinity;

	const sorted = [...windows].sort((a, b) => {
		if (a.windowSeconds !== b.windowSeconds) {
			return a.windowSeconds - b.windowSeconds;
		}
		return a.label.localeCompare(b.label);
	});

	const limited = sorted.some((w) => w.limited);
	const anyLimited = sorted.find((w) => w.limited);

	if (limited && anyLimited && width >= 28) {
		return `${FG_DIM}●${RESET} ${FG_BOLD}${displayName}${RESET}  ${FG_RED}${anyLimited.label} Limited${RESET}`;
	}

	const primary = sorted[0];
	const secondary = sorted.find(
		(w) => w.windowSeconds !== primary.windowSeconds,
	);

	const renderSingle = (w: QuotaWindow): string => {
		if (w.limited) return `${w.label} ${FG_RED}Limited${RESET}`;
		const sev = severityFor(w);
		return `${w.label} ${severityColor(sev)}${fmtPercent(w.usedPercent)}${RESET} ${FG_DIM}(${formatResetIn(w.resetsAt)})${RESET}`;
	};

	if (!secondary || width < 50) {
		return `${FG_DIM}●${RESET} ${FG_BOLD}${displayName}${RESET}  ${renderSingle(primary)}`;
	}

	return `${FG_DIM}●${RESET} ${FG_BOLD}${displayName}${RESET}  ${renderSingle(primary)} ${FG_DIM}│${RESET} ${renderSingle(secondary)}`;
}

/**
 * Render a multi-line dashboard for the /usage command. Includes a
 * header, progress bars with severity coloring, reset times, and a
 * limited-state marker.
 */
export function renderUsageDashboard(
	displayName: string,
	windows: QuotaWindow[],
): string {
	if (windows.length === 0) {
		return `${FG_BOLD}${displayName}${RESET}\n  ${FG_DIM}(no quota data)${RESET}`;
	}

	const sorted = [...windows].sort((a, b) => {
		if (a.windowSeconds !== b.windowSeconds) {
			return a.windowSeconds - b.windowSeconds;
		}
		return a.label.localeCompare(b.label);
	});

	const labelWidth = Math.max(...sorted.map((w) => w.label.length));
	const lines: string[] = [];
	lines.push(`${FG_BOLD}${displayName}${RESET}`);

	for (const w of sorted) {
		const sev = severityFor(w);
		const color = severityColor(sev);
		const bar = progressBar(w.usedPercent);
		const label = w.label.padEnd(labelWidth);
		const pct = fmtPercent(w.usedPercent).padStart(4);
		const reset = `${FG_DIM}(${formatResetIn(w.resetsAt)})${RESET}`;
		const limited = w.limited
			? ` ${FG_RED}${FG_BOLD}Limited${RESET}`
			: "";
		lines.push(`  ${label}  ${color}${bar}${RESET} ${color}${pct}${RESET} ${reset}${limited}`);
	}

	return lines.join("\n");
}

/** State read by the footer Component on each render. */
export interface UsageFooterState {
	displayName: string | undefined;
	windows: QuotaWindow[] | undefined;
}

/**
 * Build a pi-tui Component that renders the usage segment on each
 * render(width) call.
 */
export function createUsageFooterComponent(options: {
	getState(): UsageFooterState;
	requestRender(): void;
}): Component & { dispose(): void } {
	let disposed = false;

	return {
		render(width: number): string[] {
			if (disposed) return [""];
			const { displayName, windows } = options.getState();
			if (!displayName || !windows || windows.length === 0) return [""];
			if (width <= 0) return [""];
			const segment = renderUsageSegment(displayName, windows, {
				availableWidth: width,
			});
			return [segment ?? ""];
		},
		invalidate(): void {
			// No cached layout — render() is cheap.
		},
		dispose(): void {
			disposed = true;
		},
	};
}
