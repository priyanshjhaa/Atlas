"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, Bell, ChevronDown, Database, GitBranch, LayoutDashboard, LogOut, Menu, Network, PanelLeftClose, Search, Settings, Zap } from "lucide-react";
import { AtlasMark } from "@/components/brand";
import { authClient } from "@/lib/auth-client";
import type { AtlasWorkspaceData } from "@/lib/api-types";
import { StatusDot } from "./shared";

const navItems = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/impact/new", label: "Impact analysis", icon: Zap },
  { href: "/app/graph", label: "Engineering graph", icon: Network },
  { href: "/app/architecture", label: "Architecture", icon: GitBranch },
  { href: "/app/search", label: "Search", icon: Search },
];

const utilityItems = [
  { href: "/app/sources", label: "Sources", icon: Database },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

export function AppShell({ workspaceData, children }: { workspaceData: AtlasWorkspaceData; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = workspaceData;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(workspaceData.activeWorkspace.id);
  const activeWorkspace = me.workspaces.find((item) => item.id === activeWorkspaceId) ?? workspaceData.activeWorkspace;
  const activeRepositories = workspaceData.repositories.filter(
    (repository) => repository.isActive,
  );
  const synchronizedRepositories = activeRepositories.filter(
    (repository) => repository.lastSyncedAt,
  );
  const indexCoverage = activeRepositories.length
    ? Math.round(
        (synchronizedRepositories.length / activeRepositories.length) * 100,
      )
    : 0;

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  async function selectWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspace.id) {
      setWorkspaceOpen(false);
      return;
    }

    setSwitchingWorkspace(true);
    const response = await fetch("/api/workspace-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });

    if (response.ok) {
      setActiveWorkspaceId(workspaceId);
      setWorkspaceOpen(false);
      router.refresh();
    }
    setSwitchingWorkspace(false);
  }

  return (
    <div className={`app-frame ${collapsed ? "sidebar-collapsed" : ""}`}>
      <button className="mobile-nav-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation"><Menu size={18} /></button>
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-top"><AtlasMark compact={collapsed} /><button onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}><PanelLeftClose size={17} /></button></div>
        <div className="sidebar-system-label"><span>Living system map</span><i>SYNCED</i></div>
        <div className="workspace-control">
          <button className="workspace-switcher" onClick={() => setWorkspaceOpen((current) => !current)} aria-expanded={workspaceOpen}><span>{initials(activeWorkspace.name)}</span><div><b>{activeWorkspace.name}</b><small>{activeWorkspace.repositoryCount} {activeWorkspace.repositoryCount === 1 ? "repository" : "repositories"}</small></div><ChevronDown size={14} /></button>
          {workspaceOpen && <div className="workspace-menu"><b>Your workspaces</b>{me.workspaces.map((item) => <button className={item.id === activeWorkspace.id ? "active" : ""} disabled={switchingWorkspace} key={item.id} onClick={() => void selectWorkspace(item.id)}><span>{item.name}</span><small>{item.role} · {item.repositoryCount} repos</small></button>)}<Link href="/app/settings" onClick={() => setWorkspaceOpen(false)}>Workspace settings</Link></div>}
        </div>
        <p className="nav-section-label">Intelligence</p>
        <nav aria-label="Workspace">{navItems.map((item) => { const Icon = item.icon; const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href.replace("/new", "")); return <Link className={active ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><Icon size={17} /><span>{item.label}</span>{item.label === "Impact analysis" && <i>MAP</i>}</Link>; })}</nav>
        <p className="nav-section-label nav-section-label--utility">Operations</p>
        <nav className="sidebar-utility" aria-label="Workspace utilities">{utilityItems.map((item) => { const Icon = item.icon; return <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><Icon size={17} /><span>{item.label}</span></Link>; })}</nav>
        <div className="index-card"><div><span>Index coverage</span><b>{indexCoverage}%</b></div><div className="mini-progress"><i style={{ width: `${indexCoverage}%` }} /></div><p><StatusDot state={indexCoverage === 100 ? "ready" : indexCoverage > 0 ? "running" : "warning"} /> {synchronizedRepositories.length} of {activeRepositories.length} synchronized</p></div>
        <div className="sidebar-user"><i>{initials(me.user.name)}</i><div><b>{me.user.name}</b><span>{me.user.email}</span></div><button onClick={signOut} disabled={signingOut} aria-label="Sign out"><LogOut size={15} /></button></div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="app-main"><div className="app-topbar"><div className="topbar-primary"><span className="topbar-context">ATLAS / {activeWorkspace.slug} / SYSTEM MAP</span><Link href="/app/search" className="global-search"><Search size={15} /><span>Search the living workspace map…</span><kbd>⌘ K</kbd></Link></div><div><span className="topbar-clock">CONTEXT MAP</span><Link href="/app/activity" className="topbar-icon" aria-label="Synchronization activity"><Bell size={17} />{indexCoverage < 100 && <i />}</Link><span className="freshness"><StatusDot state={indexCoverage === 100 ? "ready" : indexCoverage > 0 ? "running" : "warning"} /> {indexCoverage === 100 ? "Graph current" : "Index incomplete"}</span></div></div><div className="page-content">{children}</div></main>
    </div>
  );
}
