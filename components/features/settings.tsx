"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  Database,
  Download,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  AtlasApiUser,
  AtlasWorkspace,
  AtlasWorkspaceMember,
  AtlasWorkspaceRole,
} from "@/lib/api-types";
import styles from "./settings.module.css";

type SettingsSection =
  | "workspace"
  | "members"
  | "access"
  | "notifications"
  | "privacy";

const sections: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof Settings;
}> = [
  { id: "workspace", label: "Workspace", icon: Settings },
  { id: "members", label: "Members", icon: Users },
  { id: "access", label: "Access & roles", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Data & privacy", icon: Database },
];

const assignableRoles: Array<Exclude<AtlasWorkspaceRole, "owner">> = [
  "admin",
  "member",
  "viewer",
];

const roleDetails: Array<{
  role: AtlasWorkspaceRole;
  description: string;
  permissions: string;
}> = [
  { role: "owner", description: "Workspace authority", permissions: "All settings, roles, sources, and data controls" },
  { role: "admin", description: "Operational administrator", permissions: "Workspace details, members, sources, and syncs" },
  { role: "member", description: "Engineering contributor", permissions: "Search, graphs, reports, and synchronization" },
  { role: "viewer", description: "Read-only collaborator", permissions: "Search, graphs, reports, and activity viewing" },
];

async function readMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  if (Array.isArray(body?.message)) return body.message.join(" ");
  return body?.message ?? fallback;
}

function memberInitials(member: AtlasWorkspaceMember) {
  return member.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SettingsPage({
  currentUser,
  initialMembers,
  workspace,
}: {
  currentUser: AtlasApiUser;
  initialMembers: AtlasWorkspaceMember[];
  workspace: AtlasWorkspace;
}) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SettingsSection>("workspace");
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [savedWorkspaceName, setSavedWorkspaceName] = useState(workspace.name);
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<AtlasWorkspaceRole, "owner">>("member");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const canAdminister = workspace.role === "owner" || workspace.role === "admin";
  const isOwner = workspace.role === "owner";
  const roleCounts = useMemo(
    () =>
      roleDetails.reduce<Record<AtlasWorkspaceRole, number>>(
        (counts, item) => ({
          ...counts,
          [item.role]: members.filter((member) => member.role === item.role).length,
        }),
        { owner: 0, admin: 0, member: 0, viewer: 0 },
      ),
    [members],
  );

  function selectSection(section: SettingsSection) {
    setActiveSection(section);
    setNotice(null);
  }

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (name.length < 2 || name.length > 80) {
      setNotice({ tone: "error", text: "Workspace names must contain between 2 and 80 characters." });
      return;
    }
    setBusy("workspace");
    setNotice(null);
    const response = await fetch("/api/workspace-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, name }),
    });
    if (response.ok) {
      setWorkspaceName(name);
      setSavedWorkspaceName(name);
      setNotice({ tone: "success", text: "Workspace details updated." });
      router.refresh();
    } else {
      setNotice({ tone: "error", text: await readMessage(response, "Atlas could not update this workspace.") });
    }
    setBusy(null);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("invite");
    setNotice(null);
    const response = await fetch("/api/workspace-settings/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, email: email.trim(), role: inviteRole }),
    });
    if (response.ok) {
      const member = (await response.json()) as AtlasWorkspaceMember;
      setMembers((current) => [...current, member]);
      setEmail("");
      setNotice({ tone: "success", text: `${member.name} was added to the workspace.` });
    } else {
      setNotice({ tone: "error", text: await readMessage(response, "Atlas could not add this member.") });
    }
    setBusy(null);
  }

  async function updateMemberRole(member: AtlasWorkspaceMember, role: Exclude<AtlasWorkspaceRole, "owner">) {
    setBusy(`role:${member.id}`);
    setNotice(null);
    const response = await fetch(`/api/workspace-settings/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, role }),
    });
    if (response.ok) {
      const updated = (await response.json()) as AtlasWorkspaceMember;
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice({ tone: "success", text: `${updated.name} is now a ${updated.role}.` });
    } else {
      setNotice({ tone: "error", text: await readMessage(response, "Atlas could not change this role.") });
    }
    setBusy(null);
  }

  async function removeMember(member: AtlasWorkspaceMember) {
    if (!window.confirm(`Remove ${member.name} from ${savedWorkspaceName}?`)) return;
    setBusy(`remove:${member.id}`);
    setNotice(null);
    const response = await fetch(`/api/workspace-settings/members/${member.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (response.ok) {
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setNotice({ tone: "success", text: `${member.name} was removed from the workspace.` });
    } else {
      setNotice({ tone: "error", text: await readMessage(response, "Atlas could not remove this member.") });
    }
    setBusy(null);
  }

  async function purgeExpiredFeedback() {
    if (!window.confirm("Apply the configured retention policy to expired pilot feedback now?")) return;
    setBusy("purge");
    setNotice(null);
    const response = await fetch("/api/workspace-settings/privacy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    if (response.ok) {
      const result = (await response.json()) as { deletedCount: number };
      setNotice({ tone: "success", text: `Retention policy applied. ${result.deletedCount} expired record${result.deletedCount === 1 ? "" : "s"} removed.` });
    } else {
      setNotice({ tone: "error", text: await readMessage(response, "Atlas could not apply the retention policy.") });
    }
    setBusy(null);
  }

  function canRemove(member: AtlasWorkspaceMember) {
    if (!canAdminister || member.role === "owner" || member.userId === currentUser.id) return false;
    return isOwner || member.role !== "admin";
  }

  return (
    <div className="settings-page">
      <header className="settings-hero">
        <span>Workspace administration</span>
        <h1>Settings</h1>
        <p>Manage the identity, people, permissions, and data boundaries of your Atlas workspace.</p>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = section.id === activeSection;
            return (
              <button
                type="button"
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={() => selectSection(section.id)}
                key={section.id}
              >
                <Icon size={16} />
                <span>{section.label}</span>
                {section.id === "members" && <small>{members.length}</small>}
              </button>
            );
          })}
        </nav>

        <main className="panel settings-panel">
          <section className="settings-identity">
            <div className="settings-identity__mark"><ShieldCheck size={23} /></div>
            <div className="settings-identity__copy">
              <span><i /> Live workspace</span>
              <h2>{savedWorkspaceName}</h2>
              <p>{members.length} member{members.length === 1 ? "" : "s"} · configuration applies across search, graphs, reports, and connected sources.</p>
            </div>
            <div className="settings-identity__stats">
              <div><strong>{workspace.repositoryCount}</strong><span>Repositories</span></div>
              <div><strong>{workspace.role}</strong><span>Your role</span></div>
            </div>
          </section>

          {notice && (
            <p className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.tone === "success" && <Check size={15} />} {notice.text}
            </p>
          )}

          {activeSection === "workspace" && (
            <section className="settings-section" aria-labelledby="workspace-details-title">
              <header><div><span>Workspace identity</span><h3 id="workspace-details-title">Workspace details</h3></div><small>{canAdminister ? "Editable" : "Read-only"}</small></header>
              <form className={styles.form} onSubmit={saveWorkspace}>
                <label className={styles.field}>
                  <span>Display name</span>
                  <input aria-label="Display name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} minLength={2} maxLength={80} disabled={!canAdminister || busy === "workspace"} />
                  <small>This name appears in navigation, reports, and shared workspace views.</small>
                </label>
                <label className={styles.field}>
                  <span>Workspace slug</span>
                  <input aria-label="Workspace slug" value={workspace.slug} readOnly aria-readonly="true" />
                  <small>The stable workspace address is not changed when the display name changes.</small>
                </label>
                <div className={styles.formFooter}>
                  <span>{workspaceName.trim().length}/80 characters</span>
                  {canAdminister && <button className="button button--primary" disabled={busy === "workspace" || workspaceName.trim() === savedWorkspaceName} type="submit">{busy === "workspace" ? "Saving…" : "Save changes"}</button>}
                </div>
              </form>
              <div className="settings-links">
                <Link href="/app/sources"><i><Database size={18} /></i><span><b>Sources and permissions</b><small>Manage GitHub repositories and Notion access.</small></span><ArrowRight size={15} /></Link>
                <Link href="/app/activity"><i><RefreshCw size={18} /></i><span><b>Synchronization activity</b><small>Review indexing freshness, progress, and failures.</small></span><ArrowRight size={15} /></Link>
              </div>
            </section>
          )}

          {activeSection === "members" && (
            <section className="settings-section" aria-labelledby="members-title">
              <header><div><span>People</span><h3 id="members-title">Workspace members</h3></div><small>{members.length} total</small></header>
              {canAdminister && (
                <form className={styles.inviteForm} onSubmit={inviteMember}>
                  <label className={styles.field}><span>Member email</span><input aria-label="Member email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" required /></label>
                  <label className={styles.field}><span>Starting role</span><select aria-label="Starting role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<AtlasWorkspaceRole, "owner">)}>{assignableRoles.map((role) => <option value={role} key={role}>{role}</option>)}</select></label>
                  <button className="button button--primary" type="submit" disabled={busy === "invite"}><UserPlus size={15} /> {busy === "invite" ? "Adding…" : "Add member"}</button>
                  <small className={styles.formHint}>The person must have signed in to Atlas once before they can be added.</small>
                </form>
              )}
              <div className={styles.memberList}>{members.map((member) => (
                <article className={styles.memberRow} key={member.id}>
                  <span className={styles.avatar}>{memberInitials(member)}</span>
                  <span className={styles.memberIdentity}><b>{member.name}{member.userId === currentUser.id ? " (you)" : ""}</b><small>{member.email}</small></span>
                  <span className={styles.roleBadge}>{member.role}</span>
                  {canRemove(member) && <button className={styles.iconButton} type="button" aria-label={`Remove ${member.name}`} onClick={() => void removeMember(member)} disabled={busy === `remove:${member.id}`}><Trash2 size={15} /></button>}
                </article>
              ))}</div>
            </section>
          )}

          {activeSection === "access" && (
            <section className="settings-section" aria-labelledby="access-title">
              <header><div><span>Authorization</span><h3 id="access-title">Access and roles</h3></div><small>Least privilege</small></header>
              <div className={styles.roleGrid}>{roleDetails.map((item) => <article className={styles.roleCard} key={item.role}><span>{roleCounts[item.role]}</span><h4>{item.role}</h4><b>{item.description}</b><p>{item.permissions}</p></article>)}</div>
              <div className={styles.roleAssignments}>
                <div><span>Role assignments</span><h4>Manage access</h4><p>Only the workspace owner can promote or demote administrators and members.</p></div>
                <div>{members.map((member) => <label key={member.id}><span><b>{member.name}</b><small>{member.email}</small></span>{isOwner && member.role !== "owner" ? <select aria-label={`${member.name} role`} value={member.role} disabled={busy === `role:${member.id}`} onChange={(event) => void updateMemberRole(member, event.target.value as Exclude<AtlasWorkspaceRole, "owner">)}>{assignableRoles.map((role) => <option value={role} key={role}>{role}</option>)}</select> : <strong>{member.role}</strong>}</label>)}</div>
              </div>
            </section>
          )}

          {activeSection === "notifications" && (
            <section className="settings-section" aria-labelledby="notifications-title">
              <header><div><span>Delivery</span><h3 id="notifications-title">Notification channels</h3></div><small>Workspace status</small></header>
              <div className={styles.channelList}>
                <article><i><Bell size={18} /></i><span><b>In-app activity</b><small>Synchronization progress and failures are available in the workspace activity stream.</small></span><em>Active</em></article>
                <article><i><RefreshCw size={18} /></i><span><b>Synchronization alerts</b><small>Failed jobs remain visible until a successful refresh supersedes them.</small></span><Link href="/app/activity">Review activity <ArrowRight size={14} /></Link></article>
                <article><i><Database size={18} /></i><span><b>Email summaries</b><small>Email delivery is not configured for this Atlas deployment.</small></span><em className={styles.pending}>Not configured</em></article>
              </div>
            </section>
          )}

          {activeSection === "privacy" && (
            <section className="settings-section" aria-labelledby="privacy-title">
              <header><div><span>Data controls</span><h3 id="privacy-title">Data and privacy</h3></div><small>Audited actions</small></header>
              <div className={styles.privacySummary}><ShieldCheck size={20} /><div><b>Workspace-scoped data boundary</b><p>Every Atlas request is authorized against {savedWorkspaceName}. Source access can be revoked independently without changing workspace membership.</p></div></div>
              <div className={styles.dataActions}>
                <article><div><Download size={18} /><span><b>Export pilot feedback metrics</b><small>Download the bounded workspace feedback export as CSV.</small></span></div>{canAdminister ? <a className="button button--ghost" href={`/api/pilot-metrics/export?workspaceId=${encodeURIComponent(workspace.id)}`}>Download CSV</a> : <em>Admin access required</em>}</article>
                <article><div><Trash2 size={18} /><span><b>Apply feedback retention</b><small>Remove feedback records older than the server-configured retention window.</small></span></div>{canAdminister ? <button className="button button--ghost" type="button" onClick={() => void purgeExpiredFeedback()} disabled={busy === "purge"}>{busy === "purge" ? "Applying…" : "Apply policy"}</button> : <em>Admin access required</em>}</article>
                <article><div><Database size={18} /><span><b>Connected source data</b><small>Review or revoke GitHub and Notion access from the source control center.</small></span></div><Link className="button button--ghost" href="/app/sources">Manage sources</Link></article>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
