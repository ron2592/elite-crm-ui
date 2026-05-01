import { Appointment } from "@/types";
import { MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const serviceColors: Record<string, string> = {
  "Roof Inspection": "bg-blue-100 border-blue-300 text-blue-800",
  "Free Estimate": "bg-amber-100 border-amber-300 text-amber-800",
  Consultation: "bg-violet-100 border-violet-300 text-violet-800",
  Installation: "bg-emerald-100 border-emerald-300 text-emerald-800",
};

interface AppointmentCardProps {
  appointment: Appointment;
  onClick?: () => void;
  compact?: boolean;
}

export default function AppointmentCard({ appointment, onClick, compact }: AppointmentCardProps) {
  const colorClass = serviceColors[appointment.service] ?? "bg-gray-100 border-gray-300 text-gray-800";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 cursor-pointer hover:shadow-md transition-all duration-200",
        colorClass,
        compact ? "p-2" : "p-3"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>
            {appointment.leadName}
          </p>
          <p className={cn("font-medium opacity-80", compact ? "text-xs" : "text-xs mt-0.5")}>
            {appointment.service}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs font-medium",
            appointment.status === "confirmed"
              ? "bg-emerald-200/60 text-emerald-800"
              : "bg-amber-200/60 text-amber-800"
          )}
        >
          {appointment.status === "confirmed" ? "✓" : "?"}
        </span>
      </div>
      {!compact && (
        <div className="mt-2 space-y-1 text-xs opacity-70">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{appointment.startTime} – {appointment.endTime}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{appointment.address}</span>
          </div>
        </div>
      )}
    </div>
  );
}
