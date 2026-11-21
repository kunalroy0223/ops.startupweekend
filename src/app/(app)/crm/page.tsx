import type { Metadata } from "next";
import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { isAdmin } from "@/domain/authz";
import type { CrmAccount, CrmContact } from "@/domain/types";
import { listWorkspaces, pickablePeople } from "@/server/queries";
import { listCrmAccounts, listCrmContacts } from "@/server/services/crm";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { actor } = await requireActive();
  const params = await searchParams;
  const workspaces = await listWorkspaces(actor);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === params.workspaceId) ?? workspaces[0];

  let accounts: CrmAccount[] = [];
  let contacts: CrmContact[] = [];
  if (selectedWorkspace) {
    [accounts, contacts] = await Promise.all([
      listCrmAccounts(actor, selectedWorkspace.id),
      listCrmContacts(actor, selectedWorkspace.id),
    ]);
  }

  const people = isAdmin(actor)
    ? (await pickablePeople(actor)).filter((person) => person.status === "active").map((person) => ({ uid: person.uid, displayName: person.displayName, email: person.email }))
    : [{ uid: actor.uid, displayName: actor.displayName, email: actor.email }];

  return (
    <CrmWorkspace
      accounts={accounts}
      contacts={contacts}
      workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))}
      selectedWorkspaceId={selectedWorkspace?.id ?? ""}
      currentUserId={actor.uid}
      role={actor.role}
      people={people}
    />
  );
}
