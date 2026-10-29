import type {
  QuotasResult,
  SupportedQuotaProvider,
} from "../../types/quotas.js";

export type QuotaSnapshot = {
  provider: SupportedQuotaProvider;
  result: QuotasResult;
};

/**
 * Keep only the providers that have something to report.
 *
 * `config` means no usable credential, `not_applicable` means the credential
 * type cannot report usage, and `unauthorized` means the stored credential was
 * rejected. None of them carry quota data, so none of them belong in the
 * combined dashboard. The per-provider commands still report them verbatim.
 */
export function filterDashboardSnapshots<T extends QuotaSnapshot>(
  snapshots: T[],
): T[] {
  return snapshots.filter(({ result }) => {
    if (result.success) return result.data.windows.length > 0;
    return !["config", "not_applicable", "unauthorized"].includes(
      result.error.kind,
    );
  });
}
