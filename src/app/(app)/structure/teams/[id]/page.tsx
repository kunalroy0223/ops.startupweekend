import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScopeDetailView } from "@/components/structure/scope-detail";
import { hasPermission } from "@/domain/authz";
import { getOrganization, getScopeDetail, listStructure, pickablePeople } from "@/server/queries";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "Team" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await requireActive();
  const detail = await getScopeDetail(actor, "team", id);
  if (!detail) notFound();
  const canManage = hasPermission(actor, "memberships.manage");
  const [people, structure, org] = await Promise.all([pickablePeople(actor), canManage ? listStructure(actor) : Promise.resolve({ workstreams: [], teams: [] }), getOrganization()]);
  return <ScopeDetailView detail={detail} canManage={canManage} people={people} allWorkstreams={structure.workstreams.map((w) => ({ id: w.id, name: w.name, workspaceId: w.workspaceId }))} tz={org?.timezone} />;
}
