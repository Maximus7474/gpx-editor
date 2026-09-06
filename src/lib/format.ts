export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters <= 0) {
    return "—";
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCount(value: number, singular: string, plural?: string): string {
  const label = value === 1 ? singular : (plural ?? `${singular}s`);
  return `${value} ${label}`;
}
