import { Users, CalendarCheck, TrendingUp, DollarSign } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PipelineSummary from "@/components/dashboard/PipelineSummary";
import RecentLeads from "@/components/dashboard/RecentLeads";

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Leads"
          value="47"
          change="+12%"
          trend="up"
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          delay={0}
        />
        <KpiCard
          title="Appointments Set"
          value="12"
          change="+4%"
          trend="up"
          icon={CalendarCheck}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
          delay={75}
        />
        <KpiCard
          title="Close Rate"
          value="34%"
          change="-2%"
          trend="down"
          icon={TrendingUp}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          delay={150}
        />
        <KpiCard
          title="Revenue"
          value="$16,400"
          change="+18%"
          trend="up"
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          delay={225}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <div>
          <PipelineSummary />
        </div>
      </div>

      {/* Recent Leads */}
      <RecentLeads />
    </div>
  );
}
