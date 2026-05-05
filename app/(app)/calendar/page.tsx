"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChevronLeft, ChevronRight, MapPin, Phone, User, Clock, Briefcase } from "lucide-react";

const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 11 }, (_, i) => i + 7); // 7am–5pm

interface CalendarEvent {
  id: string;
  type: "appointment" | "production";
  title: string;
  subtitle: string;
  phone: string;
  address: string;
  salesperson: string;
  date: string; // YYYY-MM-DD
  startHour: number;
  startMinute: number;
  durationHours: number;
  color: string;
  rawData: any;
}

function getWeekDates(baseDate: Date) {
  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function toLocalDate(iso: string) {
  // Convert UTC ISO string to local date string YYYY-MM-DD
  return new Date(iso).toLocaleDateString("en-CA");
}

function toLocalHour(iso: string) {
  const d = new Date(iso);
  return d.getHours();
}

function toLocalMinute(iso: string) {
  const d = new Date(iso);
  return d.getMinutes();
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const productionStageColors: Record<string, string> = {
  "Scheduled to Start": "bg-amber-400 border-amber-500",
  "Rough Inspection": "bg-cyan-400 border-cyan-500",
  "Final Inspection": "bg-teal-400 border-teal-500",
  "Permit Submitted": "bg-violet-400 border-violet-500",
  "Permit Approved": "bg-purple-400 border-purple-500",
  "Job In Progress": "bg-orange-400 border-orange-500",
};

export default function CalendarPage() {
  const [weekBase, setWeekBase] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const weekDates = getWeekDates(weekBase);

  async function fetchEvents() {
    setLoading(true);

    // Fetch appointment leads
    const { data: apptLeads } = await supabase
      .from("leads")
      .select("id, lead_name, phone, address_line_1, city, state, appointment_at, appointment_notes, metadata")
      .eq("status", "appointment_set")
      .not("appointment_at", "is", null);

    // Fetch production jobs with scheduled dates
    const { data: prodLeads } = await supabase
      .from("leads")
      .select("id, lead_name, phone, address_line_1, city, state, production_stage, production_stage_updated_at, metadata")
      .eq("status", "closed_won")
      .not("production_stage_updated_at", "is", null)
      .in("production_stage", ["Scheduled to Start", "Rough Inspection", "Final Inspection", "Permit Submitted", "Permit Approved", "Job In Progress"]);

    // Fetch production COs with scheduled dates
    const { data: prodCOs } = await supabase
      .from("change_orders")
      .select("id, lead_id, job_type, description, production_stage, production_stage_updated_at")
      .not("production_stage_updated_at", "is", null)
      .in("production_stage", ["Scheduled to Start", "Rough Inspection", "Final Inspection", "Job In Progress"]);

    const evts: CalendarEvent[] = [];

    // Appointment events — show at their scheduled time
    (apptLeads || []).forEach((lead: any) => {
      if (!lead.appointment_at) return;
      evts.push({
        id: `appt-${lead.id}`,
        type: "appointment",
        title: lead.lead_name || "Unnamed",
        subtitle: "Appointment",
        phone: lead.phone || "",
        address: lead.address_line_1 ? `${lead.address_line_1}${lead.city ? ", " + lead.city : ""}` : "",
        salesperson: lead.metadata?.salesperson || "",
        date: toLocalDate(lead.appointment_at),
        startHour: toLocalHour(lead.appointment_at),
        startMinute: toLocalMinute(lead.appointment_at),
        durationHours: 1,
        color: "bg-blue-500 border-blue-600",
        rawData: lead,
      });
    });

    // Production stage events — show on the stage update date
    (prodLeads || []).forEach((lead: any) => {
      if (!lead.production_stage_updated_at) return;
      const color = productionStageColors[lead.production_stage] || "bg-emerald-400 border-emerald-500";
      evts.push({
        id: `prod-${lead.id}`,
        type: "production",
        title: lead.lead_name || "Unnamed",
        subtitle: lead.production_stage,
        phone: lead.phone || "",
        address: lead.address_line_1 ? `${lead.address_line_1}${lead.city ? ", " + lead.city : ""}` : "",
        salesperson: lead.metadata?.salesperson || "",
        date: toLocalDate(lead.production_stage_updated_at),
        startHour: toLocalHour(lead.production_stage_updated_at),
        startMinute: toLocalMinute(lead.production_stage_updated_at),
        durationHours: 1,
        color,
        rawData: lead,
      });
    });

    // Change order production events
    (prodCOs || []).forEach((co: any) => {
      if (!co.production_stage_updated_at) return;
      const color = productionStageColors[co.production_stage] || "bg-emerald-400 border-emerald-500";
      evts.push({
        id: `co-${co.id}`,
        type: "production",
        title: `CO#${co.lead_id?.slice(0, 4)} — ${co.job_type || "Job"}`,
        subtitle: co.production_stage,
        phone: "",
        address: "",
        salesperson: "",
        date: toLocalDate(co.production_stage_updated_at),
        startHour: toLocalHour(co.production_stage_updated_at),
        startMinute: toLocalMinute(co.production_stage_updated_at),
        durationHours: 1,
        color,
        rawData: co,
      });
    });

    setEvents(evts);
    setLoading(false);
  }

  useEffect(() => { fetchEvents(); }, []);

  function goToPrevWeek() {
    const d = new Date(weekBase);
    d.setDate(d.getDate() - 7);
    setWeekBase(d);
  }
  function goToNextWeek() {
    const d = new Date(weekBase);
    d.setDate(d.getDate() + 7);
    setWeekBase(d);
  }
  function goToToday() { setWeekBase(new Date()); }

  const todayStr = formatDate(new Date());

  const weekLabel = (() => {
    const start = weekDates[0];
    const end = weekDates[6];
    if (start.getMonth() === end.getMonth()) {
      return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  })();

  const weekEventCount = events.filter(e => weekDates.some(d => formatDate(d) === e.date)).length;

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={goToPrevWeek} className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold text-sm px-2 min-w-[200px] text-center">{weekLabel}</span>
          <button onClick={goToNextWeek} className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={goToToday} className="text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium ml-1">
            Today
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{weekEventCount} event{weekEventCount !== 1 ? "s" : ""} this week</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Appointments</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Production</span>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Day headers */}
        <div className="grid border-b" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div className="border-r bg-muted/30" />
          {weekDates.map((d, i) => {
            const dateStr = formatDate(d);
            const isToday = dateStr === todayStr;
            const dayEvents = events.filter(e => e.date === dateStr);
            return (
              <div key={dateStr} className={`border-r last:border-r-0 px-2 py-2.5 text-center ${isToday ? "bg-primary/5" : "bg-muted/10"}`}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{DAY_LABELS[i]}</p>
                <p className={`text-sm font-bold mt-0.5 ${isToday ? "text-primary" : ""}`}>{d.getDate()}</p>
                {dayEvents.length > 0 && (
                  <div className="mt-1 flex justify-center gap-0.5">
                    {dayEvents.slice(0, 3).map((_, idx) => (
                      <span key={idx} className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="overflow-y-auto" style={{ maxHeight: "600px" }}>
          <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
            {/* Background grid */}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              <div className="border-r">
                {HOURS.map(h => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b flex items-start justify-end pr-2 pt-1">
                    <span className="text-xs text-muted-foreground/50">
                      {h > 12 ? `${h - 12}pm` : h === 12 ? "12pm" : `${h}am`}
                    </span>
                  </div>
                ))}
              </div>
              {weekDates.map((d, i) => {
                const isToday = formatDate(d) === todayStr;
                return (
                  <div key={i} className={`border-r last:border-r-0 ${isToday ? "bg-primary/3" : ""}`}>
                    {HOURS.map(h => <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b" />)}
                  </div>
                );
              })}
            </div>

            {/* Events overlay */}
            <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              <div className="border-r" />
              {weekDates.map((d) => {
                const dateStr = formatDate(d);
                const dayEvents = events.filter(e => e.date === dateStr);
                return (
                  <div key={dateStr} className="relative border-r last:border-r-0 pointer-events-auto">
                    {dayEvents.map((evt) => {
                      const topHours = (evt.startHour - HOURS[0]) + (evt.startMinute / 60);
                      const top = Math.max(0, topHours * HOUR_HEIGHT);
                      const height = Math.max(evt.durationHours * HOUR_HEIGHT - 4, 40);
                      return (
                        <div
                          key={evt.id}
                          className="absolute left-1 right-1 z-10 cursor-pointer"
                          style={{ top: top + 2, height }}
                          onClick={() => setSelectedEvent(evt)}
                        >
                          <div className={`h-full rounded-md border-l-2 px-2 py-1 text-white text-xs overflow-hidden shadow-sm hover:shadow-md transition-shadow ${evt.color}`}>
                            <p className="font-semibold truncate">{evt.title}</p>
                            <p className="opacity-80 truncate">{evt.subtitle}</p>
                            {evt.salesperson && (
                              <p className="opacity-70 truncate">{evt.salesperson}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Event detail panel */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelectedEvent(null)}>
          <div className="bg-card rounded-xl border shadow-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-base">{selectedEvent.title}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${selectedEvent.color}`}>
                  {selectedEvent.subtitle}
                </span>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  {selectedEvent.date} at {selectedEvent.startHour > 12 ? selectedEvent.startHour - 12 : selectedEvent.startHour}:
                  {String(selectedEvent.startMinute).padStart(2, "0")}
                  {selectedEvent.startHour >= 12 ? "pm" : "am"}
                </span>
              </div>
              {selectedEvent.address && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{selectedEvent.address}</span>
                </div>
              )}
              {selectedEvent.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{selectedEvent.phone}</span>
                </div>
              )}
              {selectedEvent.salesperson && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4 shrink-0" />
                  <span>{selectedEvent.salesperson}</span>
                </div>
              )}
              {selectedEvent.type === "production" && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="h-4 w-4 shrink-0" />
                  <span>Production job</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && weekEventCount === 0 && (
        <div className="rounded-xl border bg-muted/20 p-8 text-center">
          <p className="text-muted-foreground text-sm">No events this week.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Set appointment dates on leads or schedule production stages to see them here.</p>
        </div>
      )}
    </div>
  );
}