import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  delay?: number;
}

export default function KpiCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  iconColor,
  iconBg,
  delay = 0,
}: KpiCardProps) {
  return (
    <div
      className="rounded-xl border bg-card p-5 shadow-sm animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
          <div className="mt-1.5 flex items-center gap-1">
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3 text-emerald-500" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3 w-3 text-red-500" />
            ) : null}
            <span
              className={cn(
                "text-xs font-medium",
                trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-muted-foreground"
              )}
            >
              {change}
            </span>
            <span className="text-xs text-muted-foreground">vs last month</span>
          </div>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
