import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Pi's wording when an extension reuses a ctx whose session was replaced. */
const STALE_CONTEXT_MESSAGE = "This extension ctx is stale";

export function isStaleContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(STALE_CONTEXT_MESSAGE);
}

/** Read the active provider, treating an invalidated ctx as "no provider". */
export function getContextProvider(
  ctx: ExtensionContext | undefined,
): string | undefined {
  if (!ctx) return undefined;
  try {
    return ctx.model?.provider;
  } catch (error) {
    if (isStaleContextError(error)) return undefined;
    throw error;
  }
}
