import { describe, expect, it } from "vitest";
import {
	createUsageFooterComponent,
	renderUsageDashboard,
	renderUsageSegment,
} from "../src/footer.js";
import type { QuotaWindow } from "../src/providers/types.js";

function windowAt(
	overrides: Partial<QuotaWindow> & { label: string; usedPercent: number },
): QuotaWindow {
	return {
		provider: "minimax",
		resetsAt: new Date(Date.now() + 60 * 60 * 1000),
		windowSeconds: 5 * 60 * 60,
		...overrides,
	};
}

/** Strip ANSI escape codes so regex assertions match the visible text. */
function plain(s: string | undefined): string {
	return (s ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

describe("renderUsageSegment", () => {
	it("renders a single window segment", () => {
		const out = renderUsageSegment("MiniMax", [
			windowAt({
				label: "general",
				usedPercent: 53,
				resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
			}),
		]);
		expect(plain(out)).toMatch(/● MiniMax\s+general 53%/);
		expect(plain(out)).toMatch(/4h/);
	});

	it("renders both windows with a separator when width allows", () => {
		const out = renderUsageSegment(
			"MiniMax",
			[
				windowAt({
					label: "general",
					usedPercent: 53,
					resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
					windowSeconds: 5 * 60 * 60,
				}),
				windowAt({
					label: "general / wk",
					usedPercent: 18,
					resetsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
					windowSeconds: 7 * 24 * 60 * 60,
				}),
			],
			{ availableWidth: 80 },
		);
		expect(plain(out)).toMatch(/general 53%/);
		expect(plain(out)).toMatch(/wk 18%/);
		expect(plain(out)).toMatch(/│/);
	});

	it("collapses to the primary window when width is tight", () => {
		const out = renderUsageSegment(
			"MiniMax",
			[
				windowAt({
					label: "general",
					usedPercent: 53,
					resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
					windowSeconds: 5 * 60 * 60,
				}),
				windowAt({
					label: "general / wk",
					usedPercent: 18,
					resetsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
					windowSeconds: 7 * 24 * 60 * 60,
				}),
			],
			{ availableWidth: 30 },
		);
		expect(plain(out)).toMatch(/general 53%/);
		expect(plain(out)).not.toMatch(/wk/);
	});

	it("emits a single Limited line when any window is rate-limited", () => {
		const out = renderUsageSegment("MiniMax", [
			windowAt({ label: "general", usedPercent: 100, limited: true }),
		]);
		expect(plain(out)).toMatch(/Limited/);
	});
});

describe("createUsageFooterComponent", () => {
	it("renders an empty line when state is uninitialized", () => {
		const state = { displayName: undefined, windows: undefined };
		const component = createUsageFooterComponent({
			getState: () => state,
			requestRender: () => undefined,
		});
		expect(component.render(80)).toEqual([""]);
	});

	it("renders the segment from the state on each render(width)", () => {
		const state: { displayName: string | undefined; windows: QuotaWindow[] | undefined } = {
			displayName: "MiniMax",
			windows: [
				windowAt({
					label: "general",
					usedPercent: 53,
					resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
				}),
			],
		};
		const component = createUsageFooterComponent({
			getState: () => state,
			requestRender: () => undefined,
		});
		const line = plain(component.render(120)[0]);
		expect(line).toMatch(/● MiniMax\s+general 53%/);
	});

	it("reflects subsequent state mutations without being recreated", () => {
		const state: { displayName: string | undefined; windows: QuotaWindow[] | undefined } = {
			displayName: "MiniMax",
			windows: undefined,
		};
		const component = createUsageFooterComponent({
			getState: () => state,
			requestRender: () => undefined,
		});
		expect(component.render(120)).toEqual([""]);

		state.windows = [
			windowAt({ label: "general", usedPercent: 80, limited: true }),
		];
		expect(plain(component.render(120)[0])).toMatch(/Limited/);
	});

	it("renders an empty line after dispose", () => {
		const state = {
			displayName: "MiniMax",
			windows: [windowAt({ label: "general", usedPercent: 50 })],
		};
		const component = createUsageFooterComponent({
			getState: () => state,
			requestRender: () => undefined,
		});
		expect(plain(component.render(80)[0])).toMatch(/general/);
		component.dispose();
		expect(component.render(80)).toEqual([""]);
	});

	it("treats width <= 0 as empty", () => {
		const state = {
			displayName: "MiniMax",
			windows: [windowAt({ label: "general", usedPercent: 50 })],
		};
		const component = createUsageFooterComponent({
			getState: () => state,
			requestRender: () => undefined,
		});
		expect(component.render(0)).toEqual([""]);
		expect(component.render(-10)).toEqual([""]);
	});
});

describe("renderUsageDashboard", () => {
	it("renders a multi-line progress-bar dashboard", () => {
		const out = plain(
			renderUsageDashboard("MiniMax", [
				windowAt({
					label: "general",
					usedPercent: 53,
					resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
				}),
				windowAt({
					label: "video",
					usedPercent: 10,
					resetsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
					windowSeconds: 7 * 24 * 60 * 60,
				}),
			]),
		);

		const lines = out.split("\n");
		expect(lines[0]).toBe("MiniMax");
		expect(lines).toHaveLength(3);
		expect(lines[1]).toMatch(/general\s+█+░*\s+53%\s+\(4h/);
		expect(lines[2]).toMatch(/video\s+█+░*\s+10%\s+\(5d/);
	});

	it("emits a Limited marker for rate-limited windows", () => {
		const out = plain(
			renderUsageDashboard("MiniMax", [
				windowAt({ label: "general", usedPercent: 100, limited: true }),
			]),
		);
		expect(out).toMatch(/Limited/);
	});

	it("handles empty windows without crashing", () => {
		const out = plain(renderUsageDashboard("MiniMax", []));
		expect(out).toMatch(/MiniMax/);
		expect(out).toMatch(/no quota data/);
	});

	it("sorts windows so the shortest window comes first", () => {
		const out = plain(
			renderUsageDashboard("MiniMax", [
				windowAt({
					label: "general / wk",
					usedPercent: 18,
					resetsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
					windowSeconds: 7 * 24 * 60 * 60,
				}),
				windowAt({
					label: "general",
					usedPercent: 53,
					resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
					windowSeconds: 5 * 60 * 60,
				}),
			]),
		);
		const lines = out.split("\n");
		expect(lines[1]).toMatch(/general\s/);
		expect(lines[2]).toMatch(/general \/ wk/);
	});
});
