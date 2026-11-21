import type { Metadata } from "next";
import { CrmWorkflowNav } from "@/components/crm/crm-workflow-nav";
import { CrmWorkflowWorkspace } from "@/components/crm/crm-workflow-workspace";
import { isAdmin } from "@/domain/authz";
import { listWorkspaces, pickablePeople } from "@/server/queries";
import { listCrmAccounts, listCrmContacts } from "@/server/services/crm";
import { listCrmWorkflowData } from "@/server/services/crm-workflows";
import { listTasks } from "@/server/services/tasks";
import { requireActive } from "@/server/session";

export const metadata: Metadata = { title: "CRM workflows" };
export const dynamic = "force-dynamic";

export default async function CrmWorkflowsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string; campaignId?: string; memberId?: string }> }) {
  const { actor } = await requireActive();
  const params = await searchParams;
  const workspaces = await listWorkspaces(actor);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === params.workspaceId) ?? workspaces[0];
  if (!selectedWorkspace) {
    return <p className="rounded-xl border border-line bg-surface p-5 text-sm text-fg-2">No active workspace is available for CRM workflows.</p>;
  }

  const peoplePromise = isAdmin(actor)
    ? pickablePeople(actor).then((users) => users.filter((user) => user.status === "active").map((user) => ({ uid: user.uid, displayName: user.displayName, email: user.email })))
    : Promise.resolve([{ uid: actor.uid, displayName: actor.displayName, email: actor.email }]);

  const [data, accounts, contacts, people, tasks] = await Promise.all([
    listCrmWorkflowData(actor, selectedWorkspace.id),
    listCrmAccounts(actor, selectedWorkspace.id),
    listCrmContacts(actor, selectedWorkspace.id),
    peoplePromise,
    listTasks(actor),
  ]);

  return (
    <div className="grid gap-5">
      <CrmWorkflowNav active="workflows" workspaceId={selectedWorkspace.id} />
      <CrmWorkflowWorkspace
        key={`${selectedWorkspace.id}:${params.campaignId ?? ""}:${params.memberId ?? ""}`}
        workspaceId={selectedWorkspace.id}
        workspaceName={selectedWorkspace.name}
        workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))}
        initialCampaignId={params.campaignId}
        initialMemberId={params.memberId}
        role={actor.role}
        currentUserId={actor.uid}
        people={people}
        accounts={[...new Map([...accounts, ...data.workflowAccounts].map((account) => [account.id, account])).values()]}
        contacts={[...new Map([...contacts, ...data.workflowContacts].map((contact) => [contact.id, contact])).values()]}
        opportunities={data.opportunities}
        campaigns={data.campaigns}
        members={data.members}
        activities={data.activities}
        tasks={tasks.filter((task) => task.workspaceId === selectedWorkspace.id)}
      />
    </div>
  );
}
