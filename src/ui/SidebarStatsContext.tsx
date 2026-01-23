import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/UseAuth";
import { supabase } from "../lib/supabaseClient";

export type SidebarStat = { label: string; value: string };

type SidebarStatsContextValue = {
  stats: SidebarStat[] | null;
  setStats: (stats: SidebarStat[] | null) => void;
};

const SidebarStatsContext = createContext<SidebarStatsContextValue | null>(null);

export function SidebarStatsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<SidebarStat[] | null>(null);
  useEffect(() => {
    if (!user) {
      setStats(null);
      return;
    }
    let cancelled = false;
    async function loadStats() {
      const recipesCount = await supabase
        .from("recipes")
        .select("id", { count: "exact", head: true });
      const photosCount = await supabase
        .from("recipe_photos")
        .select("id", { count: "exact", head: true });
      const tagsResult = await supabase.from("recipes").select("tags");
      if (cancelled) return;
      if (recipesCount.error || photosCount.error || tagsResult.error) return;

      const tagSet = new Set<string>();
      for (const row of tagsResult.data ?? []) {
        const tags = Array.isArray(row.tags) ? row.tags : [];
        for (const t of tags) tagSet.add(t);
      }

      setStats([
        { label: "recipes", value: String(recipesCount.count ?? 0).padStart(2, "0") },
        { label: "tags", value: String(tagSet.size).padStart(2, "0") },
        { label: "with photos", value: String(photosCount.count ?? 0).padStart(2, "0") },
      ]);
    }
    function handleRefresh() {
      loadStats();
    }
    loadStats();
    window.addEventListener("stats-refresh", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("stats-refresh", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, [user]);
  const value = useMemo(() => ({ stats, setStats }), [stats]);
  return <SidebarStatsContext.Provider value={value}>{children}</SidebarStatsContext.Provider>;
}

export function useSidebarStats() {
  const ctx = useContext(SidebarStatsContext);
  if (!ctx) throw new Error("useSidebarStats must be used within SidebarStatsProvider");
  return ctx;
}
