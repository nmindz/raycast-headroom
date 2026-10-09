import { getPreferenceValues } from "@raycast/api";
import { resolveTimeZone } from "./periods";
import type { QuotaDisplay } from "./quota";

export interface ResolvedPreferences {
  baseUrl: string;
  proxyToken: string;
  timezone: string;
  quotaDisplay: QuotaDisplay;
}

/** Trims, strips trailing slashes and assumes http:// when no scheme was typed. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function getPrefs(): ResolvedPreferences {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  return {
    baseUrl: normalizeBaseUrl(prefs.baseUrl),
    proxyToken: prefs.proxyToken?.trim() ?? "",
    timezone: resolveTimeZone(prefs.timezone),
    quotaDisplay: prefs.quotaDisplay === "remaining" ? "remaining" : "consumed",
  };
}
