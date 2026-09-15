import type { ID } from '@/types/entities';

export interface SearchItem {
  id: string;
  type: 'prospect' | 'audit' | 'outreach' | 'proposal' | 'clinic' | 'lead' | 'conversation' | 'appointment' | 'action';
  title: string;
  subtitle?: string;
  href?: string;
  workspace: 'internal' | 'clinic' | 'all';
}

export interface SearchGroup {
  label: string;
  items: SearchItem[];
}

const clean = (value: string | undefined | null): string => value?.trim() ?? '';

export function buildSearchIndex(
  state: {
    prospects: Record<ID, { prospect_id: string; clinic_name: string; doctor_name: string; specialty: string; area: string; priority: string }>;
    audits: Record<ID, { audit_id: string; prospect_id: string | null; overall_opportunity: string }>;
    outreach: Record<ID, { outreach_id: string; prospect_id: string; stage: string; channel: string }>;
    proposals: Record<ID, { proposal_id: string; prospect_id: string; status: string; price_inr: number }>;
    clinics: Record<ID, { clinic_id: string; name: string }>;
    leads: Record<ID, { lead_id: string; clinic_id: string; service_interested: string; status: string; source: string }>;
    conversations: Record<ID, { conversation_id: string; lead_id: string }>;
    appointments: Record<ID, { appointment_id: string; lead_id: string; doctor_id: string; status: string }>;
    doctors: Record<ID, { doctor_id: string; name: string }>;
    session: { activeClinicId: ID | null };
  },
  session: { currentWorkspace: 'internal' | 'clinic' | null; activeClinicId: ID | null },
): SearchItem[] {
  const items: SearchItem[] = [];

  const clinicIds = new Set(
    Object.values(state.leads)
      .filter((l) => l.clinic_id)
      .map((l) => l.clinic_id as ID),
  );

  for (const c of Object.values(state.clinics)) {
    items.push({
      id: c.clinic_id,
      type: 'clinic',
      title: clean(c.name) || c.clinic_id,
      subtitle: 'Clinic',
      href: '/clinic',
      workspace: 'clinic',
    });
  }

  for (const p of Object.values(state.prospects)) {
    const subtitle = [p.specialty, p.area, p.priority].filter(Boolean).join(' · ');
    items.push({
      id: p.prospect_id,
      type: 'prospect',
      title: clean(p.clinic_name) || p.prospect_id,
      subtitle: subtitle ? `Prospect · ${subtitle}` : 'Prospect',
      href: `/internal/prospects/${p.prospect_id}`,
      workspace: 'internal',
    });
  }

  for (const a of Object.values(state.audits)) {
    const prospect = a.prospect_id ? state.prospects[a.prospect_id] : undefined;
    const title = clean(prospect?.clinic_name) || a.audit_id;
    items.push({
      id: a.audit_id,
      type: 'audit',
      title,
      subtitle: `Audit · ${a.overall_opportunity || 'No opportunity set'}`,
      href: `/internal/audits/${a.audit_id}`,
      workspace: 'internal',
    });
  }

  for (const o of Object.values(state.outreach)) {
    const prospect = state.prospects[o.prospect_id];
    const title = clean(prospect?.clinic_name) || o.outreach_id;
    items.push({
      id: o.outreach_id,
      type: 'outreach',
      title,
      subtitle: `Outreach · ${o.stage} · ${o.channel}`,
      href: '/internal/outreach',
      workspace: 'internal',
    });
  }

  for (const p of Object.values(state.proposals)) {
    const prospect = state.prospects[p.prospect_id];
    const title = clean(prospect?.clinic_name) || p.proposal_id;
    const price = p.price_inr ? `₹${p.price_inr.toLocaleString('en-IN')}` : '';
    items.push({
      id: p.proposal_id,
      type: 'proposal',
      title,
      subtitle: `Proposal · ${p.status}${price ? ` · ${price}` : ''}`,
      href: '/internal/sales',
      workspace: 'internal',
    });
  }

  const activeClinicId = session.activeClinicId || (clinicIds.size > 0 ? Array.from(clinicIds)[0] : null);
  const accessibleLeadIds = activeClinicId
    ? new Set(Object.values(state.leads).filter((l) => l.clinic_id === activeClinicId).map((l) => l.lead_id))
    : new Set(Object.keys(state.leads));

  for (const l of Object.values(state.leads)) {
    if (!accessibleLeadIds.has(l.lead_id)) continue;
    const clinic = state.clinics[l.clinic_id];
    const title = clean(l.service_interested) || l.lead_id;
    items.push({
      id: l.lead_id,
      type: 'lead',
      title,
      subtitle: `Lead · ${clean(clinic?.name) || l.clinic_id} · ${l.status} · ${l.source}`,
      href: `/clinic/leads/${l.lead_id}`,
      workspace: 'clinic',
    });
  }

  for (const c of Object.values(state.conversations)) {
    if (!c.lead_id || !accessibleLeadIds.has(c.lead_id)) continue;
    const lead = state.leads[c.lead_id];
    const clinic = lead ? state.clinics[lead.clinic_id] : undefined;
    const title = clean(lead?.service_interested) || c.conversation_id;
    items.push({
      id: c.conversation_id,
      type: 'conversation',
      title,
      subtitle: `Conversation · ${clean(clinic?.name) || c.conversation_id}`,
      href: `/clinic/conversations?lead=${c.lead_id}`,
      workspace: 'clinic',
    });
  }

  for (const a of Object.values(state.appointments)) {
    if (!accessibleLeadIds.has(a.lead_id)) continue;
    const lead = state.leads[a.lead_id];
    const clinic = lead ? state.clinics[lead.clinic_id] : undefined;
    const doctor = a.doctor_id ? state.doctors[a.doctor_id] : undefined;
    const title = `${clean(lead?.service_interested) || a.appointment_id} · ${clean(doctor?.name) || ''}`.trim();
    items.push({
      id: a.appointment_id,
      type: 'appointment',
      title: title || a.appointment_id,
      subtitle: `Appointment · ${clean(clinic?.name) || ''} · ${a.status}`.trim(),
      href: '/clinic/appointments',
      workspace: 'clinic',
    });
  }

  return items;
}

const GROUP_LABELS: Record<string, string> = {
  prospect: 'Prospects',
  audit: 'Audits',
  outreach: 'Outreach',
  proposal: 'Proposals',
  clinic: 'Clinics',
  lead: 'Leads',
  conversation: 'Conversations',
  appointment: 'Appointments',
  action: 'Actions',
};

export function groupResults(items: SearchItem[]): SearchGroup[] {
  const map = new Map<string, SearchItem[]>();
  const order = ['prospect', 'audit', 'outreach', 'proposal', 'clinic', 'lead', 'conversation', 'appointment', 'action'];

  for (const item of items) {
    const label = GROUP_LABELS[item.type] || item.type;
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(item);
  }

  return order
    .filter((key) => map.has(GROUP_LABELS[key]))
    .map((key) => ({ label: GROUP_LABELS[key], items: map.get(GROUP_LABELS[key])! }));
}

export function filterItems(items: SearchItem[], query: string): SearchItem[] {
  if (!query.trim()) return items.slice(0, 50);
  const q = query.toLowerCase();
  return items.filter((item) => {
    const haystack = `${item.title} ${item.subtitle ?? ''}`.toLowerCase();
    return haystack.includes(q);
  });
}
