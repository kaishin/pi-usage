import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export type ResolvedOpenCodeGoApiKey =
  | { state: "configured"; apiKey: string; source: string }
  | { state: "none" }
  | { state: "invalid"; source: string; error: string };

/**
 * Config files that may hold an OpenCode Go API key.
 *
 * Only pi-usage's own config files and pi's own credential store are read.
 * The OpenCode CLI's `~/.local/share/opencode/auth.json` is deliberately not
 * a source: it is a multi-provider credential store owned by another
 * application, so a stale key there would make pi-usage report on a
 * provider the user never configured for Pi.
 */
function getApiKeyCandidatePaths(): string[] {
  const home = homedir();
  return [
    join(home, ".config", "opencode", "opencode-quota", "opencode-go.json"),
    join(home, ".config", "opencode-go", "config.json"),
  ];
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(
  path: string,
): Promise<
  | { state: "missing" }
  | { state: "loaded"; data: Record<string, unknown> }
  | { state: "invalid"; error: string }
> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { state: "missing" };
    }
    return { state: "invalid", error: "Failed to read config file" };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { state: "invalid", error: "Config file must contain a JSON object" };
    }
    return { state: "loaded", data: parsed as Record<string, unknown> };
  } catch {
    // Never surface raw parser diagnostics. A JSON.parse error can quote the
    // offending input, which may hold a credential.
    return { state: "invalid", error: "Config file is not valid JSON" };
  }
}

/** Extract an API key from a pi-usage OpenCode Go config file. */
export function apiKeyFromConfigData(
  data: Record<string, unknown>,
): { apiKey: string } | { legacy: true } | null {
  const direct =
    pickString(data.apiKey) || pickString(data.key) || pickString(data.OPENCODE_GO_API_KEY);
  if (direct) return { apiKey: direct };

  const entry = data["opencode-go"];
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const record = entry as Record<string, unknown>;
    const key = pickString(record.key) || pickString(record.apiKey);
    if (key) return { apiKey: key };
  }

  if (pickString(data.workspaceId) || pickString(data.authCookie)) {
    return { legacy: true };
  }
  return null;
}

export function resolveOpenCodeGoApiKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Extract<ResolvedOpenCodeGoApiKey, { state: "configured" }> | null {
  // OPENCODE_GO_API_KEY is this provider's own override; OPENCODE_API_KEY is
  // the variable Pi's built-in opencode-go provider authenticates with, so a
  // user who already set it for Pi needs no extra configuration.
  const apiKey =
    env.OPENCODE_GO_API_KEY?.trim() || env.OPENCODE_API_KEY?.trim();
  if (!apiKey) return null;
  return { state: "configured", apiKey, source: "env" };
}

export async function resolveOpenCodeGoApiKeyFromFiles(): Promise<ResolvedOpenCodeGoApiKey> {
  for (const path of getApiKeyCandidatePaths()) {
    const fileResult = await readJson(path);
    if (fileResult.state === "missing") continue;
    if (fileResult.state === "invalid") {
      return { state: "invalid", source: path, error: fileResult.error };
    }

    const extracted = apiKeyFromConfigData(fileResult.data);
    if (!extracted) continue;
    if ("legacy" in extracted) {
      return {
        state: "invalid",
        source: path,
        error:
          "workspaceId/authCookie scraping is no longer supported." +
          " Replace them with an \"apiKey\" field (OpenCode Go API key)",
      };
    }
    return { state: "configured", apiKey: extracted.apiKey, source: path };
  }
  return { state: "none" };
}

let cached: ResolvedOpenCodeGoApiKey | null = null;
let cachedAt = 0;

const CACHE_MAX_AGE_MS = 30_000;

/** Test hook: drop the memoized file-resolution result. */
export function resetOpenCodeGoApiKeyCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function resolveOpenCodeGoApiKeyFromFilesCached(params?: {
  maxAgeMs?: number;
}): Promise<ResolvedOpenCodeGoApiKey> {
  const maxAgeMs = Math.max(0, params?.maxAgeMs ?? CACHE_MAX_AGE_MS);
  const now = Date.now();
  if (cached && now - cachedAt < maxAgeMs) return cached;
  cached = await resolveOpenCodeGoApiKeyFromFiles();
  cachedAt = now;
  return cached;
}
