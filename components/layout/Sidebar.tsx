"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CheckSquare,
  Activity,
  Settings,
  ChevronRight,
  HardHat,
  BarChart2,
  LogOut,
  Archive,
  FileText,
  List,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { COMPANY } from "@/lib/config";

const navItems = [
  { href: "/dashboard",      label: "Dashboard",      icon: LayoutDashboard },
  { href: "/leads",          label: "Leads Pipeline", icon: Users,    exact: true },
  { href: "/contacts",       label: "Contacts",       icon: List },
  { href: "/leads/archived", label: "Archived",       icon: Archive },
  { href: "/production",     label: "Production",     icon: HardHat },
  { href: "/estimates",      label: "Estimates",      icon: FileText },
  { href: "/kpi",            label: "KPI",            icon: BarChart2 },
  { href: "/calendar",       label: "Calendar",       icon: CalendarDays },
  { href: "/tasks",          label: "Tasks",          icon: CheckSquare },
  { href: "/activities",     label: "Activities",     icon: Activity },
];

const bottomItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <aside className="flex h-full w-60 flex-col bg-sidebar border-r border-sidebar-border">

      {/* ── Logo ── */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0">
          <Command className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm text-white tracking-tight leading-tight truncate">
            {COMPANY.name}
          </p>
          <p className="text-[10px] text-sidebar-foreground/50 leading-tight truncate">
            {COMPANY.appName}
          </p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex flex-1 flex-col gap-1 p-3 pt-4 overflow-y-auto">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          Main
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                )}
              />
              <span>{item.label}</span>
              {isActive && (
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-sidebar-foreground/40" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom ── */}
      <div className="border-t border-sidebar-border p-3">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-sidebar-foreground/60 group-hover:text-sidebar-foreground" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={handleSignOut}
          className="group mt-1 w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-sidebar-foreground hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4 shrink-0 text-sidebar-foreground/60 group-hover:text-red-400 transition-colors" />
          <span>Sign Out</span>
        </button>

        {/* ── User chip — reads from Supabase session ── */}
        <UserChip />
      </div>
    </aside>
  );
}

// ── Reads actual logged-in user from Supabase instead of hardcoded "Jamie Davis" ──
function UserChip() {
  const [user, setUser] = useState<{ name: string; initials: string; role: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const meta  = data.user.user_metadata ?? {};
      const email = data.user.email ?? "";
      const name  = meta.full_name || meta.name || email.split("@")[0] || "User";
      const parts = name.trim().split(" ");
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
      const role = meta.role || "Admin";
      setUser({ name, initials, role });
    });
  }, []);

  if (!user) return null;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
        {user.initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{user.name}</p>
        <p className="text-xs text-sidebar-foreground/50 truncate">{user.role}</p>
      </div>
    </div>
  );
}

// ── Needed for UserChip ──
import { useState, useEffect } from "react";