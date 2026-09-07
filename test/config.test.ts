import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpHome: string;

beforeEach(() => {
	tmpHome = mkdtempSync(join(tmpdir(), "pi-usage-config-"));
	// os.homedir() reads from $HOME on darwin/linux, so this redirects the
	// config loader to a temp dir for the duration of the test.
	process.env.HOME = tmpHome;
});

afterEach(() => {
	rmSync(tmpHome, { recursive: true, force: true });
	delete process.env.HOME;
	vi.resetModules();
});

function writeUsageJson(contents: string): string {
	const dir = join(tmpHome, ".pi", "agent", "extensions");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "usage.json");
	writeFileSync(path, contents);
	return path;
}

async function loadModule() {
	// Reset the module cache so configLoader re-resolves homedir() under the
	// test's $HOME.
	vi.resetModules();
	return await import("../src/config.js");
}

describe("configLoader", () => {
	it("returns defaults when usage.json is missing", async () => {
		const { configLoader } = await loadModule();
		await configLoader.load();
		const config = configLoader.getConfig();
		expect(config.usageCommand).toBe(true);
		expect(config.providerCommands).toBe(true);
		expect(config.usageStatus).toBe(true);
		expect(config.quotaWarnings).toBe(true);
		expect(config.deferToSynthetic).toBe(true);
	});

	it("parses a well-formed usage.json", async () => {
		const { configLoader } = await loadModule();
		writeUsageJson(
			JSON.stringify({
				configVersion: "0.5.0",
				usageCommand: false,
				providerCommands: true,
				usageStatus: false,
				quotaWarnings: true,
				deferToSynthetic: false,
			}),
		);
		await configLoader.load();
		const config = configLoader.getConfig();
		expect(config.usageCommand).toBe(false);
		expect(config.usageStatus).toBe(false);
		expect(config.providerCommands).toBe(true);
		expect(config.quotaWarnings).toBe(true);
		expect(config.deferToSynthetic).toBe(false);
	});

	it("falls back to defaults for missing fields", async () => {
		const { configLoader } = await loadModule();
		writeUsageJson(JSON.stringify({ usageCommand: false }));
		await configLoader.load();
		const config = configLoader.getConfig();
		expect(config.usageCommand).toBe(false);
		expect(config.providerCommands).toBe(true);
		expect(config.usageStatus).toBe(true);
	});

	it("falls back to defaults on malformed JSON", async () => {
		const { configLoader } = await loadModule();
		writeUsageJson("{ not valid json");
		await configLoader.load();
		const config = configLoader.getConfig();
		expect(config.usageCommand).toBe(true);
	});

	it("round-trips via save()", async () => {
		const { configLoader } = await loadModule();
		await configLoader.save({
			usageCommand: false,
			usageStatus: false,
		});
		expect(configLoader.hasConfig()).toBe(true);
		const config = configLoader.getConfig();
		expect(config.usageCommand).toBe(false);
		expect(config.usageStatus).toBe(false);
		expect(config.providerCommands).toBe(true);
	});

	it("reports the global path under ~/.pi/agent/extensions/", async () => {
		const { configLoader } = await loadModule();
		expect(configLoader.globalPath()).toBe(
			join(tmpHome, ".pi", "agent", "extensions", "usage.json"),
		);
	});
});
