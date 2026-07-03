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
  { label: "Overview", href: "/dashboard", roles: ["admin", "manager", "supervisor", "employee"] },
  { label: "Departments", href: "/departments", roles: ["admin", "manager", "supervisor"] },
  { label: "My Team", href: "/my-team", roles: ["admin", "manager", "supervisor"] },
  { label: "My Scorecard", href: "/scorecard", roles: ["admin", "manager", "supervisor", "employee"] },
  { label: "My Evaluations", href: "/my-evaluations", roles: ["admin", "manager", "supervisor", "employee"] },
  { label: "Team View", href: "/team", roles: ["admin", "manager", "supervisor"] },
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
    <aside className="flex h-screen w-60 flex-col border-r border-hairline bg-panel">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
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
              className={`relative block rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                active
                  ? "bg-panel-2 font-medium text-ink"
                  : "text-ink-muted hover:bg-panel-2 hover:text-ink"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-3">
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
