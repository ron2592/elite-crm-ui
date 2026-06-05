import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  User,
  Bell,
  Shield,
  CreditCard,
  Plug,
  Palette,
  ChevronRight,
  Users,
} from "lucide-react";

const settingsGroups = [
  {
    title: "Account",
    items: [
      { icon: User, label: "Profile", description: "Update your name, email, and photo", href: "/settings/profile" },
      { icon: Shield, label: "Security", description: "Password and two-factor authentication", href: null },
    ],
  },
  {
    title: "Workspace",
    items: [
      { icon: Users, label: "Team Members", description: "Invite and manage users (max 3)", href: "/settings/users" },
      { icon: Bell, label: "Notifications", description: "Configure how you receive alerts", href: null },
      { icon: Palette, label: "Appearance", description: "Theme, density, and display preferences", href: null },
      { icon: Plug, label: "Integrations", description: "Connect to Twilio, Gmail, and more", href: null },
    ],
  },
  {
    title: "Billing",
    items: [
      { icon: CreditCard, label: "Plan & Billing", description: "Manage your subscription", href: null },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile Preview */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
              EW
            </div>
            <div>
              <p className="font-semibold text-lg">Elite Work</p>
              <p className="text-sm text-muted-foreground">elitework.ron@gmail.com · Admin</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto">
              Edit Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Sections */}
      {settingsGroups.map((group) => (
        <div key={group.title}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
            {group.title}
          </p>
          <Card>
            <CardContent className="p-0 divide-y">
              {group.items.map((item) => {
                const Icon = item.icon;
                const inner = (
                  <div className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors text-left first:rounded-t-xl last:rounded-b-xl">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                );

                return item.href ? (
                  <Link key={item.label} href={item.href} className="block">
                    {inner}
                  </Link>
                ) : (
                  <button key={item.label} className="w-full first:rounded-t-xl last:rounded-b-xl">
                    {inner}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ))}

      {/* Danger Zone */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Danger Zone
        </p>
        <Card className="border-destructive/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Delete Account</p>
                <p className="text-xs text-muted-foreground">This action cannot be undone</p>
              </div>
              <Button variant="destructive" size="sm">Delete</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}