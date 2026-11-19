"use client";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/field";
import { ROLES, ROLE_LABEL, USER_STATUSES, USER_STATUS_LABEL } from "@/domain/types";

export function DirectoryFilters({ q, role, status }: { q?: string; role?: string; status?: string }) {
  const router = useRouter();
  const [text, setText] = useState(q ?? "");
  const go = (next: { q?: string; role?: string; status?: string }) => {
    const p = new URLSearchParams();
    const v = { q: text, role, status, ...next };
    if (v.q?.trim()) p.set("q", v.q.trim());
    if (v.role) p.set("role", v.role);
    if (v.status) p.set("status", v.status);
    router.push(`/people${p.size ? `?${p}` : ""}`);
  };
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go({});
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <label htmlFor="people-q" className="sr-only">Search by name or email</label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
        <input id="people-q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name or email starts with…" className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface pr-3 pl-9 text-sm placeholder:text-fg-3 focus:border-line-strong focus:outline-none" />
      </div>
      <label className="sr-only" htmlFor="people-role">Role</label>
      <Select id="people-role" value={role ?? ""} onChange={(e) => go({ role: e.target.value || undefined })} className="!w-auto min-w-36">
        <option value="">All roles</option>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </Select>
      <label className="sr-only" htmlFor="people-status">Status</label>
      <Select id="people-status" value={status ?? ""} onChange={(e) => go({ status: e.target.value || undefined })} className="!w-auto min-w-36">
        <option value="">Any status</option>
        {USER_STATUSES.filter((s) => s !== "invited").map((s) => <option key={s} value={s}>{USER_STATUS_LABEL[s]}</option>)}
      </Select>
    </form>
  );
}
