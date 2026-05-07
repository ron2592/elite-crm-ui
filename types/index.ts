export type LeadStatus =
  | "new"
  | "contacted"
  | "appointment_set"
  | "estimate_sent"
  | "closed_won"
  | "cancelled_appointment"
  | "lost"
  | "not_qualified";

export type ContactType = "in_person" | "phone_quote";

export type LsaStatus =
  | "charged"
  | "submitted"
  | "credited"
  | "not_charged"
  | "in_review";

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "completed";
export type ActivityType = "call" | "email" | "follow_up";
export type ActivityStatus = "completed" | "pending" | "no_answer";
export type AppointmentStatus = "confirmed" | "pending" | "cancelled";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: LeadStatus;
  value: number;
  createdAt: string;
  tags: string[];
  contact_type?: ContactType | null;
  lsa_status?: LsaStatus | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  leadId: string | null;
  leadName: string | null;
}

export interface Activity {
  id: string;
  type: ActivityType;
  leadName: string;
  leadId: string;
  description: string;
  status: ActivityStatus;
  date: string;
  duration: string | null;
}

export interface Appointment {
  id: string;
  leadName: string;
  leadId: string;
  service: string;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  status: AppointmentStatus;
}