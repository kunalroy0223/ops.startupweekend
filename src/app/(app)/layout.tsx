import { AppShell } from "@/components/shell/app-shell";
import { navFor } from "@/domain/authz";
import { unreadCount } from "@/server/queries";
import { requireActive } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { actor } = await requireActive();
  const unread = await unreadCount(actor);
  return (
    <AppShell nav={navFor(actor)} unread={unread} user={{ uid: actor.uid, displayName: actor.displayName, email: actor.email, role: actor.role }}>
      {children}
    </AppShell>
  );
}
