export function requestStatsRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("stats-refresh"));
}
