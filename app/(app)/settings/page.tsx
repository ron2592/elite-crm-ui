"use client";

import { useEffect, useState } from "react";
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
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const settingsGroups = [
  {
    title: "Account",
    items: [
      { icon: User, label: "Profile", description: "Update your name, company, and logo", href: "/settings/profile" },
      { icon: Shield, label: "Security", description: "Password and two-factor authentication", href: null },
    ],
  },
  {
    title: "Workspace",
    items: [
      { icon: Users, label: "Team Members", description: "Invite and manage users (max 3)", href: "/settings/users" },
      { icon: Bell, label: "Notifications", description: "Configure how you receive alerts", href: null },
      { icon: Palette, label: "Appearance", description: "Theme, density, and display preferences", href: null },
    ],
  },
  {
    title: "Billing",
    items: [
      { icon: CreditCard, label: "Plan & Billing", description: "Manage your subscription", href: null },
    ],
  },
];

interface ProfileData {
  full_name: string;
  email: string;
  role: string;
  company_name: string | null;
  logo_url: string | null;
}

interface GoogleStatus {
  connected: boolean;
  google_email?: string;
  last_synced?: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, role, company_name, logo_url')
        .eq('id', user.id)
        .single();
      if (data) setProfile(data);

      // Check Google Calendar connection status
      // The connection is a single shared company calendar (not per-user), so the status
      // check doesn't need to know who's logged in.
      try {
        const res = await fetch('/api/calendar/sync');
        const status = await res.json();
        setGoogleStatus(status);
      } catch {
        setGoogleStatus({ connected: false });
      }
      setGoogleLoading(false);
    };

    // Check for OAuth result in URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setGoogleStatus({ connected: true });
      window.history.replaceState({}, '', '/settings');
    } else if (params.get('google_error')) {
      setGoogleStatus({ connected: false });
      window.history.replaceState({}, '', '/settings');
    }

    load();
  }, []);

  const handleGoogleConnect = () => {
    window.location.href = '/api/auth/google';
  };

  // Appointments now auto-push to Google the moment they're set on a lead (see
  // LeadDetailDialog's handleSaveAppointment) -- this button is just a one-time catch-up for
  // appointments that were already on the books before that existed, or a manual safety net.
  const handleManualSync = async () => {
    if (!googleStatus?.connected) return;
    setSyncing(true);
    try {
      await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: true }),
      });
      setGoogleStatus(prev => prev ? { ...prev, last_synced: new Date().toISOString() } : prev);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const displayName = profile?.company_name || profile?.full_name || 'Elite Work';
  const email = profile?.email || '';
  const role = profile?.role || 'Admin';
  const initials = displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile Preview */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {profile?.logo_url ? (
                <img src={profile.logo_url} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-lg font-bold text-primary">{initials}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-lg">{displayName}</p>
              <p className="text-sm text-muted-foreground">{email} · {role}</p>
            </div>
            <Link href="/settings/profile" className="ml-auto">
              <Button variant="outline" size="sm">Edit Profile</Button>
            </Link>
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

      {/* Integrations */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          Integrations
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Google Calendar</p>
                <p className="text-xs text-muted-foreground mt-0.5">Appointments set on a lead push here automatically -- one-way, so nothing needs to be entered twice.</p>
                {googleLoading ? (
                  <p className="text-xs text-muted-foreground">Checking connection...</p>
                ) : googleStatus?.connected ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <p className="text-xs text-green-600">
                      Connected
                      {googleStatus.google_email ? ` · ${googleStatus.google_email}` : ''}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-0.5">
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {googleStatus?.connected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualSync}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      'Push Upcoming Appts'
                    )}
                  </Button>
                )}
                <Button
                  variant={googleStatus?.connected ? "outline" : "default"}
                  size="sm"
                  onClick={handleGoogleConnect}
                  disabled={googleLoading}
                >
                  {googleStatus?.connected ? 'Reconnect' : 'Connect'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
