type Invite = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
};

export function PendingInvitesList({ invites }: { invites: Invite[] }) {
  if (invites.length === 0) {
    return <p className="text-sm text-zinc-500">No pending invites.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="flex items-center justify-between px-4 py-3"
        >
          <span className="text-zinc-900">{invite.email}</span>
          <span className="text-sm text-zinc-500 capitalize">
            {invite.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
