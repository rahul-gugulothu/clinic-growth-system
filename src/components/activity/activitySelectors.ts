import type { ID } from '@/types/entities';
import type {
  Prospect,
  ClinicAudit,
  OutreachRecord,
  Proposal,
  Lead,
  Appointment,
  Followup,
  Review,
} from '@/types/entities';

interface ActivityState {
  prospects: Record<ID, Prospect>;
  audits: Record<ID, ClinicAudit>;
  outreach: Record<ID, OutreachRecord>;
  proposals: Record<ID, Proposal>;
  leads: Record<ID, Lead>;
  appointments: Record<ID, Appointment>;
  followups: Record<ID, Followup>;
  reviews: Record<ID, Review>;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
  sortKey: number;
}

function clean(value: string | undefined | null): string {
  return value?.trim() ?? '';
}

function prioritySortKey(priority: 'high' | 'medium' | 'low'): number {
  return priority === 'high' ? 0 : priority === 'medium' ? 1 : 2;
}

function dateSortKey(iso: string | undefined | null): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  return new Date(iso).getTime();
}

export function selectInternalActivityItems(s: ActivityState): ActivityItem[] {
  const items: ActivityItem[] = [];
  const prospects = Object.values(s.prospects);
  const audits = Object.values(s.audits);
  const outreach = Object.values(s.outreach);
  const proposals = Object.values(s.proposals);

  const auditsByProspect = new Map<string, typeof audits[0][]>();
  for (const a of audits) {
    if (!a.prospect_id) continue;
    const list = auditsByProspect.get(a.prospect_id) || [];
    list.push(a);
    auditsByProspect.set(a.prospect_id, list);
  }

  const outreachByProspect = new Map<string, typeof outreach[0][]>();
  for (const o of outreach) {
    const list = outreachByProspect.get(o.prospect_id) || [];
    list.push(o);
    outreachByProspect.set(o.prospect_id, list);
  }

  const proposalsByProspect = new Map<string, typeof proposals[0][]>();
  for (const p of proposals) {
    const list = proposalsByProspect.get(p.prospect_id) || [];
    list.push(p);
    proposalsByProspect.set(p.prospect_id, list);
  }

  for (const prospect of prospects) {
    const name = clean(prospect.clinic_name) || prospect.prospect_id;
    const prospectAudits = auditsByProspect.get(prospect.prospect_id) || [];
    const prospectOutreach = outreachByProspect.get(prospect.prospect_id) || [];
    const prospectProposals = proposalsByProspect.get(prospect.prospect_id) || [];

    if (prospect.priority === 'High' && prospectAudits.length === 0) {
      items.push({
        id: `audit-needed-${prospect.prospect_id}`,
        type: 'audit',
        title: `Audit needed — ${name}`,
        description: 'High-priority prospect has no completed audit.',
        href: `/internal/audits?prospect=${prospect.prospect_id}`,
        priority: 'high',
        sortKey: prioritySortKey('high') * 1_000_000_000_000,
      });
    }

    if (prospect.priority === 'High' && prospectOutreach.length === 0) {
      items.push({
        id: `contact-${prospect.prospect_id}`,
        type: 'outreach',
        title: `Not contacted — ${name}`,
        description: 'High-priority prospect has not been contacted.',
        href: `/internal/outreach?prospect=${prospect.prospect_id}`,
        priority: 'high',
        sortKey: prioritySortKey('high') * 1_000_000_000_000 + 1,
      });
    }

    for (const o of prospectOutreach) {
      if (o.stage === 'Follow-up due') {
        items.push({
          id: `followup-due-${o.outreach_id}`,
          type: 'outreach',
          title: `Follow-up due — ${name}`,
          description: `Outreach is in Follow-up due stage.`,
          href: `/internal/outreach?prospect=${prospect.prospect_id}`,
          priority: 'high',
          sortKey: prioritySortKey('high') * 1_000_000_000_000 + dateSortKey(o.next_action_at),
        });
      }

      if (o.stage === 'Responded' && o.next_action_at) {
        const next = new Date(o.next_action_at);
        if (next < new Date()) {
          items.push({
            id: `responded-overdue-${o.outreach_id}`,
            type: 'outreach',
            title: `Response needs action — ${name}`,
            description: 'Prospect responded and follow-up is overdue.',
            href: `/internal/outreach?prospect=${prospect.prospect_id}`,
            priority: 'high',
            sortKey: prioritySortKey('high') * 1_000_000_000_000 + dateSortKey(o.next_action_at),
          });
        }
      }
    }

    for (const p of prospectProposals) {
      if (p.status === 'Sent') {
        items.push({
          id: `proposal-sent-${p.proposal_id}`,
          type: 'proposal',
          title: `Proposal awaiting decision — ${name}`,
          description: `Proposal is currently in Sent status.`,
          href: `/internal/sales?prospect=${prospect.prospect_id}`,
          priority: 'medium',
          sortKey: prioritySortKey('medium') * 1_000_000_000_000 + dateSortKey(p.created_at),
        });
      }
    }
  }

  return items.sort((a, b) => a.sortKey - b.sortKey).slice(0, 20);
}

export function selectClinicActivityItems(s: ActivityState, clinicId: ID | null): ActivityItem[] {
  if (!clinicId) return [];

  const items: ActivityItem[] = [];
  const leads = Object.values(s.leads).filter((l) => l.clinic_id === clinicId);
  const leadIds = new Set(leads.map((l) => l.lead_id));
  const appointments = Object.values(s.appointments).filter((a) => leadIds.has(a.lead_id));
  const followups = Object.values(s.followups).filter((f) => leadIds.has(f.lead_id || ''));
  const reviews = Object.values(s.reviews).filter((r) => r.clinic_id === clinicId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const isToday = (iso: string | undefined | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= todayStart && d < todayEnd;
  };

  for (const lead of leads) {
    if (lead.status === 'New') {
      items.push({
        id: `new-lead-${lead.lead_id}`,
        type: 'lead',
        title: `New lead — ${clean(lead.service_interested) || lead.lead_id}`,
        description: 'Lead has not been contacted yet.',
        href: `/clinic/leads/${lead.lead_id}`,
        priority: 'high',
        sortKey: prioritySortKey('high') * 1_000_000_000_000 + dateSortKey(lead.created_at),
      });
    }
  }

  for (const appointment of appointments) {
    if (appointment.status === 'Booked' && isToday(appointment.scheduled_at)) {
      const lead = s.leads[appointment.lead_id];
      items.push({
        id: `appointment-today-${appointment.appointment_id}`,
        type: 'appointment',
        title: `Appointment today — ${clean(lead?.service_interested) || appointment.appointment_id}`,
        description: `Booked for today.`,
        href: '/clinic/appointments',
        priority: 'high',
        sortKey: prioritySortKey('high') * 1_000_000_000_000 + dateSortKey(appointment.scheduled_at),
      });
    }

    if (appointment.status === 'NoShow') {
      const lead = s.leads[appointment.lead_id];
      const recovery = followups.find((f) => f.appointment_id === appointment.appointment_id && f.type === 'Recovery');
      if (!recovery) {
        items.push({
          id: `noshow-recovery-${appointment.appointment_id}`,
          type: 'appointment',
          title: `No-show recovery — ${clean(lead?.service_interested) || appointment.appointment_id}`,
          description: 'No-show appointment needs recovery follow-up.',
          href: '/clinic/appointments',
          priority: 'high',
          sortKey: prioritySortKey('high') * 1_000_000_000_000 + dateSortKey(appointment.scheduled_at),
        });
      }
    }

    if (appointment.status === 'Cancelled') {
      const lead = s.leads[appointment.lead_id];
      const reschedule = followups.find((f) => f.appointment_id === appointment.appointment_id && f.type === 'Reschedule');
      if (!reschedule) {
        items.push({
          id: `cancelled-reschedule-${appointment.appointment_id}`,
          type: 'appointment',
          title: `Reschedule needed — ${clean(lead?.service_interested) || appointment.appointment_id}`,
          description: 'Cancelled appointment needs rescheduling.',
          href: '/clinic/appointments',
          priority: 'high',
          sortKey: prioritySortKey('high') * 1_000_000_000_000 + dateSortKey(appointment.scheduled_at),
        });
      }
    }
  }

  for (const followup of followups) {
    if (followup.status === 'Missed') {
      const lead = followup.lead_id ? s.leads[followup.lead_id] : undefined;
      items.push({
        id: `missed-followup-${followup.followup_id}`,
        type: 'followup',
        title: `Missed follow-up — ${clean(lead?.service_interested) || followup.followup_id}`,
        description: `${followup.type} follow-up was missed.`,
        href: '/clinic/follow-ups',
        priority: 'high',
        sortKey: prioritySortKey('high') * 1_000_000_000_000 + dateSortKey(followup.scheduled_at),
      });
    }

    if (followup.status === 'Scheduled' && isToday(followup.scheduled_at)) {
      const lead = followup.lead_id ? s.leads[followup.lead_id] : undefined;
      items.push({
        id: `followup-today-${followup.followup_id}`,
        type: 'followup',
        title: `Follow-up today — ${clean(lead?.service_interested) || followup.followup_id}`,
        description: `${followup.type} follow-up is scheduled for today.`,
        href: '/clinic/follow-ups',
        priority: 'medium',
        sortKey: prioritySortKey('medium') * 1_000_000_000_000 + dateSortKey(followup.scheduled_at),
      });
    }
  }

  for (const review of reviews) {
    if (review.status === 'Requested') {
      const appointment = review.appointment_id ? s.appointments[review.appointment_id] : undefined;
      const lead = appointment ? s.leads[appointment.lead_id] : undefined;
      items.push({
        id: `review-pending-${review.review_id}`,
        type: 'review',
        title: `Review request pending — ${clean(lead?.service_interested) || review.review_id}`,
        description: 'Review request has been sent but not yet received.',
        href: '/clinic/reviews',
        priority: 'medium',
        sortKey: prioritySortKey('medium') * 1_000_000_000_000 + dateSortKey(review.requested_at),
      });
    }
  }

  return items.sort((a, b) => a.sortKey - b.sortKey).slice(0, 20);
}

export function groupActivityItems(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const map = new Map<string, ActivityItem[]>();
  const order = ['audit', 'outreach', 'proposal', 'lead', 'appointment', 'followup', 'review'];

  for (const item of items) {
    const label = item.type.charAt(0).toUpperCase() + item.type.slice(1) + 's';
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(item);
  }

  return order
    .filter((key) => map.has(key.charAt(0).toUpperCase() + key.slice(1) + 's'))
    .map((key) => {
      const label = key.charAt(0).toUpperCase() + key.slice(1) + 's';
      return { label, items: map.get(label)! };
    });
}
