type Invite = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
};

export function PendingInvitesList({ invites }: { invites: Invite[] }) {
  if (invites.length === 0) {
    return <p className="text-sm text-muted">No pending invites.</p>;
  }

  return (
    <ul className="divide-y divide-divider border border-divider bg-transparent">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="flex items-center justify-between px-4 py-3"
        >
          <span className="text-foreground">{invite.email}</span>
          <span className="text-sm text-muted capitalize">
            {invite.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
