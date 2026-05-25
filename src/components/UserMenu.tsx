"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@/server/auth";

export function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const label = user.name ?? user.email;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        className="nav-link profile-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="profile-menu-name">{label}</span>
        <span className="role-pill">{user.role}</span>
      </button>
      {open ? (
        <div className="profile-popover" role="menu">
          <div className="profile-popover-header">
            <strong>{label}</strong>
            <span>{user.email}</span>
          </div>
          {user.role === "admin" ? (
            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)}>
              Admin page
            </Link>
          ) : null}
          <Link role="menuitem" href="/api/auth/signout">
            Log out
          </Link>
        </div>
      ) : null}
    </div>
  );
}
