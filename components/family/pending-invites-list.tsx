import { EmptyState } from "@/components/ui/empty-state";

type Invite = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
};

export function PendingInvitesList({ invites }: { invites: Invite[] }) {
  if (invites.length === 0) {
    // No action button: the invite form sits directly above this list on
    // the only page that renders it, so a CTA here would point at something
    // already on screen.
    return (
      <EmptyState
        title="No invites yet"
        description="Invites you send show up here with their status until they're accepted."
      />
    );
  }

  return (
    <ul className="divide-y divide-divider border border-divider bg-transparent">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
        >
          <span className="min-w-0 [overflow-wrap:anywhere] text-foreground">
            {invite.email}
          </span>
          <span className="flex-shrink-0 text-sm text-muted capitalize">
            {invite.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
