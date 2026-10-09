import { Color } from "@raycast/api";
import type { Tone } from "../lib/format";

export function toneColor(tone: Tone): Color {
  if (tone === "good") return Color.Green;
  if (tone === "bad") return Color.Red;
  return Color.SecondaryText;
}

export function utilizationColor(percent: number | null | undefined): Color {
  if (percent === null || percent === undefined) return Color.SecondaryText;
  if (percent >= 90) return Color.Red;
  if (percent >= 70) return Color.Yellow;
  return Color.Green;
}

/** Component status strings from /readyz: healthy, disabled, degraded, unhealthy, … */
export function statusColor(status: string | null | undefined, ready = true): Color {
  if (!ready) return Color.Red;
  if (status === "healthy") return Color.Green;
  if (status === "disabled") return Color.SecondaryText;
  return Color.Yellow;
}
