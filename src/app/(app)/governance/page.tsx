import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GovernanceWorkspace } from "@/components/governance/governance-workspace";
import { isAdmin } from "@/domain/authz";
import { listDirectory } from "@/server/queries";
import { requireActive } from "@/server/session";
import { listGovernanceWorkspace } from "@/server/services/operational-modules";

export const metadata: Metadata = { title: "Administration, Audit & Governance" };
export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const { actor } = await requireActive();
  if (!isAdmin(actor)) redirect("/overview");
  const [data, directory] = await Promise.all([listGovernanceWorkspace(actor), listDirectory(actor, {})]);
  const people = directory.users.filter((u) => u.status === "active").map(({ uid, displayName, role }) => ({ uid, displayName, role }));
  return <GovernanceWorkspace currentUserId={actor.uid} policies={data.policies} reviews={data.reviews} audit={data.audit} people={people} />;
}
