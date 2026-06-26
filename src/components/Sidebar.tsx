"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Role } from "@/types";

interface NavItem {
  label: string;
  href: string;
  roles: Role[]; // which roles can see this item
}

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", roles: ["admin", "manager", "employee"] },
  { label: "Departments", href: "/departments", roles: ["admin", "manager"] },
  { label: "My Scorecard", href: "/scorecard", roles: ["admin", "manager", "employee"] },
  { label: "My Evaluations", href: "/my-evaluations", roles: ["admin", "manager", "employee"] },
  { label: "Team View", href: "/team", roles: ["admin", "manager"] },
  { label: "Excel Sync", href: "/admin/sync", roles: ["admin"] },
  { label: "Settings", href: "/settings", roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const role = user?.role ?? "employee";

  const items = NAV.filter((i) => i.roles.includes(role));

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
          <span className="font-display text-sm">S</span>
        </div>
        <div className="leading-tight">
          <div className="font-display text-sm font-semibold text-ink">Stratus</div>
          <div className="text-[11px] text-ink-muted">Scorecard</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-paper font-medium text-ink"
                  : "text-ink-muted hover:bg-paper hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 px-2">
          <div className="truncate text-sm font-medium text-ink">
            {user?.displayName || "—"}
          </div>
          <div className="truncate text-[11px] capitalize text-ink-muted">
            {role}
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut();
            document.cookie = "__session=; Max-Age=0; path=/";
            router.push("/login");
          }}
          className="btn-ghost w-full"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
