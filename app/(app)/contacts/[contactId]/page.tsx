"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Lead } from "@/types";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { ChevronLeft, ChevronDown, ChevronUp, Phone, Mail, MapPin, Briefcase, Loader2, ExternalLink, Pencil } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  new: "New Lead", open: "New Lead", contacted: "Qualified",
  appointment_set: "Appointment Set", estimate_sent: "Estimate Sent",
  closed_won: "Closed Won", won: "Closed Won", completed: "Completed",
  completed_with_balance: "Completed", closed_lost: "Cancelled Appt",
  cancelled_appointment: "Cancelled Appt", no_opportunity: "No Opportunity",
  lost: "Lost", not_qualified: "Not Qualified",
};
const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700", open: "bg-blue-100 text-blue-700",
  contacted: "bg-violet-100 text-violet-700", appointment_set: "bg-amber-100 text-amber-700",
  estimate_sent: "bg-orange-100 text-orange-700", closed_won: "bg-emerald-100 text-emerald-700",
  won: "bg-emerald-100 text-emerald-700", completed: "bg-green-100 text-green-700",
  completed_with_balance: "bg-lime-100 text-lime-700", cancelled_appointment: "bg-yellow-100 text-yellow-700",
  no_opportunity: "bg-slate-100 text-slate-500", lost: "bg-red-100 text-red-600",
  not_qualified: "bg-gray-100 text-gray-500",
};
const CO_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700", won: "bg-emerald-100 text-emerald-700", lost: "bg-red-100 text-red-600",
};

interface ChangeOrderRow {
  id: string; order_number: number; description: string | null; job_type: string | null;
  amount: number; status: "pending" | "won" | "lost"; date_added: string; record_type: string | null;
  collected: number;
}

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPhone(value: string) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

export default function ClientProfilePage({ params }: { params: { contactId: string } }) {
  const router = useRouter();
  const contactId = params.contactId;

  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [revenueByLead, setRevenueByLead] = useState<Record<string, number>>({});
  const [collectedByLead, setCollectedByLead] = useState<Record<string, number>>({});
  const [coCountByLead, setCoCountByLead] = useState<Record<string, number>>({});
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Job history is fetched lazily, one lead at a time, only when a row is expanded --
  // a repeat client with years of change orders shouldn't pay the cost of loading all
  // of them just to view a list of job addresses.
  const [expandedLeadIds, setExpandedLeadIds] = useState<Set<string>>(new Set());
  const [changeOrdersByLead, setChangeOrdersByLead] = useState<Record<string, ChangeOrderRow[]>>({});
  const [loadingCOForLead, setLoadingCOForLead] = useState<Set<string>>(new Set());

  useEffect(() => { fetchAll(); }, [contactId]);

  async function toggleExpand(leadId: string) {
    setExpandedLeadIds(prev => {
      const next = new Set(prev);
      next.has(leadId) ? next.delete(leadId) : next.add(leadId);
      return next;
    });
    if (changeOrdersByLead[leadId] || loadingCOForLead.has(leadId)) return;

    setLoadingCOForLead(prev => new Set(prev).add(leadId));
    const { data: orders } = await supabase
      .from("change_orders")
      .select("id,order_number,description,job_type,amount,status,date_added,record_type")
      .eq("lead_id", leadId).is("deleted_at", null).order("order_number", { ascending: true });

    const orderList = orders || [];
    const orderIds = orderList.map((o: any) => o.id);
    let collectedByCO: Record<string, number> = {};
    if (orderIds.length > 0) {
      const { data: coPayments } = await supabase
        .from("change_order_payments").select("amount,change_order_id").in("change_order_id", orderIds);
      (coPayments || []).forEach((p: any) => {
        collectedByCO[p.change_order_id] = (collectedByCO[p.change_order_id] || 0) + Number(p.amount || 0);
      });
    }

    setChangeOrdersByLead(prev => ({
      ...prev,
      [leadId]: orderList.map((o: any) => ({ ...o, collected: collectedByCO[o.id] || 0 })),
    }));
    setLoadingCOForLead(prev => { const next = new Set(prev); next.delete(leadId); return next; });
  }

  async function fetchAll() {
    setLoading(true);

    const { data: contactRow } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
    setContact(contactRow);

    const { data: leadRows } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });
    const leadList = leadRows || [];
    setLeads(leadList);

    const leadIds = leadList.map((l: any) => l.id);
    if (leadIds.length === 0) { setLoading(false); return; }

    const [revRes, payRes, coPayRes, coRes] = await Promise.all([
      supabase.from("revenue_events").select("lead_id,amount").eq("contact_id", contactId),
      supabase.from("payments").select("amount,lead_id").in("lead_id", leadIds),
      supabase.from("change_order_payments").select("amount,lead_id").in("lead_id", leadIds),
      supabase.from("change_orders").select("lead_id").in("lead_id", leadIds).is("deleted_at", null),
    ]);

    const revMap: Record<string, number> = {};
    (revRes.data || []).forEach((r: any) => { revMap[r.lead_id] = (revMap[r.lead_id] || 0) + Number(r.amount || 0); });
    setRevenueByLead(revMap);

    const collMap: Record<string, number> = {};
    [...(payRes.data || []), ...(coPayRes.data || [])].forEach((p: any) => {
      collMap[p.lead_id] = (collMap[p.lead_id] || 0) + Number(p.amount || 0);
    });
    setCollectedByLead(collMap);

    const coCountMap: Record<string, number> = {};
    (coRes.data || []).forEach((c: any) => { coCountMap[c.lead_id] = (coCountMap[c.lead_id] || 0) + 1; });
    setCoCountByLead(coCountMap);

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading client profile...
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/contacts")} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Contacts
        </button>
        <p className="text-sm text-muted-foreground text-center py-10">Client not found.</p>
      </div>
    );
  }

  const totalRevenue   = Object.values(revenueByLead).reduce((s, n) => s + n, 0);
  const totalCollected = Object.values(collectedByLead).reduce((s, n) => s + n, 0);
  const balance        = totalRevenue - totalCollected;
  const jobCount        = leads.length;
  const firstJobDate    = leads.length ? new Date(leads[0].created_at) : null;
  const initials = (contact.full_name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  // contacts.email/phone can lag behind the linked leads if the contact row predates the sync
  // trigger -- fall back to the most recent lead's value so the profile never looks blank.
  const latestLead = leads.length ? leads[leads.length - 1] : null;
  const displayEmail = contact.email || latestLead?.email || "";
  const displayPhone = contact.phone || latestLead?.phone || "";

  return (
    <div className="space-y-5">
      <button onClick={() => router.push("/contacts")} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Back to Contacts
      </button>

      {/* ── Client header ── */}
      <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary shrink-0">
          {initials}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{contact.full_name || "Unnamed Client"}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
            {displayPhone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {formatPhone(displayPhone)}</span>}
            {displayEmail && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {displayEmail}</span>}
            {jobCount > 1 && <span className="text-purple-600 font-medium flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> Repeat client · {jobCount} jobs</span>}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt$(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Across all jobs</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Collected</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt$(totalCollected)}</p>
          <p className="text-xs text-muted-foreground mt-1">Actual cash received</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Balance Due</p>
          <p className={`text-2xl font-bold ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>{fmt$(balance)}</p>
          <p className="text-xs text-muted-foreground mt-1">Outstanding</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Jobs</p>
          <p className="text-2xl font-bold">{jobCount}</p>
          <p className="text-xs text-muted-foreground mt-1">{firstJobDate ? `Client since ${firstJobDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}</p>
        </div>
      </div>

      {/* ── Jobs list ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-muted/20 border-b border-border">
          <p className="text-sm font-semibold">Jobs</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["", "Address", "Job Type", "Source", "Status", "Contract", "Change Orders", "Revenue", "Collected", "Received", ""].map((h, idx) => (
                  <th key={idx} className="text-left text-xs text-muted-foreground font-semibold px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l: any, i: number) => {
                const address = (l.address_line_1 || l.client_address)
                  ? `${l.address_line_1 || l.client_address}${(l.city || l.client_city) ? ", " + (l.city || l.client_city) : ""}`
                  : "No address";
                const revenue   = revenueByLead[l.id] || 0;
                const collected = collectedByLead[l.id] || 0;
                const coCount   = coCountByLead[l.id] || 0;
                const received  = new Date(l.created_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
                const jobType   = l.metadata?.job_type || "—";
                const isExpanded = expandedLeadIds.has(l.id);
                const isLoadingCO = loadingCOForLead.has(l.id);
                const coRows = changeOrdersByLead[l.id] || [];
                return (
                  <Fragment key={l.id}>
                    <tr onClick={() => toggleExpand(l.id)}
                      className={`border-b border-border/40 cursor-pointer hover:bg-muted/20 ${i % 2 !== 0 ? "bg-muted/5" : ""} ${isExpanded ? "bg-primary/5" : ""}`}>
                      <td className="pl-4 py-3 text-muted-foreground">
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium">{address}</span>
                        </div>
                        {Array.isArray(l.links) && l.links.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                            {l.links.map((link: any, idx: number) => (
                              <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border hover:bg-muted text-primary transition-colors">
                                <ExternalLink className="h-3 w-3" /> {link.label || "Link"}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{jobType}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{(l.lead_sources as any)?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-500"}`}>
                          {STATUS_LABELS[l.status] || l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{l.initial_contract_value > 0 ? fmt$(Number(l.initial_contract_value)) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{coCount > 0 ? `${coCount} CO${coCount > 1 ? "s" : ""}` : "—"}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600">{revenue > 0 ? fmt$(revenue) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{collected > 0 ? fmt$(collected) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{received}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setSelectedLead(l); setDialogOpen(true); }} title="Edit this job"
                          className="text-muted-foreground hover:text-primary transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-border/40 bg-muted/10">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="ml-6 rounded-lg border border-border bg-card overflow-hidden">
                            <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job history — {address}</p>
                              <p className="text-xs text-muted-foreground">Initial contract: <span className="font-semibold text-foreground">{l.initial_contract_value > 0 ? fmt$(Number(l.initial_contract_value)) : "—"}</span></p>
                            </div>
                            {isLoadingCO ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-4">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading change orders...
                              </div>
                            ) : coRows.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-3 py-4">No change orders on this job.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border">
                                    {["#", "Date", "Description", "Type", "Status", "Amount", "Collected", "Balance"].map(h => (
                                      <th key={h} className="text-left text-muted-foreground font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {coRows.map(co => {
                                    const bal = Number(co.amount) - co.collected;
                                    return (
                                      <tr key={co.id} className="border-b border-border/30">
                                        <td className="px-3 py-2 text-muted-foreground">#{co.order_number}</td>
                                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{co.date_added ? new Date(co.date_added).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"}</td>
                                        <td className="px-3 py-2">{co.description || "—"}</td>
                                        <td className="px-3 py-2 text-muted-foreground">{co.job_type || "—"}</td>
                                        <td className="px-3 py-2">
                                          <span className={`px-2 py-0.5 rounded-full font-medium ${CO_STATUS_COLORS[co.status] || "bg-gray-100 text-gray-500"}`}>
                                            {co.status.charAt(0).toUpperCase() + co.status.slice(1)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 font-semibold">{fmt$(Number(co.amount))}</td>
                                        <td className="px-3 py-2 text-emerald-600">{co.collected > 0 ? fmt$(co.collected) : "—"}</td>
                                        <td className={`px-3 py-2 ${bal > 0 ? "text-red-500" : "text-muted-foreground"}`}>{bal !== 0 ? fmt$(bal) : "—"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="bg-muted/30 font-bold border-t-2 border-border">
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-xs uppercase text-muted-foreground tracking-wide" colSpan={6}>Total</td>
                <td className="px-4 py-2.5 text-emerald-600">{fmt$(totalRevenue)}</td>
                <td className="px-4 py-2.5">{fmt$(totalCollected)}</td>
                <td className="px-4 py-2.5" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <LeadDetailDialog
        lead={selectedLead as Lead | null}
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) fetchAll(); }}
        onStageChange={(async (leadId: string, newStatus: string) => {
          await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
          fetchAll();
        }) as any}
        onLeadUpdated={(() => fetchAll()) as any}
        onLeadDeleted={() => { setDialogOpen(false); fetchAll(); }}
      />
    </div>
  );
}
