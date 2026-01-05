import InboxPanel from "../ui/InboxPanel";
import { useInboxData } from "../ui/useInboxData";

export default function InboxPage() {
  const {
    invites,
    shares,
    loading,
    error,
    busyGroupId,
    handleInvite,
    markShareSeen,
    clearAllShares,
  } = useInboxData();

  return (
    <InboxPanel
      variant="page"
      invites={invites}
      shares={shares}
      loading={loading}
      error={error}
      busyGroupId={busyGroupId}
      onInvite={handleInvite}
      onOpenShare={markShareSeen}
      onDismissShare={markShareSeen}
      onClearShares={clearAllShares}
    />
  );
}
