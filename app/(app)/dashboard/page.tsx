"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Users, CalendarCheck, TrendingUp, DollarSign, FileSignature, X } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PipelineSummary from "@/components/dashboard/PipelineSummary";
import RecentLeads from "@/components/dashboard/RecentLeads";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalLeads: 0,
    appointments: 0,
    closeRate: 0,
    actualRevenue: 0,
    contractedRevenue: 0,
    initialVolume: 0,
    changeOrderVolume: 0,
    loaded: false,
  });

  const [showContractedBreakdown, setShowContractedBreakdown] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // Fetch all leads (not archived)
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("*")
        .neq("archived", true);

      if (leadsError || !leads) {
        console.error("Dashboard leads error:", leadsError?.message);
        return;
      }

      // Fetch payments for this month
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("amount, paid_at")
        .gte("paid_at", monthStart)
        .lte("paid_at", monthEnd);

      if (paymentsError) {
        console.error("Dashboard payments error:", paymentsError?.message);
      }

      const total = leads.length;

      const appts = leads.filter((l: any) =>
        l.appointment_set === true || l.status === "appointment_set"
      ).length;

      const won = leads.filter((l: any) =>
        l.status === "closed_won" || l.status === "won"
      );

      const rate = total > 0 ? Math.round((won.length / total) * 100) : 0;

      // Actual Revenue = sum of payments received this month
      const actualRevenue = (payments || []).reduce(
        (sum: number, p: any) => sum + Number(p.amount || 0),
        0
      );

      // Contracted Revenue = closed_amount on Closed Won leads created this month
      const wonThisMonth = won.filter((l: any) => {
        const created = l.lead_received_at || l.created_at;
        return created >= monthStart && created <= monthEnd;
      });

      const initialVolume = wonThisMonth.reduce(
        (sum: number, l: any) => sum + Number(l.closed_amount || l.initial_contract_value || 0),
        0
      );

      // Change order volume — $0 until change_orders table is built
      const changeOrderVolume = 0;
      const contractedRevenue = initialVolume + changeOrderVolume;

      setStats({
        totalLeads: total,
        appointments: appts,
        closeRate: rate,
        actualRevenue,
        contractedRevenue,
        initialVolume,
        changeOrderVolume,
        loaded: true,
      });
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Leads"
          value={stats.loaded ? String(stats.totalLeads) : "..."}
          change="+12%"
          trend="up"
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          delay={0}
        />
        <KpiCard
          title="Appointments Set"
          value={stats.loaded ? String(stats.appointments) : "..."}
          change="+4%"
          trend="up"
          icon={CalendarCheck}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
          delay={75}
        />
        <KpiCard
          title="Close Rate"
          value={stats.loaded ? `${stats.closeRate}%` : "..."}
          change="-2%"
          trend="down"
          icon={TrendingUp}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          delay={150}
        />
        <KpiCard
          title="Actual Revenue"
          value={stats.loaded ? `$${stats.actualRevenue.toLocaleString()}` : "..."}
          change="+18%"
          trend="up"
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          delay={225}
        />
      </div>

      {/* Contracted Revenue Card */}
      <div className="relative">
        <button
          onClick={() => setShowContractedBreakdown(!showContractedBreakdown)}
          className="w-full text-left rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <FileSignature className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Contracted Revenue <span className="normal-case">(this month)</span>
                </p>
                <p className="text-2xl font-bold mt-0.5">
                  {stats.loaded ? `$${stats.contractedRevenue.toLocaleString()}` : "..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Signed agreements · click to expand</span>
              <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">
                {showContractedBreakdown ? "▲" : "▼"}
              </span>
            </div>
          </div>
        </button>

        {/* Breakdown Panel */}
        {showContractedBreakdown && (
          <div className="mt-2 rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold">Contracted Revenue Breakdown</p>
              <button
                onClick={() => setShowContractedBreakdown(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Initial Contract Volume</p>
                <p className="text-xl font-bold text-foreground">
                  ${stats.initialVolume.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Original signed agreements this month
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Change Order Volume</p>
                <p className="text-xl font-bold text-foreground">
                  ${stats.changeOrderVolume.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Additional signed work this month
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">Total Contracted</p>
              <p className="text-lg font-bold text-primary">
                ${stats.contractedRevenue.toLocaleString()}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              * Contracted revenue is money owed — actual revenue updates as payments are received.
            </p>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <div>
          <PipelineSummary />
        </div>
      </div>

      <RecentLeads />
    </div>
  );
}