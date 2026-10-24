const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const SERIES = [...SERIES_LIGHT];

export function setSeriesMode(mode) {
  SERIES.splice(0, SERIES.length, ...(mode === "dark" ? SERIES_DARK : SERIES_LIGHT));
}
export const MAX_CATEGORIES = SERIES.length - 1;

export const PROFIT = "rgb(72, 194, 55)";
export const LOSS = "rgb(250, 118, 78)";
export const BUY = "#4184f3";
export const SELL = "#ff5722";
export const NEUTRAL = "#c9c9c9";
export const OTHER = "#9b9b9b";

export function cssVar(name, fallback = "") {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
export const gridColor = () => cssVar("--border-subtle", "#f1f1f1");
export const tickColor = () => cssVar("--text-muted", "rgb(145, 145, 145)");
export const surfaceColor = () => cssVar("--surface", "#ffffff");

export const signColor = (v) => (v == null ? NEUTRAL : v < 0 ? LOSS : PROFIT);

export function colorMap(keys) {
  const sorted = [...new Set(keys)].sort();
  return Object.fromEntries(sorted.map((k, i) => [k, SERIES[i % SERIES.length]]));
}

export function foldOther(items, { key, value, max = MAX_CATEGORIES }) {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  if (sorted.length <= max + 1) return sorted.map((i) => ({ label: key(i), value: value(i) }));
  const head = sorted.slice(0, max).map((i) => ({ label: key(i), value: value(i) }));
  const rest = sorted.slice(max).reduce((s, i) => s + value(i), 0);
  return [...head, { label: "Other", value: rest, other: true }];
}
