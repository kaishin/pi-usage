/**
 * pi-usage configuration loader.
 *
 * The config file is `~/.pi/agent/extensions/usage.json` (rcm-tracked via
 * `~/.dotfiles/tag-pi/pi/agent/extensions/usage.json`). The shape mirrors
 * what `@latentminds/pi-quotas` used under `quotas.json` so swapping
 * packages is a one-file rename.
 *
 * Fields:
 *   - configVersion      semver of the schema; informational
 *   - usageCommand       toggle the `/usage` command
 *   - providerCommands   toggle per-provider commands (e.g. `/minimax:usage`)
 *   - usageStatus        toggle the footer status segment
 *   - quotaWarnings      toggle projected-usage warning notifications
 *   - deferToSynthetic   suppress our footer when another extension reports
 *                        the same data for the same provider (currently a no-op
 *                        since we don't observe peer extensions; reserved)
 *
 * The presence of the file is what opts the extension in; if the file is
 * missing, the extension runs with all defaults (everything enabled).
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface UsageConfig {
	configVersion?: string;
	usageCommand?: boolean;
	providerCommands?: boolean;
	usageStatus?: boolean;
	quotaWarnings?: boolean;
	deferToSynthetic?: boolean;
}

export interface ResolvedUsageConfig {
	configVersion: string;
	usageCommand: boolean;
	providerCommands: boolean;
	usageStatus: boolean;
	quotaWarnings: boolean;
	deferToSynthetic: boolean;
}

const DEFAULT_CONFIG: ResolvedUsageConfig = {
	configVersion: "0.5.0",
	usageCommand: true,
	providerCommands: true,
	usageStatus: true,
	quotaWarnings: true,
	deferToSynthetic: true,
};

function resolve(input?: UsageConfig): ResolvedUsageConfig {
	return {
		configVersion: input?.configVersion ?? DEFAULT_CONFIG.configVersion,
		usageCommand: input?.usageCommand ?? DEFAULT_CONFIG.usageCommand,
		providerCommands:
			input?.providerCommands ?? DEFAULT_CONFIG.providerCommands,
		usageStatus: input?.usageStatus ?? DEFAULT_CONFIG.usageStatus,
		quotaWarnings: input?.quotaWarnings ?? DEFAULT_CONFIG.quotaWarnings,
		deferToSynthetic:
			input?.deferToSynthetic ?? DEFAULT_CONFIG.deferToSynthetic,
	};
}

class UsageConfigStore {
	private config: ResolvedUsageConfig = DEFAULT_CONFIG;

	globalPath(): string {
		return join(homedir(), ".pi", "agent", "extensions", "usage.json");
	}

	async load(): Promise<void> {
		try {
			const raw = await readFile(this.globalPath(), "utf8");
			const parsed = JSON.parse(raw) as UsageConfig;
			this.config = resolve(parsed);
		} catch {
			// File missing or malformed — fall back to defaults. The extension
			// runs out of the box; only deliberate config overrides opt out.
			this.config = DEFAULT_CONFIG;
		}
	}

	getConfig(): ResolvedUsageConfig {
		return this.config;
	}

	hasConfig(): boolean {
		return existsSync(this.globalPath());
	}

	async save(config: UsageConfig): Promise<void> {
		const path = this.globalPath();
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, JSON.stringify(resolve(config), null, 2) + "\n", "utf8");
		await this.load();
	}
}

export const configLoader = new UsageConfigStore();
