"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  X,
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

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  };

  return { collapsed, toggle };
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { collapsed, toggle } = useCollapsed();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>(COMPANY.name);

  useEffect(() => {
    const loadBranding = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('logo_url, company_name')
        .eq('id', user.id)
        .single();
      if (data?.logo_url) setLogoUrl(data.logo_url);
      if (data?.company_name) setCompanyName(data.company_name);
    };
    loadBranding();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const handleNavClick = () => {
    if (onMobileClose) onMobileClose();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          "flex h-full flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 z-50",
          collapsed ? "w-16" : "w-60",
          "max-lg:fixed max-lg:top-0 max-lg:left-0 max-lg:h-screen max-lg:w-72",
          mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        )}
      >
        {/* Logo + collapse toggle */}
        <div className="flex h-16 items-center justify-between px-3 border-b border-sidebar-border shrink-0">
          <div className={cn("flex items-center gap-2.5 min-w-0", collapsed && "lg:justify-center lg:w-full")}>
            {/* Logo: show uploaded logo or fallback to Command icon */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Command className="h-4 w-4 text-white" />
              )}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="font-bold text-sm text-white tracking-tight leading-tight truncate">
                  {companyName}
                </p>
                <p className="text-[10px] text-sidebar-foreground/50 leading-tight truncate">
                  {COMPANY.appName}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={toggle}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </button>

          <button
            onClick={onMobileClose}
            className="lg:hidden flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 p-3 pt-4 overflow-y-auto">
          {!collapsed && (
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Main
            </p>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  collapsed && "lg:justify-center lg:px-0",
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
                {!collapsed && (
                  <>
                    <span>{item.label}</span>
                    {isActive && (
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-sidebar-foreground/40" />
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border p-3 shrink-0">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  collapsed && "lg:justify-center lg:px-0",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-sidebar-foreground/60 group-hover:text-sidebar-foreground" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign Out" : undefined}
            className={cn(
              "group mt-1 w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-sidebar-foreground hover:bg-red-500/10 hover:text-red-400",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0 text-sidebar-foreground/60 group-hover:text-red-400 transition-colors" />
            {!collapsed && <span>Sign Out</span>}
          </button>

          {!collapsed && <UserChip />}
        </div>
      </aside>
    </>
  );
}

function UserChip() {
  const [user, setUser] = useState<{ name: string; initials: string; role: string; logoUrl: string | null } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, logo_url')
        .eq('id', authData.user.id)
        .single();

      const email = authData.user.email ?? '';
      const name = profile?.full_name || email.split('@')[0] || 'User';
      const parts = name.trim().split(' ');
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
      const role = profile?.role || 'Admin';
      const logoUrl = profile?.logo_url || null;

      setUser({ name, initials, role, logoUrl });
    };
    load();
  }, []);

  if (!user) return null;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 overflow-hidden">
        {user.logoUrl ? (
          <img src={user.logoUrl} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <span className="text-xs font-bold text-primary">{user.initials}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{user.name}</p>
        <p className="text-xs text-sidebar-foreground/50 truncate">{user.role}</p>
      </div>
    </div>
  );
}