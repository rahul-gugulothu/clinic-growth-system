// Status enums and transition guards.
// Spec source: docs/Clinic_Growth_System_V1_Implementation_Specification.md §6
// and docs/Clinic_Growth_System_V1_Prototype_Specification.md §2.5, §3.2, §3.5.

export const OUTREACH_STAGES = [
  'Not contacted',
  'Contacted',
  'Responded',
  'Follow-up due',
  'Call',
  'Proposal',
  'Won',
  'Lost',
] as const;
export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export const OUTREACH_STAGE_TRANSITIONS: Record<OutreachStage, OutreachStage[]> = {
  'Not contacted': ['Contacted', 'Lost'],
  Contacted: ['Responded', 'Follow-up due', 'Lost'],
  Responded: ['Follow-up due', 'Call', 'Lost'],
  'Follow-up due': ['Call', 'Contacted', 'Lost'],
  Call: ['Proposal', 'Follow-up due', 'Lost'],
  Proposal: ['Won', 'Lost'],
  Won: [],
  Lost: [],
};

export const PROPOSAL_STATUSES = ['Draft', 'Sent', 'Accepted', 'Lost'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  Draft: ['Sent', 'Lost'],
  Sent: ['Accepted', 'Lost'],
  Accepted: [],
  Lost: [],
};

export const AUDIT_OPPORTUNITY = ['Low', 'Medium', 'High'] as const;
export type AuditOpportunity = (typeof AUDIT_OPPORTUNITY)[number];

export const PRIORITIES = ['Low', 'Medium', 'High'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CLINIC_STATUSES = ['Onboarding', 'Active', 'Paused', 'Churned'] as const;
export type ClinicStatus = (typeof CLINIC_STATUSES)[number];

// Clinic-side statuses are defined for completeness; Milestone 2 wires them.
export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Booked', 'Attended', 'Lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const APPOINTMENT_STATUSES = ['Booked', 'Attended', 'NoShow', 'Cancelled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const FOLLOWUP_STATUSES = ['Scheduled', 'Completed', 'Missed', 'Cancelled'] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const REVIEW_STATUSES = ['Requested', 'Received', 'Declined'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  New: ['Contacted', 'Lost'],
  Contacted: ['Qualified', 'Lost'],
  Qualified: ['Booked', 'Lost'],
  Booked: ['Attended', 'Lost'],
  Attended: ['Lost'],
  Lost: [],
};

export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  Booked: ['Attended', 'NoShow', 'Cancelled'],
  Attended: [],
  NoShow: ['Cancelled'],
  Cancelled: [],
};

export const FOLLOWUP_TRANSITIONS: Record<FollowupStatus, FollowupStatus[]> = {
  Scheduled: ['Completed', 'Missed', 'Cancelled'],
  Completed: [],
  Missed: ['Scheduled'],
  Cancelled: [],
};

export function assertTransition<S extends string>(
  from: S,
  to: S,
  allowed: Record<S, S[]>,
  entity: string,
): void {
  if (from === to) return;
  const next = allowed[from] ?? [];
  if (!next.includes(to)) {
    throw new Error(
      `Invalid ${entity} status transition: "${from}" → "${to}". Allowed from "${from}": [${next.join(', ') || 'none'}]`,
    );
  }
}