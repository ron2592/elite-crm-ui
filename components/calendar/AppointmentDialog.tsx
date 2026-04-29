"use client";

import { Appointment } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Clock, User, Wrench, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AppointmentDialogProps {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AppointmentDialog({ appointment, open, onOpenChange }: AppointmentDialogProps) {
  if (!appointment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Appointment Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2.5 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{appointment.leadName}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span>{appointment.service}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              {new Date(appointment.date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{appointment.startTime} – {appointment.endTime}</span>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span>{appointment.address}</span>
          </div>
          <div className="pt-1">
            <Badge variant={appointment.status === "confirmed" ? "success" : "warning"}>
              {appointment.status === "confirmed" ? "Confirmed" : "Pending"}
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
