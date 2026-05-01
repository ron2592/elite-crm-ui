"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Users, CalendarCheck, TrendingUp, DollarSign } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PipelineSummary from "@/components/dashboard/PipelineSummary";
import RecentLeads from "@/components/dashboard/RecentLeads";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalLeads: 0,
    appointments: 0,
    closeRate: 0,
    revenue: 0,
    loaded: false,
  });

  useEffect(() => {
    async function fetchStats() {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("*");

      if (error) {
        console.error("Dashboard fetch error:", error.message);
        return;
      }

      if (!leads) return;

      const total = leads.length;
      const appts = leads.filter((l: any) => 
        l.appointment_set === true || l.status === "appointment_set"
    ).length;
      const won = leads.filter((l: any) =>
        l.status === "closed_won" || l.status === "won"
      );
      const rate = total > 0 ? Math.round((won.length / total) * 100) : 0;
      const rev = won.reduce(
        (sum: number, l: any) =>
          sum + Number(l.closed_amount || l.estimated_amount || 0),
        0
      );

      setStats({
        totalLeads: total,
        appointments: appts,
        closeRate: rate,
        revenue: rev,
        loaded: true,
      });
    }
    fetchStats();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl">
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
          title="Revenue"
          value={stats.loaded ? `$${stats.revenue.toLocaleString()}` : "..."}
          change="+18%"
          trend="up"
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          delay={225}
        />
      </div>

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