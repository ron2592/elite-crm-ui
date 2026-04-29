import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  User,
  Bell,
  Shield,
  CreditCard,
  Plug,
  Palette,
  ChevronRight,
} from "lucide-react";

const settingsGroups = [
  {
    title: "Account",
    items: [
      { icon: User, label: "Profile", description: "Update your name, email, and photo" },
      { icon: Shield, label: "Security", description: "Password and two-factor authentication" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { icon: Bell, label: "Notifications", description: "Configure how you receive alerts" },
      { icon: Palette, label: "Appearance", description: "Theme, density, and display preferences" },
      { icon: Plug, label: "Integrations", description: "Connect to Twilio, Gmail, and more" },
    ],
  },
  {
    title: "Billing",
    items: [
      { icon: CreditCard, label: "Plan & Billing", description: "Manage your subscription" },
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
              JD
            </div>
            <div>
              <p className="font-display font-semibold text-lg">Jamie Davis</p>
              <p className="text-sm text-muted-foreground">jamie.davis@flowcrm.io · Admin</p>
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
                return (
                  <button
                    key={item.label}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors text-left first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
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
