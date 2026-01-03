import { useEffect, useMemo, useState } from "react";
import type { GroupMemberWithEmail, GroupSummary } from "../lib/groupService";
import {
  createGroup,
  deleteGroup,
  inviteToGroup,
  listGroupInvites,
  listGroupMembers,
  listGroups,
  removeGroupMember,
  renameGroup,
  respondToInvite,
  updateGroupMemberRole,
} from "../lib/groupService";
import type { GroupRole } from "../lib/types";

type GroupMembersState = Record<string, GroupMemberWithEmail[]>;

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [invites, setInvites] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createName, setCreateName] = useState("");
  const [members, setMembers] = useState<GroupMembersState>({});
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [inviteRole, setInviteRole] = useState<Record<string, GroupRole>>({});
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [groupList, inviteList] = await Promise.all([listGroups(), listGroupInvites()]);
      setGroups(groupList.filter((g) => g.status === "accepted"));
      setInvites(inviteList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    const name = createName.trim();
    if (!name) return;
    try {
      await createGroup(name);
      setCreateName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group.");
    }
  }

  async function toggleGroup(groupId: string) {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
      return;
    }
    setExpandedGroupId(groupId);
    if (!members[groupId]) {
      try {
        const list = await listGroupMembers(groupId);
        setMembers((prev) => ({ ...prev, [groupId]: list }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load members.");
      }
    }
  }

  async function handleInvite(groupId: string) {
    const email = (inviteEmail[groupId] || "").trim();
    if (!email) return;
    const role = inviteRole[groupId] || "member";
    try {
      await inviteToGroup(groupId, email, role);
      setInviteEmail((prev) => ({ ...prev, [groupId]: "" }));
      const list = await listGroupMembers(groupId);
      setMembers((prev) => ({ ...prev, [groupId]: list }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member.");
    }
  }

  async function handleRemove(groupId: string, memberId: string) {
    try {
      await removeGroupMember(groupId, memberId);
      const list = await listGroupMembers(groupId);
      setMembers((prev) => ({ ...prev, [groupId]: list }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member.");
    }
  }

  async function handleRoleChange(groupId: string, memberId: string, role: GroupRole) {
    try {
      await updateGroupMemberRole(groupId, memberId, role);
      const list = await listGroupMembers(groupId);
      setMembers((prev) => ({ ...prev, [groupId]: list }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role.");
    }
  }

  async function handleRename(groupId: string) {
    const name = (renameDraft[groupId] || "").trim();
    if (!name) return;
    try {
      await renameGroup(groupId, name);
      setRenameDraft((prev) => ({ ...prev, [groupId]: "" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename group.");
    }
  }

  async function handleDelete(groupId: string) {
    if (!confirm("Delete this group?")) return;
    try {
      await deleteGroup(groupId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group.");
    }
  }

  async function handleInviteResponse(groupId: string, accept: boolean) {
    try {
      await respondToInvite(groupId, accept);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to respond.");
    }
  }

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );

  if (loading) return <div className="card">Loading groups…</div>;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="h2">Create group</div>
        <div className="row">
          <input
            className="input"
            placeholder="Group name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <button className="btn primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>

      {error && <div className="toast error">{error}</div>}

      {invites.length > 0 && (
        <div className="card stack">
          <div className="h2">Invites</div>
          <div className="share-list">
            {invites.map((invite) => (
              <div key={invite.id} className="share-row">
                <div className="share-email">{invite.name}</div>
                <div className="share-actions">
                  <button className="btn" onClick={() => handleInviteResponse(invite.id, true)}>
                    Accept
                  </button>
                  <button className="btn danger" onClick={() => handleInviteResponse(invite.id, false)}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stack">
        {sortedGroups.length === 0 ? (
          <div className="card muted">No groups yet.</div>
        ) : (
          sortedGroups.map((group) => {
            const isOwner = group.role === "owner";
            const isAdmin = isOwner || group.role === "admin";
            const groupMembers = members[group.id] || [];
            return (
              <div key={group.id} className="card stack">
                <div className="row" style={{ alignItems: "center" }}>
                  <div className="h2">{group.name}</div>
                  <div className="muted small">{group.role}</div>
                  <div style={{ flex: 0 }} className="row">
                    <button className="btn" onClick={() => toggleGroup(group.id)}>
                      {expandedGroupId === group.id ? "Hide" : "Manage"}
                    </button>
                    {isOwner && (
                      <button className="btn danger" onClick={() => handleDelete(group.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {expandedGroupId === group.id && (
                  <div className="stack">
                    {isOwner && (
                      <div className="row">
                        <input
                          className="input"
                          placeholder="Rename group"
                          value={renameDraft[group.id] ?? ""}
                          onChange={(e) =>
                            setRenameDraft((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                        />
                        <button className="btn" onClick={() => handleRename(group.id)}>
                          Rename
                        </button>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="row">
                        <input
                          className="input"
                          placeholder="Invite by email"
                          value={inviteEmail[group.id] ?? ""}
                          onChange={(e) =>
                            setInviteEmail((prev) => ({ ...prev, [group.id]: e.target.value }))
                          }
                        />
                        <select
                          className="select"
                          value={inviteRole[group.id] ?? "member"}
                          onChange={(e) =>
                            setInviteRole((prev) => ({ ...prev, [group.id]: e.target.value as GroupRole }))
                          }
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="btn" onClick={() => handleInvite(group.id)}>
                          Invite
                        </button>
                      </div>
                    )}

                    <div className="share-list">
                      {groupMembers.length === 0 ? (
                        <div className="muted small">No members found.</div>
                      ) : (
                        groupMembers.map((member) => (
                          <div key={member.id} className="share-row">
                            <div className="share-email">
                              {member.email} · {member.role} · {member.status}
                            </div>
                            <div className="share-actions">
                              {isOwner && member.role !== "owner" && (
                                <select
                                  className="select"
                                  value={member.role}
                                  onChange={(e) =>
                                    handleRoleChange(group.id, member.id, e.target.value as GroupRole)
                                  }
                                >
                                  <option value="member">Member</option>
                                  <option value="admin">Admin</option>
                                </select>
                              )}
                              {isAdmin && member.role !== "owner" && (
                                <button
                                  className="btn danger"
                                  onClick={() => handleRemove(group.id, member.id)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
