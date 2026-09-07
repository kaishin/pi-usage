import { describe, expect, it } from "vitest";
import {
	MiniMaxProvider,
	parseMiniMaxUsage,
} from "../../src/providers/minimax.js";

describe("parseMiniMaxUsage", () => {
	it("inverts remaining percent to used percent and preserves windows", () => {
		const start = Date.parse("2026-04-22T00:00:00Z");
		const intervalEnd = start + 5 * 60 * 60 * 1000;
		const weekEnd = start + 7 * 24 * 60 * 60 * 1000;

		const windows = parseMiniMaxUsage({
			model_remains: [
				{
					start_time: start,
					end_time: intervalEnd,
					remains_time: intervalEnd - start,
					current_interval_total_count: 1000,
					current_interval_usage_count: 530,
					model_name: "general",
					current_weekly_total_count: 7000,
					current_weekly_usage_count: 1234,
					weekly_start_time: start,
					weekly_end_time: weekEnd,
					weekly_remains_time: weekEnd - start,
					current_interval_status: 3,
					current_interval_remaining_percent: 47,
					current_weekly_status: 3,
					current_weekly_remaining_percent: 82,
				},
			],
		});

		expect(windows).toHaveLength(2);

		const interval = windows.find((w) => w.label === "general");
		expect(interval).toMatchObject({
			provider: "minimax",
			label: "general",
			usedPercent: 53, // 100 - 47 remaining
			windowSeconds: 5 * 60 * 60,
			usedValue: 530,
			limitValue: 1000,
			limited: false,
		});

		const weekly = windows.find((w) => w.label === "general / wk");
		expect(weekly).toMatchObject({
			provider: "minimax",
			label: "general / wk",
			usedPercent: 18, // 100 - 82 remaining
			windowSeconds: 7 * 24 * 60 * 60,
			usedValue: 1234,
			limitValue: 7000,
			limited: false,
		});
	});

	it("flags windows as limited when status is 1", () => {
		const start = Date.parse("2026-04-22T00:00:00Z");
		const intervalEnd = start + 5 * 60 * 60 * 1000;
		const weekEnd = start + 7 * 24 * 60 * 60 * 1000;

		const windows = parseMiniMaxUsage({
			model_remains: [
				{
					start_time: start,
					end_time: intervalEnd,
					remains_time: 0,
					current_interval_total_count: 100,
					current_interval_usage_count: 100,
					model_name: "general",
					current_weekly_total_count: 0,
					current_weekly_usage_count: 0,
					weekly_start_time: start,
					weekly_end_time: weekEnd,
					weekly_remains_time: weekEnd - start,
					current_interval_status: 1,
					current_interval_remaining_percent: 0,
					current_weekly_status: 1,
					current_weekly_remaining_percent: 0,
				},
			],
		});

		const interval = windows.find((w) => w.label === "general");
		const weekly = windows.find((w) => w.label === "general / wk");
		expect(interval?.usedPercent).toBe(100);
		expect(interval?.limited).toBe(true);
		expect(weekly?.usedPercent).toBe(100);
		expect(weekly?.limited).toBe(true);
	});

	it("clamps out-of-range remaining values to [0, 100] used", () => {
		const start = Date.parse("2026-04-22T00:00:00Z");
		const intervalEnd = start + 5 * 60 * 60 * 1000;
		const weekEnd = start + 7 * 24 * 60 * 60 * 1000;

		const windows = parseMiniMaxUsage({
			model_remains: [
				{
					start_time: start,
					end_time: intervalEnd,
					remains_time: intervalEnd - start,
					current_interval_total_count: 100,
					current_interval_usage_count: 0,
					model_name: "edge",
					current_weekly_total_count: 100,
					current_weekly_usage_count: 0,
					weekly_start_time: start,
					weekly_end_time: weekEnd,
					weekly_remains_time: weekEnd - start,
					current_interval_status: 3,
					current_interval_remaining_percent: -25, // >100% used
					current_weekly_status: 3,
					current_weekly_remaining_percent: 175, // negative used
				},
			],
		});

		const interval = windows.find((w) => w.label === "edge");
		const weekly = windows.find((w) => w.label === "edge / wk");
		expect(interval?.usedPercent).toBe(100); // clamped from 125
		expect(weekly?.usedPercent).toBe(0); // clamped from -75
	});

	it("returns no windows when model_remains is missing or empty", () => {
		expect(parseMiniMaxUsage({})).toEqual([]);
		expect(parseMiniMaxUsage({ model_remains: null })).toEqual([]);
	});

	it("skips entries with malformed timestamps instead of crashing", () => {
		expect(
			parseMiniMaxUsage({
				model_remains: [
					{
						model_name: "broken",
						current_interval_remaining_percent: 50,
						current_weekly_remaining_percent: 50,
					},
				],
			}),
		).toEqual([]);
	});

	it("sorts windows so the shortest window comes first", () => {
		const start = Date.parse("2026-04-22T00:00:00Z");
		const intervalEnd = start + 5 * 60 * 60 * 1000;
		const weekEnd = start + 7 * 24 * 60 * 60 * 1000;

		const windows = parseMiniMaxUsage({
			model_remains: [
				{
					start_time: start,
					end_time: intervalEnd,
					remains_time: intervalEnd - start,
					current_interval_total_count: 100,
					current_interval_usage_count: 50,
					model_name: "video",
					current_weekly_total_count: 100,
					current_weekly_usage_count: 10,
					weekly_start_time: start,
					weekly_end_time: weekEnd,
					weekly_remains_time: weekEnd - start,
					current_interval_status: 3,
					current_interval_remaining_percent: 50,
					current_weekly_status: 3,
					current_weekly_remaining_percent: 10,
				},
			],
		});

		expect(windows.map((w) => w.label)).toEqual(["video", "video / wk"]);
	});
});

describe("MiniMaxProvider.fetch", () => {
	it("returns an error when no API key is configured", async () => {
		const provider = new MiniMaxProvider({ apiKey: undefined });
		const outcome = await provider.fetch();
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.error).toMatch(/No MiniMax API key/);
		}
	});

	it("returns an error when the upstream returns a non-zero base_resp.status_code", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					base_resp: { status_code: 1002, status_msg: "auth failed" },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			)) as typeof fetch;

		try {
			const provider = new MiniMaxProvider({ apiKey: "sk-test" });
			const outcome = await provider.fetch();
			expect(outcome.ok).toBe(false);
			if (!outcome.ok) {
				expect(outcome.error).toMatch(/auth failed/);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("returns parsed windows on a healthy response", async () => {
		const start = Date.parse("2026-04-22T00:00:00Z");
		const intervalEnd = start + 5 * 60 * 60 * 1000;
		const weekEnd = start + 7 * 24 * 60 * 60 * 1000;

		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					model_remains: [
						{
							start_time: start,
							end_time: intervalEnd,
							remains_time: intervalEnd - start,
							current_interval_total_count: 1000,
							current_interval_usage_count: 100,
							model_name: "general",
							current_weekly_total_count: 7000,
							current_weekly_usage_count: 200,
							weekly_start_time: start,
							weekly_end_time: weekEnd,
							weekly_remains_time: weekEnd - start,
							current_interval_status: 3,
							current_interval_remaining_percent: 90,
							current_weekly_status: 3,
							current_weekly_remaining_percent: 97,
						},
					],
					base_resp: { status_code: 0, status_msg: "success" },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			)) as typeof fetch;

		try {
			const provider = new MiniMaxProvider({ apiKey: "sk-test" });
			const outcome = await provider.fetch();
			expect(outcome.ok).toBe(true);
			if (outcome.ok) {
				expect(outcome.result.windows).toHaveLength(2);
				expect(outcome.result.windows[0].usedPercent).toBe(10);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
