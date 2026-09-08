import { describe, expect, it } from "vitest";
import {
	createUsageFooterComponent,
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

describe("renderUsageSegment", () => {
	it("returns undefined when there are no windows", () => {
		expect(renderUsageSegment("MiniMax", [])).toBeUndefined();
	});

	it("renders a single window segment", () => {
		const out = renderUsageSegment("MiniMax", [
			windowAt({
				label: "general",
				usedPercent: 53,
				resetsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
			}),
		]);
		expect(out).toMatch(/^● MiniMax\s+general 53%/);
		expect(out).toMatch(/4h/);
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
		expect(out).toMatch(/general 53%/);
		expect(out).toMatch(/wk 18%/);
		expect(out).toMatch(/│/);
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
		expect(out).toMatch(/general 53%/);
		expect(out).not.toMatch(/wk/);
	});

	it("emits a single Limited line when any window is rate-limited", () => {
		const out = renderUsageSegment("MiniMax", [
			windowAt({ label: "general", usedPercent: 100, limited: true }),
		]);
		expect(out).toMatch(/Limited/);
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
		const line = component.render(120)[0];
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
		expect(component.render(120)[0]).toMatch(/Limited/);
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
		expect(component.render(80)[0]).toMatch(/general/);
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
