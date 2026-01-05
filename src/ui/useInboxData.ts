import { useEffect, useState } from "react";
import type { GroupSummary } from "../lib/groupService";
import { listGroupInvites, respondToInvite } from "../lib/groupService";
import { listSharedRecipes, type SharedRecipe } from "../lib/recipeService";

export function useInboxData(enabled = true) {
  const [invites, setInvites] = useState<GroupSummary[]>([]);
  const [shares, setShares] = useState<SharedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [dismissedShareIds, setDismissedShareIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("dismissedShares");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [inviteRows, shareRows] = await Promise.all([listGroupInvites(), listSharedRecipes()]);
        if (cancelled) return;
        setInvites(inviteRows);
        const filteredShares = (shareRows ?? []).filter(
          (row) => !dismissedShareIds.includes(row.recipe.id)
        );
        setShares(filteredShares);
      } catch (err: any) {
        const message = err?.message || String(err) || "Failed to load inbox.";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function handleInvite(groupId: string, accept: boolean) {
    setBusyGroupId(groupId);
    setError(null);
    try {
      await respondToInvite(groupId, accept);
      setInvites((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err: any) {
      const message = err?.message || String(err) || "Failed to update invite.";
      setError(message);
    } finally {
      setBusyGroupId(null);
    }
  }

  function markShareSeen(recipeId: string) {
    setShares((prev) => prev.filter((share) => share.recipe.id !== recipeId));
    setDismissedShareIds((prev) => {
      if (prev.includes(recipeId)) return prev;
      const next = [...prev, recipeId];
      try {
        localStorage.setItem("dismissedShares", JSON.stringify(next));
      } catch {
        // Ignore storage errors; keep local state updated.
      }
      return next;
    });
  }

  function clearAllShares() {
    setShares([]);
    setDismissedShareIds((prev) => {
      const allIds = Array.from(new Set([...prev, ...shares.map((share) => share.recipe.id)]));
      try {
        localStorage.setItem("dismissedShares", JSON.stringify(allIds));
      } catch {
        // Ignore storage errors; keep local state updated.
      }
      return allIds;
    });
  }

  return {
    invites,
    shares,
    loading,
    error,
    busyGroupId,
    handleInvite,
    markShareSeen,
    clearAllShares,
  };
}
