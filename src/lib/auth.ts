import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface AuthStorage {
  get(provider: string): unknown;
  getApiKey(provider: string): Promise<string | undefined>;
}

export type AuthStorageData = Record<string, unknown>;

export function inMemoryAuthStorage(
  data: AuthStorageData = {},
): AuthStorage {
  return {
    get(provider: string): unknown {
      return data[provider];
    },
    async getApiKey(provider: string): Promise<string | undefined> {
      const credential = data[provider];
      if (credential && typeof credential === "object") {
        return (credential as { apiKey?: string }).apiKey;
      }
      return undefined;
    },
  };
}

type CompatibleModelRegistry = {
  authStorage?: AuthStorage;
  getApiKeyForProvider?: (provider: string) => Promise<string | undefined>;
  getProviderAuth?: (provider: string) => Promise<any>;
};

function storedCredential(provider: string): unknown {
  try {
    const authPath = join(getAgentDir(), "auth.json");
    const credentials = JSON.parse(readFileSync(authPath, "utf8")) as Record<
      string,
      unknown
    >;
    return credentials[provider];
  } catch {
    return undefined;
  }
}

/**
 * Support both upstream Pi's legacy `modelRegistry.authStorage` API and
 * newer Pi distributions that expose resolved provider auth through methods.
 */
export function quotaAuthStorage(
  modelRegistry: CompatibleModelRegistry,
): AuthStorage {
  const legacy = modelRegistry.authStorage;
  if (legacy) return legacy;

  return {
    // Quota endpoints need stored OAuth metadata such as the GitHub refresh
    // token and Codex account id, which resolved provider auth omits.
    get: storedCredential,
    getApiKey: async (provider: string) => {
      const apiKey = await modelRegistry.getApiKeyForProvider?.(provider);
      if (apiKey) return apiKey;

      const auth = (await modelRegistry.getProviderAuth?.(provider))?.auth;
      const authorization = auth?.headers?.Authorization;
      return auth?.apiKey ?? authorization?.replace(/^Bearer\s+/i, "");
    },
  } as unknown as AuthStorage;
}
