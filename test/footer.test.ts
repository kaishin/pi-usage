import { describe, expect, it } from "vitest";
import { renderUsageSegment } from "../src/footer.js";
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
