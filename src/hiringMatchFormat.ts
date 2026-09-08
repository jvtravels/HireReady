// Shared formatting for hiring-match cards, used by both the dashboard
// teaser (HiringActivityCard) and the full-detail Jobs tab (DashboardJobs)
// so the two views can't drift on how comp/experience/dates are shown.

export function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function formatComp(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `₹${min}–${max}L`;
  return `₹${min ?? max}L`;
}

export function formatExperience(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} yrs`;
  return `${min ?? max}+ yrs`;
}

export const WORK_MODE_LABEL: Record<string, string> = { remote: "Remote", onsite: "On-site", hybrid: "Hybrid" };
