// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { newId } from '@/lib/ids';
import {
  type OutreachStage,
  type ProposalStatus,
  type AuditOpportunity,
  type ClinicStatus,
  type LeadStatus,
  type AppointmentStatus,
  type FollowupStatus,
  OUTREACH_STAGE_TRANSITIONS,
  PROPOSAL_TRANSITIONS,
  LEAD_TRANSITIONS,
  APPOINTMENT_TRANSITIONS,
  FOLLOWUP_TRANSITIONS,
  assertTransition,
} from '@/types/status';
import type {
  Appointment,
  BusinessOutcome,
  Clinic,
  ClinicAudit,
  Conversation,
  Doctor,
  Followup,
  ID,
  ISO,
  Lead,
  Message,
  Prospect,
  Proposal,
  Referral,
  Review,
  Role,
  Session,
  Staff,
  Workspace,
  OutreachRecord,
} from '@/types/entities';
import {
  seedAppointments,
  seedAudits,
  seedClinics,
  seedConversations,
  seedDoctors,
  seedFollowups,
  seedLeads,
  seedMessages,
  seedOutcomes,
  seedOutreach,
  seedProspects,
  seedProposals,
  seedReferrals,
  seedReviews,
  seedStaff,
} from '@/data/seed';

interface ClinicOnboardingInput {
  name: string;
  specialty: string;
  address: string;
  city: string;
  phone: string;
  website: string;
  whatsapp_number: string;
  working_hours: string;
  growth_goals: string;
  baseline_metrics: string;
  doctors: { name: string; specialty: string; role: Doctor['role'] }[];
  staff: { name: string; role: Staff['role']; email: string; phone: string }[];
}

interface LeadCreateInput {
  clinic_id: ID;
  source: string;
  service_interested: string;
  assigned_staff_id: ID | null;
  next_action: string;
}

interface ConversationCreateInput {
  lead_id: ID;
  channel: Conversation['channel'];
  assigned_staff_id: ID | null;
}

interface MessageCreateInput {
  conversation_id: ID;
  sender: Message['sender'];
  body: string;
}

interface AppointmentCreateInput {
  lead_id: ID;
  doctor_id: ID;
  scheduled_at: ISO;
}

interface FollowupCreateInput {
  lead_id: ID | null;
  appointment_id: ID | null;
  type: Followup['type'];
  scheduled_at: ISO;
  channel: Followup['channel'];
}

interface OutreachCreateInput {
  prospect_id: ID;
  channel: OutreachRecord['channel'];
  next_action: string;
  next_action_at: ISO | null;
  owner: string;
}

interface ProposalCreateInput {
  prospect_id: ID;
  problem: string;
  proposed_service: string;
  expected_outcomes: string;
  price_inr: number;
  timeline: string;
}

interface AuditCreateInput {
  prospect_id: ID;
  discovery: string;
  google_presence: string;
  website: string;
  reviews: string;
  enquiry_process: string;
  whatsapp: string;
  booking: string;
  follow_up: string;
  content: string;
  competitors: string;
  identified_problems: string;
  recommendations: string;
  overall_opportunity: AuditOpportunity;
}

interface State {
  session: Session;
  prospects: Record<ID, Prospect>;
  audits: Record<ID, ClinicAudit>;
  outreach: Record<ID, OutreachRecord>;
  proposals: Record<ID, Proposal>;
  clinics: Record<ID, Clinic>;
  doctors: Record<ID, Doctor>;
  staff: Record<ID, Staff>;
  leads: Record<ID, Lead>;
  conversations: Record<ID, Conversation>;
  messages: Record<ID, Message>;
  appointments: Record<ID, Appointment>;
  followups: Record<ID, Followup>;
  reviews: Record<ID, Review>;
  outcomes: Record<ID, BusinessOutcome>;
  referrals: Record<ID, Referral>;
}

interface Actions {
  // session
  login: (email: string, role: Role) => void;
  logout: () => void;
  setWorkspace: (ws: Workspace) => void;
  setActiveClinic: (clinicId: ID | null) => void;
  resetDemo: () => void;

  // prospects
  addProspect: (p: Omit<Prospect, 'prospect_id' | 'created_at' | 'updated_at'>) => ID;
  updateProspect: (id: ID, patch: Partial<Prospect>) => void;
  setProspectPriority: (id: ID, priority: Prospect['priority']) => void;

  // audits
  createAudit: (input: AuditCreateInput) => ID;
  updateAudit: (id: ID, patch: Partial<ClinicAudit>) => void;

  // outreach
  recordOutreach: (input: OutreachCreateInput) => ID;
  updateOutreach: (id: ID, patch: Partial<OutreachRecord>) => void;
  setOutreachStage: (id: ID, stage: OutreachStage) => void;

  // proposals
  createProposal: (input: ProposalCreateInput) => ID;
  updateProposal: (id: ID, patch: Partial<Proposal>) => void;
  setProposalStatus: (id: ID, status: ProposalStatus) => void;

  // onboarding
  onboardClinicFromProspect: (prospect_id: ID, input: ClinicOnboardingInput) => ID;

  // reviews
  addReview: (input: { clinic_id: ID; appointment_id: ID | null; source?: Review['source'] }) => ID;
  updateReview: (id: ID, patch: Partial<Review>) => void;

  // outcomes
  addOutcome: (input: { clinic_id: ID; appointment_id: ID | null; amount_inr: number; attribution_source: string; attribution_confidence: BusinessOutcome['attribution_confidence'] }) => ID;
  updateOutcome: (id: ID, patch: Partial<BusinessOutcome>) => void;

  // referrals
  addReferral: (input: { clinic_id: ID; referring_lead_id: ID | null; referred_lead_id: ID | null; status?: Referral['status'] }) => ID;
  updateReferral: (id: ID, patch: Partial<Referral>) => void;

  // clinic-side
  addLead: (input: LeadCreateInput) => ID;
  updateLead: (id: ID, patch: Partial<Lead>) => void;
  setLeadStatus: (id: ID, status: LeadStatus) => void;
  addConversation: (input: ConversationCreateInput) => ID;
  addMessage: (input: MessageCreateInput) => ID;
  addAppointment: (input: AppointmentCreateInput) => ID;
  updateAppointment: (id: ID, patch: Partial<Appointment>) => void;
  setAppointmentStatus: (id: ID, status: AppointmentStatus) => void;
  addFollowup: (input: FollowupCreateInput) => ID;
  updateFollowup: (id: ID, patch: Partial<Followup>) => void;
  setFollowupStatus: (id: ID, status: FollowupStatus) => void;
  updateClinic: (id: ID, patch: Partial<Clinic>) => void;
  updateDoctor: (id: ID, patch: Partial<Doctor>) => void;
  updateStaff: (id: ID, patch: Partial<Staff>) => void;
}

const nowIso = () => new Date().toISOString();

const keyBy = <T>(items: T[], keyFn: (item: T) => string): Record<string, T> =>
  Object.fromEntries(items.map((item) => [keyFn(item), item]));

const initialSession: Session = {
  currentRole: 'founder',
  currentWorkspace: null,
  activeClinicId: null,
  email: '',
};

const initialState: State = {
  session: initialSession,
  prospects: keyBy(seedProspects, (p) => p.prospect_id),
  audits: keyBy(seedAudits, (a) => a.audit_id),
  outreach: keyBy(seedOutreach, (o) => o.outreach_id),
  proposals: keyBy(seedProposals, (p) => p.proposal_id),
  clinics: keyBy(seedClinics, (c) => c.clinic_id),
  doctors: keyBy(seedDoctors, (d) => d.doctor_id),
  staff: keyBy(seedStaff, (s) => s.staff_id),
  leads: keyBy(seedLeads, (l) => l.lead_id),
  conversations: keyBy(seedConversations, (c) => c.conversation_id),
  messages: keyBy(seedMessages, (m) => m.message_id),
  appointments: keyBy(seedAppointments, (a) => a.appointment_id),
  followups: keyBy(seedFollowups, (f) => f.followup_id),
  reviews: keyBy(seedReviews, (r) => r.review_id),
  outcomes: keyBy(seedOutcomes, (o) => o.outcome_id),
  referrals: keyBy(seedReferrals, (r) => r.referral_id),
};

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: (email, role) =>
        set((s) => ({ session: { ...s.session, email, currentRole: role, activeClinicId: s.session.activeClinicId } })),

      logout: () =>
        set(() => ({
          session: initialSession,
        })),

      setWorkspace: (ws) =>
        set((s) => ({ session: { ...s.session, currentWorkspace: ws } })),

      setActiveClinic: (clinicId) =>
        set((s) => ({ session: { ...s.session, activeClinicId: clinicId } })),

      resetDemo: () => set(() => ({ ...initialState, session: initialSession })),

      addProspect: (p) => {
        const id = newId('pro');
        const ts = nowIso();
        set((s) => ({
          prospects: {
            ...s.prospects,
            [id]: { ...p, prospect_id: id, created_at: ts, updated_at: ts },
          },
        }));
        return id;
      },

      updateProspect: (id, patch) =>
        set((s) => {
          const cur = s.prospects[id];
          if (!cur) return {};
          return {
            prospects: { ...s.prospects, [id]: { ...cur, ...patch, updated_at: nowIso() } },
          };
        }),

      setProspectPriority: (id, priority) =>
        get().updateProspect(id, { priority }),

      createAudit: (input) => {
        const id = newId('aud');
        const audit: ClinicAudit = {
          audit_id: id,
          prospect_id: input.prospect_id,
          clinic_id: null,
          audit_date: nowIso(),
          discovery: input.discovery,
          google_presence: input.google_presence,
          website: input.website,
          reviews: input.reviews,
          enquiry_process: input.enquiry_process,
          whatsapp: input.whatsapp,
          booking: input.booking,
          follow_up: input.follow_up,
          content: input.content,
          competitors: input.competitors,
          identified_problems: input.identified_problems,
          recommendations: input.recommendations,
          overall_opportunity: input.overall_opportunity,
          created_at: nowIso(),
        };
        set((s) => ({ audits: { ...s.audits, [id]: audit } }));
        return id;
      },

      updateAudit: (id, patch) =>
        set((s) => {
          const cur = s.audits[id];
          if (!cur) return {};
          return { audits: { ...s.audits, [id]: { ...cur, ...patch } } };
        }),

      recordOutreach: (input) => {
        const id = newId('out');
        const ts = nowIso();
        const rec: OutreachRecord = {
          outreach_id: id,
          prospect_id: input.prospect_id,
          channel: input.channel,
          contact_date: ts,
          last_contact_at: ts,
          next_action: input.next_action,
          next_action_at: input.next_action_at,
          owner: input.owner,
          response: '',
          stage: 'Not contacted',
          created_at: ts,
          updated_at: ts,
        };
        set((s) => ({ outreach: { ...s.outreach, [id]: rec } }));
        return id;
      },

      updateOutreach: (id, patch) =>
        set((s) => {
          const cur = s.outreach[id];
          if (!cur) return {};
          return {
            outreach: {
              ...s.outreach,
              [id]: { ...cur, ...patch, updated_at: nowIso() },
            },
          };
        }),

      setOutreachStage: (id, stage) => {
        const cur = get().outreach[id];
        if (!cur) return;
        assertTransition(cur.stage, stage, OUTREACH_STAGE_TRANSITIONS, 'outreach');
        get().updateOutreach(id, { stage });
      },

      createProposal: (input) => {
        const id = newId('prop');
        const prop: Proposal = {
          proposal_id: id,
          prospect_id: input.prospect_id,
          problem: input.problem,
          proposed_service: input.proposed_service,
          expected_outcomes: input.expected_outcomes,
          price_inr: input.price_inr,
          timeline: input.timeline,
          status: 'Draft',
          created_at: nowIso(),
          accepted_at: null,
        };
        set((s) => ({ proposals: { ...s.proposals, [id]: prop } }));
        return id;
      },

      updateProposal: (id, patch) =>
        set((s) => {
          const cur = s.proposals[id];
          if (!cur) return {};
          return { proposals: { ...s.proposals, [id]: { ...cur, ...patch } } };
        }),

      setProposalStatus: (id, status) => {
        const cur = get().proposals[id];
        if (!cur) return;
        assertTransition(cur.status, status, PROPOSAL_TRANSITIONS, 'proposal');
        const patch: Partial<Proposal> = { status };
        if (status === 'Accepted') patch.accepted_at = nowIso();
        set((s) => {
          const c = s.proposals[id];
          if (!c) return {};
          return { proposals: { ...s.proposals, [id]: { ...c, ...patch } } };
        });
      },

      onboardClinicFromProspect: (prospect_id: ID, input: ClinicOnboardingInput) => {
        const prospect = get().prospects[prospect_id];
        if (!prospect) throw new Error(`Prospect ${prospect_id} not found`);

        const existing = Object.values(get().clinics).find((c) => c.prospect_id === prospect_id);
        if (existing) {
          throw new Error(`Clinic already exists for this prospect (${existing.clinic_id})`);
        }

        const clinic_id = newId('cln');
        const ts = nowIso();
        const clinic: Clinic = {
          clinic_id,
          prospect_id,
          name: input.name || prospect.clinic_name,
          specialty: input.specialty || prospect.specialty,
          address: input.address,
          city: input.city,
          phone: input.phone || prospect.phone,
          website: input.website || prospect.website,
          whatsapp_number: input.whatsapp_number || prospect.phone,
          working_hours: input.working_hours,
          status: 'Active' as ClinicStatus,
          created_at: ts,
        };

        const doctors: Doctor[] = input.doctors.map((d: { name: string; specialty: string; role: Doctor['role'] }) => ({
          doctor_id: newId('doc'),
          clinic_id,
          name: d.name,
          specialty: d.specialty,
          role: d.role,
          status: 'Active',
        }));

        const staff: Staff[] = input.staff.map((s2: { name: string; role: Staff['role']; email: string; phone: string }) => ({
          staff_id: newId('stf'),
          clinic_id,
          name: s2.name,
          role: s2.role,
          email: s2.email,
          phone: s2.phone,
          status: 'Active',
        }));

        set((s) => ({
          clinics: { ...s.clinics, [clinic_id]: clinic },
          doctors: { ...s.doctors, ...Object.fromEntries(doctors.map((d) => [d.doctor_id, d])) },
          staff: { ...s.staff, ...Object.fromEntries(staff.map((st) => [st.staff_id, st])) },
          prospects: {
            ...s.prospects,
            [prospect_id]: { ...prospect, updated_at: ts },
          },
          session: { ...s.session, activeClinicId: clinic_id },
        }));
        return clinic_id;
      },

      // --- clinic-side ---

      addLead: (input) => {
        const id = newId('lead');
        const ts = nowIso();
        const lead: Lead = {
          lead_id: id,
          clinic_id: input.clinic_id,
          source: input.source,
          created_at: ts,
          service_interested: input.service_interested,
          status: 'New',
          assigned_staff_id: input.assigned_staff_id,
          last_contact_at: null,
          next_action: input.next_action,
        };
        set((s) => ({ leads: { ...s.leads, [id]: lead } }));
        return id;
      },

      updateLead: (id, patch) =>
        set((s) => {
          const cur = s.leads[id];
          if (!cur) return {};
          return { leads: { ...s.leads, [id]: { ...cur, ...patch } } };
        }),

      setLeadStatus: (id, status) => {
        const cur = get().leads[id];
        if (!cur) return;
        assertTransition(cur.status, status, LEAD_TRANSITIONS, 'lead');
        get().updateLead(id, { status });
      },

      addConversation: (input) => {
        const id = newId('conv');
        const ts = nowIso();
        const conv: Conversation = {
          conversation_id: id,
          lead_id: input.lead_id,
          channel: input.channel,
          started_at: ts,
          last_message_at: ts,
          assigned_staff_id: input.assigned_staff_id,
          status: 'Open',
        };
        set((s) => ({ conversations: { ...s.conversations, [id]: conv } }));
        return id;
      },

      addMessage: (input) => {
        const id = newId('msg');
        const ts = nowIso();
        const msg: Message = {
          message_id: id,
          conversation_id: input.conversation_id,
          sender: input.sender,
          body: input.body,
          sent_at: ts,
        };
        set((s) => ({
          messages: { ...s.messages, [id]: msg },
          conversations: {
            ...s.conversations,
            [input.conversation_id]: {
              ...s.conversations[input.conversation_id],
              last_message_at: ts,
            },
          },
        }));
        return id;
      },

      addAppointment: (input) => {
        const id = newId('apt');
        const apt: Appointment = {
          appointment_id: id,
          lead_id: input.lead_id,
          doctor_id: input.doctor_id,
          scheduled_at: input.scheduled_at,
          status: 'Booked',
          reminder_status: 'Pending',
          attended_at: null,
        };
        set((s) => ({
          appointments: { ...s.appointments, [id]: apt },
          leads: {
            ...s.leads,
            [input.lead_id]: { ...s.leads[input.lead_id], status: 'Booked' },
          },
        }));
        return id;
      },

      updateAppointment: (id, patch) =>
        set((s) => {
          const cur = s.appointments[id];
          if (!cur) return {};
          return { appointments: { ...s.appointments, [id]: { ...cur, ...patch } } };
        }),

      setAppointmentStatus: (id, status) => {
        const cur = get().appointments[id];
        if (!cur) return;
        assertTransition(cur.status, status, APPOINTMENT_TRANSITIONS, 'appointment');
        const patch: Partial<Appointment> = { status };
        if (status === 'Attended') patch.attended_at = nowIso();
        get().updateAppointment(id, patch);
      },

      addFollowup: (input) => {
        const id = newId('fu');
        const fu: Followup = {
          followup_id: id,
          lead_id: input.lead_id,
          appointment_id: input.appointment_id,
          type: input.type,
          scheduled_at: input.scheduled_at,
          channel: input.channel,
          status: 'Scheduled',
          outcome: '',
        };
        set((s) => ({ followups: { ...s.followups, [id]: fu } }));
        return id;
      },

      updateFollowup: (id, patch) =>
        set((s) => {
          const cur = s.followups[id];
          if (!cur) return {};
          return { followups: { ...s.followups, [id]: { ...cur, ...patch } } };
        }),

      setFollowupStatus: (id, status) => {
        const cur = get().followups[id];
        if (!cur) return;
        assertTransition(cur.status, status, FOLLOWUP_TRANSITIONS, 'followup');
        get().updateFollowup(id, { status });
      },

      addReview: (input) => {
        const id = newId('rev');
        const review: Review = {
          review_id: id,
          clinic_id: input.clinic_id,
          appointment_id: input.appointment_id,
          requested_at: nowIso(),
          status: 'Requested',
          rating: null,
          source: input.source ?? 'Google',
        };
        set((s) => ({ reviews: { ...s.reviews, [id]: review } }));
        return id;
      },

      updateReview: (id, patch) =>
        set((s) => {
          const cur = s.reviews[id];
          if (!cur) return {};
          return { reviews: { ...s.reviews, [id]: { ...cur, ...patch } } };
        }),

      addOutcome: (input) => {
        const id = newId('outc');
        const ts = nowIso();
        const outcome: BusinessOutcome = {
          outcome_id: id,
          clinic_id: input.clinic_id,
          appointment_id: input.appointment_id,
          amount_inr: input.amount_inr,
          recorded_at: ts,
          attribution_source: input.attribution_source,
          attribution_confidence: input.attribution_confidence,
        };
        set((s) => ({ outcomes: { ...s.outcomes, [id]: outcome } }));
        return id;
      },

      updateOutcome: (id, patch) =>
        set((s) => {
          const cur = s.outcomes[id];
          if (!cur) return {};
          return { outcomes: { ...s.outcomes, [id]: { ...cur, ...patch } } };
        }),

      addReferral: (input) => {
        const id = newId('ref');
        const ts = nowIso();
        const referral: Referral = {
          referral_id: id,
          clinic_id: input.clinic_id,
          referring_lead_id: input.referring_lead_id,
          referred_lead_id: input.referred_lead_id,
          created_at: ts,
          status: input.status ?? 'New',
          outcome: '',
        };
        set((s) => ({ referrals: { ...s.referrals, [id]: referral } }));
        return id;
      },

      updateReferral: (id, patch) =>
        set((s) => {
          const cur = s.referrals[id];
          if (!cur) return {};
          return { referrals: { ...s.referrals, [id]: { ...cur, ...patch } } };
        }),

      updateClinic: (id, patch) =>
        set((s) => {
          const cur = s.clinics[id];
          if (!cur) return {};
          return { clinics: { ...s.clinics, [id]: { ...cur, ...patch } } };
        }),

      updateDoctor: (id, patch) =>
        set((s) => {
          const cur = s.doctors[id];
          if (!cur) return {};
          return { doctors: { ...s.doctors, [id]: { ...cur, ...patch } } };
        }),

      updateStaff: (id, patch) =>
        set((s) => {
          const cur = s.staff[id];
          if (!cur) return {};
          return { staff: { ...s.staff, [id]: { ...cur, ...patch } } };
        }),
    }),
    {
      name: 'clinic-growth-system:v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { session: _session, ...rest } = s;
        return rest;
      },
      merge: (persistedState: unknown, currentState: any) => {
        const persisted = persistedState as any;
        const merged = { ...currentState };
        for (const key of Object.keys(persisted)) {
          if (key === 'session') continue;
          const pVal = persisted[key];
          const cVal = currentState[key];
          if (cVal && typeof cVal === 'object' && !Array.isArray(cVal) && pVal && typeof pVal === 'object' && !Array.isArray(pVal)) {
            merged[key] = { ...cVal, ...pVal };
          } else {
            merged[key] = pVal;
          }
        }
        return merged;
      },
    }),
  )
;

// Selectors -------------------------------------------------------------

export const selectAllProspects = (s: State) =>
  Object.values(s.prospects).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

export const selectProspectById = (id: ID) => (s: State) => s.prospects[id];

export const selectAuditsByProspect = (id: ID) => (s: State) =>
  Object.values(s.audits)
    .filter((a) => a.prospect_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

export const selectAllAudits = (s: State) =>
  Object.values(s.audits).sort((a, b) => b.created_at.localeCompare(a.created_at));

export const selectOutreachByProspect = (id: ID) => (s: State) =>
  Object.values(s.outreach)
    .filter((o) => o.prospect_id === id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

export const selectAllOutreach = (s: State) =>
  Object.values(s.outreach).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

export const selectProposalsByProspect = (id: ID) => (s: State) =>
  Object.values(s.proposals).filter((p) => p.prospect_id === id);

export const selectAllProposals = (s: State) =>
  Object.values(s.proposals).sort((a, b) => b.created_at.localeCompare(a.created_at));

export const selectClinics = (s: State) => Object.values(s.clinics);

export const selectPipelineCounts = (s: State) => {
  const prospects = Object.values(s.prospects).length;
  const audits = Object.values(s.audits).length;
  const contacted = Object.values(s.outreach).filter((o) =>
    ['Contacted', 'Responded', 'Follow-up due', 'Call', 'Proposal', 'Won', 'Lost'].includes(
      o.stage,
    ),
  ).length;
  const calls = Object.values(s.outreach).filter((o) =>
    ['Call', 'Proposal', 'Won'].includes(o.stage),
  ).length;
  const proposals = Object.values(s.proposals).filter((p) =>
    ['Sent', 'Accepted'].includes(p.status),
  ).length;
  const won = Object.values(s.proposals).filter((p) => p.status === 'Accepted').length;
  const clientsOnboarded = Object.values(s.clinics).length;
  const pipelineValue = Object.values(s.proposals)
    .filter((p) => p.status !== 'Lost')
    .reduce((sum, p) => sum + p.price_inr, 0);
  return { prospects, audits, contacted, calls, proposals, won, clientsOnboarded, pipelineValue };
};

// clinic-side selectors --------------------------------------------------

export const selectLeadsByClinic = (clinicId: ID) => (s: State) =>
  Object.values(s.leads)
    .filter((l) => l.clinic_id === clinicId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

export const selectLeadById = (id: ID) => (s: State) => s.leads[id];

export const selectConversationsByLead = (leadId: ID) => (s: State) =>
  Object.values(s.conversations)
    .filter((c) => c.lead_id === leadId)
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));

export const selectMessagesByConversation = (conversationId: ID) => (s: State) =>
  Object.values(s.messages)
    .filter((m) => m.conversation_id === conversationId)
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));

export const selectAppointmentsByLead = (leadId: ID) => (s: State) =>
  Object.values(s.appointments)
    .filter((a) => a.lead_id === leadId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

export const selectAppointmentsByClinic = (clinicId: ID) => (s: State) => {
  const leadIds = new Set(Object.values(s.leads).filter((l) => l.clinic_id === clinicId).map((l) => l.lead_id));
  return Object.values(s.appointments)
    .filter((a) => leadIds.has(a.lead_id))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
};

export const selectFollowupsByLead = (leadId: ID) => (s: State) =>
  Object.values(s.followups)
    .filter((f) => f.lead_id === leadId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

export const selectFollowupsByAppointment = (appointmentId: ID) => (s: State) =>
  Object.values(s.followups)
    .filter((f) => f.appointment_id === appointmentId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

export const selectStaffById = (id: ID) => (s: State) => s.staff[id];

export const selectDoctorById = (id: ID) => (s: State) => s.doctors[id];

export const selectClinicById = (id: ID) => (s: State) => s.clinics[id];

export const selectDoctorsByClinic = (clinicId: ID) => (s: State) =>
  Object.values(s.doctors).filter((d) => d.clinic_id === clinicId);

export const selectStaffByClinic = (clinicId: ID) => (s: State) =>
  Object.values(s.staff).filter((st) => st.clinic_id === clinicId);

export const selectClinicForLead = (leadId: ID) => (s: State) => {
  const lead = s.leads[leadId];
  if (!lead) return undefined;
  return s.clinics[lead.clinic_id];
};

export const selectReviewsByAppointment = (appointmentId: ID) => (s: State) =>
  Object.values(s.reviews).filter((r) => r.appointment_id === appointmentId);

export const selectReviewsByClinic = (clinicId: ID) => (s: State) =>
  Object.values(s.reviews).filter((r) => r.clinic_id === clinicId);

export const selectOutcomesByClinic = (clinicId: ID) => (s: State) =>
  Object.values(s.outcomes).filter((o) => o.clinic_id === clinicId);

export const selectOutcomesByAppointment = (appointmentId: ID) => (s: State) =>
  Object.values(s.outcomes).filter((o) => o.appointment_id === appointmentId);

export const selectReferralsByClinic = (clinicId: ID) => (s: State) =>
  Object.values(s.referrals).filter((r) => r.clinic_id === clinicId);