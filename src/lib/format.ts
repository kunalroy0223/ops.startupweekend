export const DEFAULT_TZ = "Asia/Kolkata";

export function formatDate(iso: string | undefined | null, tz = DEFAULT_TZ, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, ...opts }).format(new Date(iso));
}

export function formatDateTime(iso: string | undefined | null, tz = DEFAULT_TZ): string {
  return formatDate(iso, tz, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function relativeTime(iso: string | undefined | null, nowMs = Date.now()): string {
  if (!iso) return "never";
  const diff = Math.round((Date.parse(iso) - nowMs) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(diff / 86_400), "day");
  return formatDate(iso);
}

export function greeting(tz = DEFAULT_TZ, nowDate = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(nowDate));
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const ACTION_LABEL: Record<string, string> = {
  "auth.signed_in": "signed in",
  "invitation.created": "sent an invitation",
  "invitation.resent": "resent an invitation",
  "invitation.revoked": "revoked an invitation",
  "invitation.link_viewed": "copied an invitation link",
  "user.created_from_invitation": "accepted an invitation and joined",
  "user.profile_updated": "updated a profile",
  "user.role_changed": "changed a role",
  "user.status_changed": "changed an account status",
  "workspace.created": "created a workspace",
  "workspace.updated": "updated a workspace",
  "workspace.archived": "archived a workspace",
  "workspace.restored": "restored a workspace",
  "workstream.created": "created a workstream",
  "workstream.updated": "updated a workstream",
  "workstream.archived": "archived a workstream",
  "workstream.restored": "restored a workstream",
  "team.created": "created a team",
  "team.updated": "updated a team",
  "team.archived": "archived a team",
  "team.restored": "restored a team",
  "team.linked_to_workstream": "linked a team to a workstream",
  "team.unlinked_from_workstream": "unlinked a team from a workstream",
  "team_membership.assigned": "assigned someone to a team",
  "team_membership.changed": "changed a team assignment",
  "team_membership.removed": "removed someone from a team",
  "team_membership.transferred": "moved someone between teams",
  "workstream_membership.assigned": "assigned someone to a workstream",
  "workstream_membership.changed": "changed a workstream assignment",
  "workstream_membership.removed": "removed someone from a workstream",
  "notification_preferences.updated": "updated notification preferences",
  "organization.updated": "updated organisation settings",
  "email.failed_requeued": "requeued failed emails",
  "system.bootstrap": "bootstrapped the workspace",
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/[._]/g, " ");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}
