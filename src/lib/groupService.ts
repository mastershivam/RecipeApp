import { supabase } from "./supabaseClient";
import type { Group, GroupMember, GroupMemberStatus, GroupRole } from "./types";

export type GroupSummary = Group & { role: GroupRole; status: GroupMemberStatus };
export type GroupMemberWithEmail = GroupMember & { email: string };

export async function listGroups(): Promise<GroupSummary[]> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("group_members")
    .select("role,status,groups(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row: any) => ({
      ...(row.groups as Group),
      role: row.role as GroupRole,
      status: row.status as GroupMemberStatus,
    }))
    .filter((row: GroupSummary) => !!row.id);
}

export async function listGroupInvites(): Promise<GroupSummary[]> {
  const groups = await listGroups();
  return groups.filter((g) => g.status === "pending");
}

export async function listGroupAdmins(): Promise<GroupSummary[]> {
  const groups = await listGroups();
  return groups.filter((g) => g.status === "accepted" && (g.role === "owner" || g.role === "admin"));
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function createGroup(name: string) {
  const token = await getAccessToken();
  const res = await fetch("/api/group-create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { group: Group };
}

export async function renameGroup(groupId: string, name: string) {
  const token = await getAccessToken();
  const res = await fetch("/api/group-rename", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId, name }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function deleteGroup(groupId: string) {
  const token = await getAccessToken();
  const res = await fetch("/api/group-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function inviteToGroup(groupId: string, email: string, role: GroupRole) {
  const token = await getAccessToken();
  const res = await fetch("/api/group-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId, email, role }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { member: GroupMemberWithEmail };
}

export async function respondToInvite(groupId: string, accept: boolean) {
  const token = await getAccessToken();
  try {
    const res = await fetch("/api/group-respond", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupId, accept }),
    });
    if (res.ok) return;
    const detail = await res.text();
    if (res.status !== 404) {
      throw new Error(detail || `Invite update failed (${res.status})`);
    }
  } catch (err: any) {
    if (err instanceof Error && !err.message.includes("404")) {
      throw err;
    }
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

  const status = accept ? "accepted" : "declined";
  const { data, error } = await supabase
    .from("group_members")
    .update({ status })
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invite not found.");
}

export async function listGroupMembers(groupId: string) {
  const token = await getAccessToken();
  const res = await fetch(`/api/group-members?groupId=${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  const payload = (await res.json()) as { members: GroupMemberWithEmail[] };
  return payload.members ?? [];
}

export async function removeGroupMember(groupId: string, memberId: string) {
  const token = await getAccessToken();
  const res = await fetch("/api/group-remove", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId, memberId }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateGroupMemberRole(groupId: string, memberId: string, role: GroupRole) {
  const token = await getAccessToken();
  const res = await fetch("/api/group-role-update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId, memberId, role }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function shareRecipeToGroup(recipeId: string, groupId: string, permission: "view" | "edit") {
  const token = await getAccessToken();
  const res = await fetch("/api/group-share", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipeId, groupId, permission }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { share: { id: string; groupId: string; groupName: string; permission: "view" | "edit" } };
}

export async function listGroupShares(recipeId: string) {
  const token = await getAccessToken();
  const res = await fetch(`/api/group-share-list?recipeId=${recipeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { shares: { id: string; groupId: string; groupName: string; permission: "view" | "edit" }[] };
}

export async function updateGroupShare(shareId: string, permission: "view" | "edit") {
  const token = await getAccessToken();
  const res = await fetch("/api/group-share-update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ shareId, permission }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function revokeGroupShare(shareId: string) {
  const token = await getAccessToken();
  const res = await fetch("/api/group-share-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ shareId }),
  });
  if (!res.ok) throw new Error(await res.text());
}
