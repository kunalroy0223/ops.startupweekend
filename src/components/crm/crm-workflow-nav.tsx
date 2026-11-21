import Link from "next/link";

export function CrmWorkflowNav({ active, workspaceId }: { active: "directory" | "workflows"; workspaceId?: string }) {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  return (
    <nav aria-label="CRM sections" className="flex flex-wrap gap-1 rounded-xl border border-line bg-muted p-1">
      <Link href={`/crm${query}`} aria-current={active === "directory" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active === "directory" ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>
        Directory
      </Link>
      <Link href={`/crm/workflows${query}`} aria-current={active === "workflows" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active === "workflows" ? "bg-surface text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}>
        Pipeline & outreach
      </Link>
    </nav>
  );
}
