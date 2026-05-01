"use client";

import { useState } from "react";
import { mockAppointments } from "@/lib/mock-data";
import { Appointment } from "@/types";
import AppointmentCard from "@/components/calendar/AppointmentCard";
import AppointmentDialog from "@/components/calendar/AppointmentDialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Week of July 8–14, 2024 to match mock data
const WEEK_DATES = [
  { date: "2024-07-08", day: "Mon", label: "Jul 8" },
  { date: "2024-07-09", day: "Tue", label: "Jul 9" },
  { date: "2024-07-10", day: "Wed", label: "Jul 10" },
  { date: "2024-07-11", day: "Thu", label: "Jul 11" },
  { date: "2024-07-12", day: "Fri", label: "Jul 12" },
  { date: "2024-07-13", day: "Sat", label: "Jul 13" },
  { date: "2024-07-14", day: "Sun", label: "Jul 14" },
];

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8am–5pm

function timeToRow(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h - 8 + m / 60;
}

function durationHours(start: string, end: string): number {
  const s = timeToRow(start);
  const e = timeToRow(end);
  return e - s;
}

export default function CalendarPage() {
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const HOUR_HEIGHT = 72; // px per hour

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-display font-semibold text-sm px-2">July 8 – 14, 2024</span>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {mockAppointments.length} appointments this week
          </span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Day headers */}
        <div className="grid border-b" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
          <div className="border-r" />
          {WEEK_DATES.map((d) => {
            const apptCount = mockAppointments.filter((a) => a.date === d.date).length;
            return (
              <div key={d.date} className="border-r last:border-r-0 px-2 py-3 text-center">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{d.day}</p>
                <p className="font-display text-sm font-semibold mt-0.5">{d.label.split(" ")[1]}</p>
                {apptCount > 0 && (
                  <div className="mt-1 flex justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="overflow-y-auto max-h-[600px] scrollbar-thin">
          <div className="relative" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
            {/* Hour rows background */}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}>
              {/* Left time labels column */}
              <div className="border-r">
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b flex items-start justify-end pr-2 pt-1">
                    <span className="text-xs text-muted-foreground/60">
                      {h > 12 ? `${h - 12}pm` : h === 12 ? "12pm" : `${h}am`}
                    </span>
                  </div>
                ))}
              </div>
              {/* Day columns */}
              {WEEK_DATES.map((d) => (
                <div key={d.date} className="border-r last:border-r-0">
                  {HOURS.map((h) => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b" />
                  ))}
                </div>
              ))}
            </div>

            {/* Appointment overlays */}
            <div className="relative grid" style={{ gridTemplateColumns: "64px repeat(7, 1fr)", height: HOURS.length * HOUR_HEIGHT }}>
              <div className="border-r" />
              {WEEK_DATES.map((d, colIdx) => {
                const dayAppts = mockAppointments.filter((a) => a.date === d.date);
                return (
                  <div key={d.date} className="relative border-r last:border-r-0">
                    {dayAppts.map((appt) => {
                      const top = timeToRow(appt.startTime) * HOUR_HEIGHT;
                      const height = durationHours(appt.startTime, appt.endTime) * HOUR_HEIGHT;
                      return (
                        <div
                          key={appt.id}
                          className="absolute left-1 right-1 z-10"
                          style={{ top: top + 2, height: height - 4 }}
                        >
                          <AppointmentCard
                            appointment={appt}
                            compact={height < 70}
                            onClick={() => {
                              setSelectedAppt(appt);
                              setDialogOpen(true);
                            }}
                          />
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

      <AppointmentDialog
        appointment={selectedAppt}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
