import { Users, CalendarCheck, TrendingUp, DollarSign } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PipelineSummary from "@/components/dashboard/PipelineSummary";
import RecentLeads from "@/components/dashboard/RecentLeads";
import { supabase } from "@/lib/supabaseClient";

export default async function DashboardPage() {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  if (error) {
    console.error("Supabase error:", error.message);
  }

  const totalLeads = leads?.length || 0;

  const appointments =
    leads?.filter((lead: any) => lead.appointment_set === true).length || 0;

  const wonDeals =
    leads?.filter((lead: any) => lead.status === "won") || [];

  const closeRate =
    totalLeads > 0
      ? Math.round((wonDeals.length / totalLeads) * 100)
      : 0;

  const revenue = wonDeals.reduce(
    (sum: number, deal: any) =>
      sum + Number(deal.closed_amount || deal.estimated_amount || 0),
    0
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Leads"
          value={String(totalLeads)}
          change="+12%"
          trend="up"
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          delay={0}
        />
        <KpiCard
          title="Appointments Set"
          value={String(appointments)}
          change="+4%"
          trend="up"
          icon={CalendarCheck}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
          delay={75}
        />
        <KpiCard
          title="Close Rate"
          value={`${closeRate}%`}
          change="-2%"
          trend="down"
          icon={TrendingUp}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          delay={150}
        />
        <KpiCard
          title="Revenue"
          value={`$${revenue.toLocaleString()}`}
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