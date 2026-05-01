"use client";

import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddLeadModal from "@/components/leads/AddLeadModal";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/dashboard": { title: "Dashboard", description: "Welcome back, Jamie 👋" },
  "/leads": { title: "Leads Pipeline", description: "Manage and track your sales pipeline" },
  "/calendar": { title: "Calendar", description: "View your upcoming appointments" },
  "/tasks": { title: "Tasks", description: "Stay on top of your to-dos" },
  "/activities": { title: "Activities", description: "Review all lead interactions" },
  "/settings": { title: "Settings", description: "Configure your workspace" },
};

export default function Header() {
  const pathname = usePathname();
  const pageInfo = pageTitles[pathname] ?? { title: "FlowCRM", description: "" };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6 shrink-0">
      <div>
        <h1 className="font-display text-lg font-semibold leading-tight">{pageInfo.title}</h1>
        <p className="text-xs text-muted-foreground">{pageInfo.description}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Search leads..."
            className="h-8 w-56 rounded-lg border bg-secondary/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </Button>

        {/* Add Lead Button (FIXED) */}
        <AddLeadModal />
      </div>
    </header>
  );
}