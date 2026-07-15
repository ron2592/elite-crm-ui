"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Users, CalendarCheck, TrendingUp, DollarSign, FileSignature, X, ChevronLeft, ChevronRight, Target, Wallet, Hammer, AlertTriangle } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PipelineSummary from "@/components/dashboard/PipelineSummary";
import RecentLeads from "@/components/dashboard/RecentLeads";

const OPEN_STAGES = ["new", "contacted", "appointment_set", "estimate_sent"];
const WON_STAGES  = ["closed_won", "won", "completed", "completed_with_balance"];
const CANCELLED_PROD_STAGES = ["Cancelled Before Start", "Cancelled Mid-Job"];
const COMPLETED_PROD_STAGES = ["Completed", "Completed with Balance"];
const isPendingProdStage = (s: string | null) => !!s && s.startsWith("Pending");
const isActiveProdStage  = (s: string | null) => !!s && !isPendingProdStage(s) && !COMPLETED_PROD_STAGES.includes(s) && !CANCELLED_PROD_STAGES.includes(s);

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export default function DashboardPage() {
  const now = new Date();
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());

  // Company Health snapshot — same "right now" signals as the full Company Health tab
  // (/kpi/health), condensed to a glance here. Not tied to the month selector below since a
  // backlog or an aging pipeline is a current-state thing, not a "this month" thing.
  const [health, setHealth] = useState({
    pipelineValue: 0, openCount: 0, balanceDue: 0, backlogCount: 0, stuckCount: 0, loaded: false,
  });

  const [stats, setStats] = useState({
    totalLeads: 0, appointments: 0, closeRate: 0,
    actualRevenue: 0, actualRevenueAllTime: 0,
    contractedRevenue: 0, initialVolume: 0, changeOrderVolume: 0,
    loaded: false,
  });

  const [showContractedBreakdown, setShowContractedBreakdown] = useState(false);
  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

  function goToPrevMonth() {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  }
  function goToNextMonth() {
    const nm = selectedMonth === 11 ? 0 : selectedMonth + 1;
    const ny = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth())) return;
    setSelectedMonth(nm); setSelectedYear(ny);
  }

  useEffect(() => {
    async function fetchStats() {
      // Lead-volume metrics (total leads, appointments, close rate) stay anchored to created_at —
      // that's correct for CAC / lead-volume reporting, a lead only "arrives" once.
      const monthStart = new Date(selectedYear, selectedMonth, 1).toISOString();
      const monthEnd   = new Date(selectedYear, selectedMonth + 1, 1).toISOString();
      const monthStartMs = new Date(monthStart).getTime();
      const monthEndMs   = new Date(monthEnd).getTime();
      const inMonth = (iso: string | null | undefined) => {
        if (!iso) return false;
        const t = new Date(iso).getTime();
        return t >= monthStartMs && t < monthEndMs;
      };

      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .neq("archived", true)
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      if (!leads) return;

      const total  = leads.length;
      const appts  = leads.filter((l: any) => l.appointment_set === true || l.status === "appointment_set").length;
      const won    = leads.filter((l: any) => l.status === "closed_won" || l.status === "won");
      const rate   = total > 0 ? Math.round((won.length / total) * 100) : 0;

      // Revenue metrics: bucket by when the money was actually won/collected, NOT by when the
      // original lead came in. Without this, a change order signed this month on an old repeat
      // client lead (e.g. JCC Bayone, lead from 2024) never counts toward this month's revenue —
      // it silently falls into whatever month the original lead happened to arrive.
      const [allWonLeadsRes, allChangeOrdersRes, allPaymentsRes, allCOPaymentsRes] = await Promise.all([
        supabase.from("leads").select("initial_contract_value, closed_at, lead_received_at, status").in("status", ["closed_won", "won", "completed", "completed_with_balance"]),
        supabase.from("change_orders").select("amount, signed_at, date_added").eq("status", "won").is("deleted_at", null),
        supabase.from("payments").select("amount, paid_at"),
        supabase.from("change_order_payments").select("amount, paid_at"),
      ]);

      const initialVolume = (allWonLeadsRes.data || [])
        .filter((l: any) => inMonth(l.closed_at || l.lead_received_at))
        .reduce((s: number, l: any) => s + Number(l.initial_contract_value || 0), 0);

      const changeOrderVolume = (allChangeOrdersRes.data || [])
        .filter((co: any) => inMonth(co.signed_at || co.date_added))
        .reduce((s: number, co: any) => s + Number(co.amount || 0), 0);

      // Actual revenue (cash collected) now includes change_order_payments — previously this
      // table was never queried here, so every dollar collected against a change order was
      // silently excluded from both "this month" and "all-time" actual revenue.
      const actualRevenue =
        (allPaymentsRes.data || []).filter((p: any) => inMonth(p.paid_at)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0) +
        (allCOPaymentsRes.data || []).filter((p: any) => inMonth(p.paid_at)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const actualRevenueAllTime =
        (allPaymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0) +
        (allCOPaymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

      setStats({
        totalLeads: total, appointments: appts, closeRate: rate,
        actualRevenue, actualRevenueAllTime,
        contractedRevenue: initialVolume + changeOrderVolume,
        initialVolume, changeOrderVolume, loaded: true,
      });
    }
    fetchStats();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    async function fetchHealth() {
      const [openRes, wonRes, coRes, payRes, coPayRes] = await Promise.all([
        supabase.from("leads").select("estimated_amount,created_at").in("status", OPEN_STAGES).eq("archived", false),
        supabase.from("leads").select("initial_contract_value,production_stage").in("status", WON_STAGES).eq("archived", false),
        supabase.from("change_orders").select("amount").eq("status", "won").is("deleted_at", null),
        supabase.from("payments").select("amount"),
        supabase.from("change_order_payments").select("amount"),
      ]);
      const openLeads = (openRes.data as any[]) || [];
      const wonLeads   = (wonRes.data as any[]) || [];
      const pipelineValue = openLeads.reduce((s, l) => s + Number(l.estimated_amount || 0), 0);
      const stuckCount = openLeads.filter(l => {
        const days = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000);
        return days >= 14;
      }).length;
      const backlogCount = wonLeads.filter(l => !l.production_stage || isPendingProdStage(l.production_stage) || isActiveProdStage(l.production_stage)).length;
      const totalContracted = wonLeads.reduce((s, l) => s + Number(l.initial_contract_value || 0), 0)
        + (coRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const collected = (payRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
        + (coPayRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      setHealth({
        pipelineValue, openCount: openLeads.length,
        balanceDue: Math.max(0, totalContracted - collected),
        backlogCount, stuckCount, loaded: true,
      });
    }
    fetchHealth();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={goToPrevMonth} className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center min-w-[160px]">
            <p className="font-semibold text-sm">{MONTH_NAMES[selectedMonth]} {selectedYear}</p>
            {isCurrentMonth && <p className="text-xs text-muted-foreground">Current month</p>}
          </div>
          <button onClick={goToNextMonth} disabled={selectedMonth === now.getMonth() && selectedYear === now.getFullYear()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentMonth && (
            <button onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); }}
              className="text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
              Back to current
            </button>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">All-time actual revenue</p>
          <p className="text-sm font-bold text-emerald-600">
            {stats.loaded ? `$${stats.actualRevenueAllTime.toLocaleString()}` : "..."}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Total Leads" value={stats.loaded ? String(stats.totalLeads) : "..."} change="+12%" trend="up" icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50" delay={0} />
        <KpiCard title="Appointments Set" value={stats.loaded ? String(stats.appointments) : "..."} change="+4%" trend="up" icon={CalendarCheck} iconColor="text-violet-600" iconBg="bg-violet-50" delay={75} />
        <KpiCard title="Close Rate" value={stats.loaded ? `${stats.closeRate}%` : "..."} change="-2%" trend="down" icon={TrendingUp} iconColor="text-amber-600" iconBg="bg-amber-50" delay={150} />
        <KpiCard title={`Actual Revenue · ${MONTH_NAMES[selectedMonth].slice(0, 3)}`} value={stats.loaded ? `$${stats.actualRevenue.toLocaleString()}` : "..."} change="+18%" trend="up" icon={DollarSign} iconColor="text-emerald-600" iconBg="bg-emerald-50" delay={225} />
      </div>

      {/* Contracted Revenue */}
      <div className="relative">
        <button onClick={() => setShowContractedBreakdown(!showContractedBreakdown)}
          className="w-full text-left rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <FileSignature className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Contracted Revenue <span className="normal-case">· {MONTH_NAMES[selectedMonth]} {selectedYear}</span>
                </p>
                <p className="text-2xl font-bold mt-0.5">
                  {stats.loaded ? `$${stats.contractedRevenue.toLocaleString()}` : "..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Signed agreements · click to expand</span>
              <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">{showContractedBreakdown ? "▲" : "▼"}</span>
            </div>
          </div>
        </button>
        {showContractedBreakdown && (
          <div className="mt-2 rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold">Contracted Revenue — {MONTH_NAMES[selectedMonth]} {selectedYear}</p>
              <button onClick={() => setShowContractedBreakdown(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Initial Contract Volume</p>
                <p className="text-xl font-bold">${stats.initialVolume.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Original signed agreements</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Change Order Volume</p>
                <p className="text-xl font-bold">${stats.changeOrderVolume.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Additional signed work</p>
              </div>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">Total Contracted</p>
              <p className="text-lg font-bold text-primary">${stats.contractedRevenue.toLocaleString()}</p>
            </div>
            <p className="text-xs text-muted-foreground">* Contracted revenue is money owed — actual revenue updates as payments are received.</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><RevenueChart /></div>
        <div><PipelineSummary /></div>
      </div>

      {/* Company Health summary — condensed version of /kpi/health, separate from marketing/sales
          KPIs above. Answers "is the business running well" rather than "is marketing working." */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button onClick={() => router.push("/kpi/health")}
          className="w-full flex items-center justify-between px-5 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
          <span className="text-sm font-bold">Company Health</span>
          <span className="text-xs text-primary font-medium">View full report →</span>
        </button>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Pipeline in Play</p>
            <p className="text-xl font-bold">{health.loaded ? `$${health.pipelineValue.toLocaleString()}` : "..."}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{health.loaded ? `${health.openCount} active leads` : ""}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Balance Due</p>
            <p className="text-xl font-bold text-amber-600">{health.loaded ? `$${health.balanceDue.toLocaleString()}` : "..."}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Signed, not yet collected</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1"><Hammer className="h-3.5 w-3.5" /> Production Backlog</p>
            <p className="text-xl font-bold">{health.loaded ? health.backlogCount : "..."}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Won, not yet completed</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Stuck 14+ Days</p>
            <p className={`text-xl font-bold ${health.loaded && health.stuckCount > 0 ? "text-red-500" : ""}`}>{health.loaded ? health.stuckCount : "..."}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Leads sitting untouched</p>
          </div>
        </div>
      </div>

      <RecentLeads />
    </div>
  );
}
