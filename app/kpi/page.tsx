"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Users, Home, Phone,
  DollarSign, Target, TrendingUp, Plus, Save, X, Loader2,
  LayoutDashboard, Printer,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeadRow {
  id: string;
  status: string;
  contact_type: string | null;
  lsa_status: string | null;
  initial_contract_value: number;
  estimated_amount: number;
  closed_amount: number;
  created_at: string;
  source_id: string | null;
  metadata: { salesperson?: string } | null;
  lead_sources: { name: string } | null;
}
interface PaymentRow { amount: number; paid_at: string; lead_id: string; }
interface SpendRow {
  id: string;
  period_start: string;
  source_name: string | null;
  source_id: string | null;
  amount_spent: number;
  lead_sources: { name: string } | null;
}
interface LeadSource { id: string; name: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SALESPERSONS = ["Ron", "Ray", "Other (Phone)"];

function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1).toISOString();
  const end   = new Date(year, month + 1, 1).toISOString();
  return { start, end };
}

function fmt$(n: number) {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return "$" + Math.round(n).toLocaleString();
}

function pct(num: number, den: number) {
  if (!den) return "—";
  return Math.round((num / den) * 100) + "%";
}

const WON_STAGES = ["closed_won", "won"];
const ESTIMATED_STAGES = ["estimate_sent", "closed_won", "won", "lost"];

// ─── Source colors for comparison table ───────────────────────────────────────
const SRC_COLORS = [
  "bg-blue-500", "bg-orange-500", "bg-emerald-500", "bg-purple-500",
  "bg-pink-500", "bg-cyan-500", "bg-yellow-500", "bg-red-500",
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KPIPage() {
  const today = new Date();
  const router = useRouter();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view,  setView]  = useState<"monthly" | "weekly">("monthly");
  const [filterSP,  setFilterSP]  = useState("");
  const [filterSrc, setFilterSrc] = useState("");

  const [leads,    setLeads]    = useState<LeadRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [trend,    setTrend]    = useState<{ label: string; contracted: number; actual: number; leads: number }[]>([]);
  const [spend,    setSpend]    = useState<SpendRow[]>([]);
  const [sources,  setSources]  = useState<LeadSource[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Marketing spend form
  const [showSpendForm, setShowSpendForm]   = useState(false);
  const [spendForm, setSpendForm]           = useState({ source_id: "", source_name: "", amount: "" });
  const [savingSpend, setSavingSpend]       = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [year, month]);

  async function fetchAll() {
    setLoading(true);
    const { start, end } = monthRange(year, month);

    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, status, contact_type, lsa_status, initial_contract_value, estimated_amount, closed_amount, created_at, source_id, metadata, lead_sources(name)")
      .gte("created_at", start)
      .lt("created_at", end)
      .eq("archived", false);

    const { data: paymentsData } = await supabase
      .from("payments")
      .select("amount, paid_at, lead_id")
      .gte("paid_at", start)
      .lt("paid_at", end);

    const { data: spendData } = await supabase
      .from("marketing_spend")
      .select("id, period_start, source_name, source_id, amount_spent, lead_sources(name)")
      .gte("period_start", start)
      .lt("period_start", end);

    const { data: srcData } = await supabase
      .from("lead_sources")
      .select("id, name")
      .order("name");

    const trendStart = new Date(year, month - 5, 1).toISOString();
    const { data: trendLeads } = await supabase
      .from("leads")
      .select("status, initial_contract_value, created_at, lead_id:id")
      .gte("created_at", trendStart)
      .lt("created_at", end)
      .eq("archived", false);

    const { data: trendPayments } = await supabase
      .from("payments")
      .select("amount, paid_at")
      .gte("paid_at", trendStart)
      .lt("paid_at", end);

    const trendMap: Record<string, { contracted: number; actual: number; leads: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const key = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
      trendMap[key] = { contracted: 0, actual: 0, leads: 0 };
    }
    (trendLeads || []).forEach((l: any) => {
      const d = new Date(l.created_at);
      const key = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
      if (trendMap[key]) {
        trendMap[key].leads++;
        if (WON_STAGES.includes(l.status)) trendMap[key].contracted += Number(l.initial_contract_value || 0);
      }
    });
    (trendPayments || []).forEach((p: any) => {
      const d = new Date(p.paid_at);
      const key = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
      if (trendMap[key]) trendMap[key].actual += Number(p.amount || 0);
    });

    setLeads((leadsData as any[]) || []);
    setPayments(paymentsData || []);
    setSpend((spendData as any[]) || []);
    setSources(srcData || []);
    setTrend(Object.entries(trendMap).map(([label, v]) => ({ label, ...v })));
    setLoading(false);
  }

  // ── Filtered leads ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return leads.filter(l => {
      const sp  = l.metadata?.salesperson || "";
      const src = l.source_id || "";
      if (filterSP  && sp  !== filterSP)  return false;
      if (filterSrc && src !== filterSrc) return false;
      return true;
    });
  }, [leads, filterSP, filterSrc]);

  // ── KPI calculations ───────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total      = filtered.length;
    const estimated  = filtered.filter(l => ESTIMATED_STAGES.includes(l.status)).length;
    const inPerson   = filtered.filter(l => l.contact_type === "in_person").length;
    const phoneQuote = filtered.filter(l => l.contact_type === "phone_quote").length;
    const won        = filtered.filter(l => WON_STAGES.includes(l.status));
    const wonCount   = won.length;
    const contracted = won.reduce((s, l) => s + Number(l.initial_contract_value || 0), 0);
    const actual     = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const wonInPerson  = filtered.filter(l => WON_STAGES.includes(l.status) && l.contact_type === "in_person").length;
    const wonPhone     = filtered.filter(l => WON_STAGES.includes(l.status) && l.contact_type === "phone_quote").length;
    const lsaCharged   = filtered.filter(l => l.lsa_status === "charged" || l.lsa_status === "submitted").length;
    const lsaCredited  = filtered.filter(l => l.lsa_status === "credited").length;

    // By source
    const bySrc: Record<string, { name: string; total: number; won: number; revenue: number; estimated: number }> = {};
    filtered.forEach(l => {
      const key  = l.source_id || "unknown";
      const name = (l.lead_sources as any)?.name || "Unknown";
      if (!bySrc[key]) bySrc[key] = { name, total: 0, won: 0, revenue: 0, estimated: 0 };
      bySrc[key].total++;
      if (ESTIMATED_STAGES.includes(l.status)) bySrc[key].estimated++;
      if (WON_STAGES.includes(l.status)) { bySrc[key].won++; bySrc[key].revenue += Number(l.initial_contract_value || 0); }
    });

    // By salesperson
    const bySP: Record<string, { name: string; total: number; inPerson: number; phone: number; won: number; revenue: number }> = {};
    SALESPERSONS.forEach(sp => { bySP[sp] = { name: sp, total: 0, inPerson: 0, phone: 0, won: 0, revenue: 0 }; });
    filtered.forEach(l => {
      const sp = l.metadata?.salesperson || "";
      if (!sp) return;
      if (!bySP[sp]) bySP[sp] = { name: sp, total: 0, inPerson: 0, phone: 0, won: 0, revenue: 0 };
      bySP[sp].total++;
      if (l.contact_type === "in_person")   bySP[sp].inPerson++;
      if (l.contact_type === "phone_quote") bySP[sp].phone++;
      if (WON_STAGES.includes(l.status))  { bySP[sp].won++; bySP[sp].revenue += Number(l.initial_contract_value || 0); }
    });

    const totalSpend = spend.reduce((s, r) => s + Number(r.amount_spent || 0), 0);
    const costPerLead = lsaCharged > 0 ? totalSpend / lsaCharged : 0;

    return {
      total, estimated, inPerson, phoneQuote, wonCount, contracted, actual,
      wonInPerson, wonPhone, lsaCharged, lsaCredited, bySrc, bySP,
      totalSpend, costPerLead,
    };
  }, [filtered, payments, spend]);

  // ── Week data ──────────────────────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    const weeks: { label: string; leads: number; won: number; revenue: number }[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let w = 0; w < 5; w++) {
      const wStart = new Date(year, month, 1 + w * 7);
      const wEnd   = new Date(year, month, Math.min(1 + (w + 1) * 7 - 1, daysInMonth) + 1);
      if (wStart.getDate() > daysInMonth) break;
      const wLeads = filtered.filter(l => { const d = new Date(l.created_at); return d >= wStart && d < wEnd; });
      const wWon   = wLeads.filter(l => WON_STAGES.includes(l.status));
      weeks.push({
        label: `Wk ${w + 1}`,
        leads: wLeads.length,
        won: wWon.length,
        revenue: wWon.reduce((s, l) => s + Number(l.initial_contract_value || 0), 0),
      });
    }
    return weeks;
  }, [filtered, year, month]);

  // ── Month navigation ───────────────────────────────────────────────────────
  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  // ── Add spend ──────────────────────────────────────────────────────────────
  async function handleAddSpend() {
    if (!spendForm.amount || Number(spendForm.amount) <= 0) return;
    setSavingSpend(true);
    const src = sources.find(s => s.id === spendForm.source_id);
    await supabase.from("marketing_spend").insert({
      period_start: new Date(year, month, 1).toISOString().split("T")[0],
      period_end:   new Date(year, month + 1, 0).toISOString().split("T")[0],
      source_id:    spendForm.source_id || null,
      source_name:  src?.name || spendForm.source_name || null,
      amount_spent: Number(spendForm.amount),
    });
    setSpendForm({ source_id: "", source_name: "", amount: "" });
    setShowSpendForm(false);
    setSavingSpend(false);
    fetchAll();
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const monthLabel = `${MONTHS[month]} ${year}`;
  const srcList = Object.values(kpi.bySrc).sort((a, b) => b.total - a.total);
  const spList  = Object.values(kpi.bySP).filter(sp => sp.total > 0);
  const maxSrc  = Math.max(...srcList.map(s => s.total), 1);
  const maxSrcRevenue = Math.max(...srcList.map(s => s.revenue), 1);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Back to Dashboard */}
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </button>
          <div>
            <h1 className="text-2xl font-bold">KPI Dashboard</h1>
            <p className="text-sm text-muted-foreground">Elite Work Home Improvement</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Print / PDF */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["monthly","weekly"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {v}
              </button>
            ))}
          </div>
          {/* Month nav */}
          <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
            <button onClick={prevMonth} className="p-1 hover:bg-muted rounded transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-medium w-24 text-center">{monthLabel}</span>
            <button onClick={nextMonth} className="p-1 hover:bg-muted rounded transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterSP} onChange={e => setFilterSP(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
          <option value="">All Salespersons</option>
          {SALESPERSONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterSrc} onChange={e => setFilterSrc(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
          <option value="">All Sources</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(filterSP || filterSrc) && (
          <button onClick={() => { setFilterSP(""); setFilterSrc(""); }}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading KPI data...
        </div>
      ) : (
        <>
          {/* ── Scorecards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <ScoreCard icon={<Users className="h-4 w-4" />}  label="Total Leads"      value={kpi.total}            color="default" />
            <ScoreCard icon={<Target className="h-4 w-4" />} label="Estimates Given"  value={kpi.estimated}        color="blue" />
            <ScoreCard icon={<Home className="h-4 w-4" />}   label="In-Person Visits" value={kpi.inPerson}         color="purple" />
            <ScoreCard icon={<Phone className="h-4 w-4" />}  label="Phone Quotes"     value={kpi.phoneQuote}       color="orange" />
            <ScoreCard icon={<TrendingUp className="h-4 w-4" />} label="Closed Won"   value={kpi.wonCount}         color="green" />
            <ScoreCard icon={<DollarSign className="h-4 w-4" />} label="Contracted"   value={fmt$(kpi.contracted)} color="emerald" />
          </div>

          {/* ── Secondary scorecards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniCard label="Actual Revenue"    value={fmt$(kpi.actual)}     sub="payments received" />
            <MiniCard label="Close Rate"        value={pct(kpi.wonCount, kpi.total)}      sub="won / total leads" />
            <MiniCard label="Close Rate (Appt)" value={pct(kpi.wonCount, kpi.estimated)}  sub="won / estimates" />
            <MiniCard label="Rev / Lead"        value={kpi.wonCount ? fmt$(kpi.contracted / kpi.wonCount) : "—"} sub="avg contracted" />
          </div>

          {/* ── Close rate breakdown ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CloseRateCard label="Overall Close Rate"      won={kpi.wonCount}    total={kpi.total}       sub={`${kpi.wonCount} won of ${kpi.total} leads`}    color="bg-primary" />
            <CloseRateCard label="In-Person Close Rate"    won={kpi.wonInPerson} total={kpi.inPerson}    sub={`${kpi.wonInPerson} won of ${kpi.inPerson} visits`} color="bg-purple-500" />
            <CloseRateCard label="Phone Quote Close Rate"  won={kpi.wonPhone}    total={kpi.phoneQuote}  sub={`${kpi.wonPhone} won of ${kpi.phoneQuote} quotes`}  color="bg-orange-500" />
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold">
                  {view === "monthly" ? "Revenue — Last 6 Months" : `Weekly Breakdown — ${monthLabel}`}
                </p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#E07B3A]" /> Contracted</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#378ADD]" /> Actual</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                {view === "monthly" ? (
                  <BarChart data={trend} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => "$" + (v/1000).toFixed(0) + "k"} />
                    <Tooltip formatter={(v: number) => fmt$(v)} />
                    <Bar dataKey="contracted" fill="#E07B3A" radius={[3,3,0,0]} name="Contracted" />
                    <Bar dataKey="actual"     fill="#378ADD" radius={[3,3,0,0]} name="Actual" />
                  </BarChart>
                ) : (
                  <BarChart data={weeklyData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => "$" + (v/1000).toFixed(0) + "k"} />
                    <Tooltip formatter={(v: number) => fmt$(v)} />
                    <Bar dataKey="revenue" fill="#E07B3A" radius={[3,3,0,0]} name="Contracted" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold mb-4">Leads by Source</p>
              <div className="space-y-3">
                {srcList.length === 0 && <p className="text-xs text-muted-foreground">No leads this month</p>}
                {srcList.map((src, i) => (
                  <div key={src.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground truncate max-w-[140px]">{src.name}</span>
                      <span className="font-medium">{src.total} · {pct(src.won, src.total)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${SRC_COLORS[i % SRC_COLORS.length]}`} style={{ width: `${(src.total / maxSrc) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {view === "monthly" && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-semibold mb-3">Lead count trend</p>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={trend}>
                      <Line type="monotone" dataKey="leads" stroke="#378ADD" strokeWidth={2} dot={{ r: 3 }} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => [v, "Leads"]} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ── Lead Source Comparison Table ── */}
          {srcList.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold">Lead Source Comparison — {monthLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Which sources are performing vs draining budget</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Source","Leads","Estimates","Close Rate","Contracted Rev","Rev / Lead","Performance"].map(h => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {srcList.map((src, i) => {
                      const closeRate = src.total > 0 ? Math.round((src.won / src.total) * 100) : 0;
                      const revPerLead = src.won > 0 ? src.revenue / src.won : 0;
                      // Performance score: close rate + revenue weight
                      const perfScore = closeRate;
                      const perfColor = closeRate >= 40 ? "text-emerald-600" : closeRate >= 20 ? "text-yellow-600" : "text-red-500";
                      const perfLabel = closeRate >= 40 ? "🟢 Strong" : closeRate >= 20 ? "🟡 Average" : src.total === 0 ? "⚪ No data" : "🔴 Weak";

                      return (
                        <tr key={src.name} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SRC_COLORS[i % SRC_COLORS.length]}`} />
                              <span className="font-medium">{src.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4">{src.total}</td>
                          <td className="py-2.5 pr-4">{src.estimated}</td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${perfColor}`}>{src.total > 0 ? closeRate + "%" : "—"}</span>
                              {src.total > 0 && (
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${closeRate >= 40 ? "bg-emerald-500" : closeRate >= 20 ? "bg-yellow-500" : "bg-red-500"}`}
                                    style={{ width: `${Math.min(closeRate, 100)}%` }} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 font-medium text-emerald-600">{src.revenue > 0 ? fmt$(src.revenue) : "—"}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{revPerLead > 0 ? fmt$(revPerLead) : "—"}</td>
                          <td className="py-2.5 pr-4 text-xs font-medium">{perfLabel}</td>
                        </tr>
                      );
                    })}
                    {/* Totals */}
                    <tr className="bg-muted/30 font-bold">
                      <td className="py-2.5 pr-4 text-xs uppercase tracking-wide text-muted-foreground">Total</td>
                      <td className="py-2.5 pr-4">{kpi.total}</td>
                      <td className="py-2.5 pr-4">{kpi.estimated}</td>
                      <td className="py-2.5 pr-4">{pct(kpi.wonCount, kpi.total)}</td>
                      <td className="py-2.5 pr-4 text-emerald-600">{fmt$(kpi.contracted)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{kpi.wonCount > 0 ? fmt$(kpi.contracted / kpi.wonCount) : "—"}</td>
                      <td className="py-2.5 pr-4" />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Revenue bar comparison */}
              {srcList.some(s => s.revenue > 0) && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Revenue by source</p>
                  <div className="space-y-2">
                    {srcList.filter(s => s.revenue > 0).map((src, i) => (
                      <div key={src.name} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{src.name}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${SRC_COLORS[i % SRC_COLORS.length]}`}
                            style={{ width: `${(src.revenue / maxSrcRevenue) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium w-16 text-right">{fmt$(src.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Salesperson table ── */}
          {spList.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold mb-4">Salesperson Performance — {monthLabel}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Salesperson","Leads","In-Person","Phone Quotes","Closed Won","Close %","Contracted Rev"].map(h => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spList.map(sp => (
                      <tr key={sp.name} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-4 font-medium">{sp.name}</td>
                        <td className="py-2.5 pr-4">{sp.total}</td>
                        <td className="py-2.5 pr-4">{sp.inPerson}</td>
                        <td className="py-2.5 pr-4">{sp.phone}</td>
                        <td className="py-2.5 pr-4">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-medium">{sp.won}</span>
                        </td>
                        <td className="py-2.5 pr-4 font-medium">{pct(sp.won, sp.total)}</td>
                        <td className="py-2.5 pr-4 font-bold text-emerald-600">{fmt$(sp.revenue)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30">
                      <td className="py-2.5 pr-4 font-bold text-xs uppercase tracking-wide text-muted-foreground">Total</td>
                      <td className="py-2.5 pr-4 font-bold">{spList.reduce((s,sp) => s+sp.total,0)}</td>
                      <td className="py-2.5 pr-4 font-bold">{spList.reduce((s,sp) => s+sp.inPerson,0)}</td>
                      <td className="py-2.5 pr-4 font-bold">{spList.reduce((s,sp) => s+sp.phone,0)}</td>
                      <td className="py-2.5 pr-4 font-bold">{spList.reduce((s,sp) => s+sp.won,0)}</td>
                      <td className="py-2.5 pr-4 font-bold">{pct(kpi.wonCount, kpi.total)}</td>
                      <td className="py-2.5 pr-4 font-bold text-emerald-600">{fmt$(kpi.contracted)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── LSA / Marketing Spend ── */}
          <div className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">LSA &amp; Marketing Spend — {monthLabel}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  LSA charged leads: <span className="font-medium text-foreground">{kpi.lsaCharged}</span>
                  {" · "}Credited: <span className="font-medium text-foreground">{kpi.lsaCredited}</span>
                  {kpi.costPerLead > 0 && <> · Cost/lead: <span className="font-medium text-foreground">{fmt$(kpi.costPerLead)}</span></>}
                </p>
              </div>
              <button onClick={() => setShowSpendForm(!showSpendForm)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors">
                <Plus className="h-3.5 w-3.5" /> Log Spend
              </button>
            </div>

            {showSpendForm && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Add Marketing Spend</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Source</label>
                    <select value={spendForm.source_id} onChange={e => setSpendForm({...spendForm, source_id: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <option value="">— Select source —</option>
                      {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Amount Spent ($)</label>
                    <input type="number" placeholder="0.00" value={spendForm.amount}
                      onChange={e => setSpendForm({...spendForm, amount: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={handleAddSpend} disabled={savingSpend || !spendForm.amount}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                      <Save className="h-3.5 w-3.5" />{savingSpend ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => setShowSpendForm(false)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {spend.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Source","Spent","LSA Charged Leads","Cost / Lead","ROI"].map(h => (
                      <th key={h} className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spend.map(row => {
                    const srcName = (row.lead_sources as any)?.name || row.source_name || "Unknown";
                    const srcLeads = kpi.bySrc[row.source_id || ""]?.total || 0;
                    const srcWonRev = kpi.bySrc[row.source_id || ""]?.revenue || 0;
                    const cpl = srcLeads > 0 ? Number(row.amount_spent) / srcLeads : 0;
                    const roi = Number(row.amount_spent) > 0 ? ((srcWonRev - Number(row.amount_spent)) / Number(row.amount_spent)) * 100 : 0;
                    return (
                      <tr key={row.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-4">{srcName}</td>
                        <td className="py-2.5 pr-4 font-medium">{fmt$(Number(row.amount_spent))}</td>
                        <td className="py-2.5 pr-4">{srcLeads}</td>
                        <td className="py-2.5 pr-4">{cpl > 0 ? fmt$(cpl) : "—"}</td>
                        <td className={`py-2.5 pr-4 font-medium ${roi >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {Number(row.amount_spent) > 0 ? Math.round(roi) + "%" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/30">
                    <td className="py-2 pr-4 font-bold text-xs uppercase text-muted-foreground">Total</td>
                    <td className="py-2 pr-4 font-bold">{fmt$(kpi.totalSpend)}</td>
                    <td className="py-2 pr-4 font-bold">{kpi.lsaCharged}</td>
                    <td className="py-2 pr-4 font-bold">{kpi.costPerLead > 0 ? fmt$(kpi.costPerLead) : "—"}</td>
                    <td className="py-2 pr-4" />
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No spend logged for {monthLabel} yet. Click &quot;Log Spend&quot; to add.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function ScoreCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    default: "bg-muted/50", blue: "bg-blue-50 dark:bg-blue-950/20",
    purple: "bg-purple-50 dark:bg-purple-950/20", orange: "bg-orange-50 dark:bg-orange-950/20",
    green: "bg-green-50 dark:bg-green-950/20", emerald: "bg-emerald-50 dark:bg-emerald-950/20",
  };
  const iconColorMap: Record<string, string> = {
    default: "text-muted-foreground", blue: "text-blue-500", purple: "text-purple-500",
    orange: "text-orange-500", green: "text-green-600", emerald: "text-emerald-600",
  };
  return (
    <div className={`rounded-lg p-3 ${colorMap[color] || colorMap.default}`}>
      <div className={`mb-2 ${iconColorMap[color] || iconColorMap.default}`}>{icon}</div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
}

function MiniCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function CloseRateCard({ label, won, total, sub, color }: { label: string; won: number; total: number; sub: string; color: string }) {
  const rate = total > 0 ? Math.round((won / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <p className="text-3xl font-bold mb-3">{total > 0 ? rate + "%" : "—"}</p>
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}