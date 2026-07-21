"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Bell, ChevronDown, Database, GitBranch, LayoutDashboard, LogOut, Menu, Network, PanelLeftClose, Search, Settings, Zap } from "lucide-react";
import { AtlasMark } from "@/components/brand";
import { authClient } from "@/lib/auth-client";
import type { AtlasSession } from "@/lib/auth";
import { workspace } from "@/lib/mock-data";
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

export function AppShell({ user, children }: { user: AtlasSession["user"]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  return (
    <div className="app-frame">
      <button className="mobile-nav-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation"><Menu size={18} /></button>
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-top"><AtlasMark /><button aria-label="Collapse sidebar"><PanelLeftClose size={17} /></button></div>
        <button className="workspace-switcher"><span>{workspace.initials}</span><div><b>{workspace.name}</b><small>12 repositories</small></div><ChevronDown size={14} /></button>
        <nav aria-label="Workspace">{navItems.map((item) => { const Icon = item.icon; const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href.replace("/new", "")); return <Link className={active ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><Icon size={17} /><span>{item.label}</span>{item.label === "Impact analysis" && <i>NEW</i>}</Link>; })}</nav>
        <nav className="sidebar-utility" aria-label="Workspace utilities">{utilityItems.map((item) => { const Icon = item.icon; return <Link className={pathname.startsWith(item.href) ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><Icon size={17} /><span>{item.label}</span></Link>; })}</nav>
        <div className="index-card"><div><span>Index coverage</span><b>{workspace.coverage}%</b></div><div className="mini-progress"><i style={{ width: `${workspace.coverage}%` }} /></div><p><StatusDot /> Updated {workspace.indexedAt}</p></div>
        <div className="sidebar-user"><i>{initials(user.name)}</i><div><b>{user.name}</b><span>{user.email}</span></div><button onClick={signOut} disabled={signingOut} aria-label="Sign out"><LogOut size={15} /></button></div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="app-main"><div className="app-topbar"><div className="global-search"><Search size={15} /><span>Search {workspace.name}…</span><kbd>⌘ K</kbd></div><div><button aria-label="Notifications"><Bell size={17} /><i /></button><span className="freshness"><StatusDot /> Graph current</span></div></div><div className="page-content">{children}</div></main>
    </div>
  );
}
