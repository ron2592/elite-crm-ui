"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Users, CalendarCheck, TrendingUp, DollarSign, FileSignature, X, ChevronLeft, ChevronRight } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PipelineSummary from "@/components/dashboard/PipelineSummary";
import RecentLeads from "@/components/dashboard/RecentLeads";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export default function DashboardPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());

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
      // ✅ Server-side filter by created_at — same field KPI page and pipeline use
      // created_at = lead received date (saved via Add Lead form)
      // Do NOT use lead_received_at — that field was set at import time, not actual received date
      const monthStart = new Date(selectedYear, selectedMonth, 1).toISOString();
      const monthEnd   = new Date(selectedYear, selectedMonth + 1, 1).toISOString();

      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .neq("archived", true)
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      if (!leads) return;

      const leadIds = leads.map((l: any) => l.id);
      const won     = leads.filter((l: any) => l.status === "closed_won" || l.status === "won");
      const wonIds  = won.map((l: any) => l.id);

      const [paymentsRes, allPaymentsRes, changeOrdersRes] = await Promise.all([
        leadIds.length > 0
          ? supabase.from("payments").select("amount").in("lead_id", leadIds)
          : Promise.resolve({ data: [] }),
        supabase.from("payments").select("amount"),
        wonIds.length > 0
          ? supabase.from("change_orders").select("amount").eq("status", "won").in("lead_id", wonIds)
          : Promise.resolve({ data: [] }),
      ]);

      const total  = leads.length;
      const appts  = leads.filter((l: any) => l.appointment_set === true || l.status === "appointment_set").length;
      const rate   = total > 0 ? Math.round((won.length / total) * 100) : 0;

      const actualRevenue = (paymentsRes.data || []).reduce(
        (s: number, p: any) => s + Number(p.amount || 0), 0);
      const actualRevenueAllTime = (allPaymentsRes.data || []).reduce(
        (s: number, p: any) => s + Number(p.amount || 0), 0);
      const initialVolume = won.reduce(
        (s: number, l: any) => s + Number(l.initial_contract_value || l.closed_amount || 0), 0);
      const changeOrderVolume = (changeOrdersRes.data || []).reduce(
        (s: number, co: any) => s + Number(co.amount || 0), 0);

      setStats({
        totalLeads: total, appointments: appts, closeRate: rate,
        actualRevenue, actualRevenueAllTime,
        contractedRevenue: initialVolume + changeOrderVolume,
        initialVolume, changeOrderVolume, loaded: true,
      });
    }
    fetchStats();
  }, [selectedMonth, selectedYear]);

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

      <RecentLeads />
    </div>
  );
}