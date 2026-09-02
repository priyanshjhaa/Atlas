"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AtlasMark } from "@/components/brand";

const links = [
  { href: "#product", label: "Product" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#evidence", label: "Evidence" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <nav className={`floating-nav ${open ? "is-open" : ""}`} aria-label="Primary navigation">
      <AtlasMark />
      <div className="nav-links">
        {links.map((link) => <a href={link.href} key={link.href}>{link.label}</a>)}
      </div>
      <Link href="/app" className="button button--small button--ghost">
        Open workspace <ArrowRight size={15} />
      </Link>
      <button
        ref={menuButtonRef}
        className="menu-button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={19} /> : <Menu size={19} />}
      </button>
      {open && (
        <div className="mobile-menu">
          {links.map((link) => <a href={link.href} key={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
          <Link href="/app" onClick={() => setOpen(false)}>Open workspace <ArrowRight size={15} /></Link>
        </div>
      )}
    </nav>
  );
}
