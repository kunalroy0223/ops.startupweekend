import { Bell, Boxes, ChartColumn, FileText, FolderKanban, History, LayoutDashboard, ListChecks, Network, Settings, Target, Users, type LucideIcon } from "lucide-react";
import type { NavKey } from "@/domain/authz";

export const NAV: Record<NavKey, { href: string; label: string; icon: LucideIcon; group: "work" | "organisation" | "you" }> = {
  overview: { href: "/overview", label: "Overview", icon: LayoutDashboard, group: "work" },
  "my-work": { href: "/my-work", label: "My Work", icon: Target, group: "work" },
  tasks: { href: "/tasks", label: "Tasks", icon: ListChecks, group: "work" },
  projects: { href: "/projects", label: "Projects", icon: FolderKanban, group: "work" },
  reports: { href: "/reports", label: "Work Reports", icon: FileText, group: "work" },
  analytics: { href: "/analytics", label: "Analytics", icon: ChartColumn, group: "work" },
  workspaces: { href: "/workspaces", label: "Workspaces", icon: Boxes, group: "organisation" },
  structure: { href: "/structure", label: "Workstreams & Teams", icon: Network, group: "organisation" },
  people: { href: "/people", label: "People", icon: Users, group: "organisation" },
  activity: { href: "/activity", label: "Activity", icon: History, group: "organisation" },
  notifications: { href: "/notifications", label: "Notifications", icon: Bell, group: "you" },
  settings: { href: "/settings", label: "Settings", icon: Settings, group: "you" },
};

export const GROUP_LABEL = { work: "Work", organisation: "Organisation", you: "You" } as const;

export const CRUMB_LABEL: Record<string, string> = {
  overview: "Overview",
  workspaces: "Workspaces",
  structure: "Workstreams & Teams",
  projects: "Projects",
  tasks: "Tasks",
  workstreams: "Workstream",
  teams: "Team",
  people: "People",
  activity: "Activity",
  notifications: "Notifications",
  preferences: "Preferences",
  settings: "Settings",
  profile: "Profile",
};
