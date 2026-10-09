import { getQuota, loadSubscription } from "../api/client";
import type { RateWindow } from "../api/types";

function compactWindow(window: RateWindow | undefined) {
  if (!window) return null;
  return {
    utilizationPercent: window.utilization_pct,
    remainingPercent: Math.max(0, Math.round((100 - window.utilization_pct) * 100) / 100),
    resetsAt: window.resets_at,
    estimated: Boolean(window.synthesized || window.resets_at_estimated),
  };
}

/** Subscription windows and quotas Headroom tracks: Anthropic (5-hour, 7-day), OpenAI Codex and GitHub Copilot. */
export default async function tool() {
  const [anthropic, quota] = await Promise.all([loadSubscription(), getQuota()]);
  const codex = quota.codex_rate_limits;
  const copilot = quota.copilot_quota?.latest;

  return {
    anthropic: !anthropic.available
      ? { tracking: "disabled", reason: anthropic.reason }
      : anthropic.data.latest
        ? {
            tracking: "enabled",
            polledAt: anthropic.data.latest.polled_at,
            fiveHour: compactWindow(anthropic.data.latest.five_hour),
            sevenDay: compactWindow(anthropic.data.latest.seven_day),
            sevenDayOpus: compactWindow(anthropic.data.latest.seven_day_opus),
            sevenDaySonnet: compactWindow(anthropic.data.latest.seven_day_sonnet),
            extraUsage: anthropic.data.latest.extra_usage ?? null,
            headroomContributionInCurrentWindow: anthropic.data.contribution,
          }
        : {
            tracking: "no data",
            reason:
              "Headroom has no Anthropic usage snapshot yet. It needs Claude subscription (OAuth) credentials; proxies forwarding with an API key or to another gateway have none.",
            lastError: anthropic.data.last_error,
            pollErrors: anthropic.data.poll_errors,
          },
    codex: codex
      ? {
          primary: codex.primary,
          secondary: codex.secondary,
          credits: codex.credits,
          capturedAt: new Date(codex.captured_at * 1000).toISOString(),
        }
      : null,
    copilot: copilot
      ? {
          plan: copilot.copilot_plan,
          resetDate: copilot.quota_reset_date_utc,
          categories: Object.values(copilot.categories).map((category) => ({
            name: category.name,
            usedPercent: category.used_percent,
            remaining: category.remaining,
            entitlement: category.entitlement,
            unlimited: category.unlimited,
          })),
        }
      : null,
  };
}
