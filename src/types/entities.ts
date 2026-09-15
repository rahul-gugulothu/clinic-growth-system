// Entity types. Field names mirror
// docs/Clinic_Growth_System_V1_Implementation_Specification.md §8
// and docs/Clinic_Growth_System_V1_Data_Entities_and_Keys.md.

import type {
  AppointmentStatus,
  AuditOpportunity,
  ClinicStatus,
  FollowupStatus,
  LeadStatus,
  OutreachStage,
  Priority,
  ProposalStatus,
  ReviewStatus,
} from './status';

export type ID = string;

export type ISO = string;

export interface Prospect {
  prospect_id: ID;
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  phone: string;
  website: string;
  google_rating: number | null;
  review_count: number | null;
  instagram_url: string;
  booking_available: boolean;
  whatsapp_available: boolean;
  visible_advertising: string;
  content_quality: 'Low' | 'Medium' | 'High';
  obvious_problem: string;
  priority: Priority;
  source_urls: string[];
  research_date: ISO;
  notes: string;
  created_at: ISO;
  updated_at: ISO;
}

export interface ClinicAudit {
  audit_id: ID;
  prospect_id: ID | null;
  clinic_id: ID | null;
  audit_date: ISO;
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
  created_at: ISO;
}

export interface OutreachRecord {
  outreach_id: ID;
  prospect_id: ID;
  channel: 'Email' | 'Phone' | 'WhatsApp' | 'InPerson';
  contact_date: ISO;
  last_contact_at: ISO;
  next_action: string;
  next_action_at: ISO | null;
  owner: string;
  response: string;
  stage: OutreachStage;
  created_at: ISO;
  updated_at: ISO;
}

export interface Proposal {
  proposal_id: ID;
  prospect_id: ID;
  problem: string;
  proposed_service: string;
  expected_outcomes: string;
  price_inr: number;
  timeline: string;
  status: ProposalStatus;
  created_at: ISO;
  accepted_at: ISO | null;
}

export interface Clinic {
  clinic_id: ID;
  prospect_id: ID | null;
  name: string;
  specialty: string;
  address: string;
  city: string;
  phone: string;
  website: string;
  whatsapp_number: string;
  working_hours: string;
  status: ClinicStatus;
  created_at: ISO;
}

export interface Doctor {
  doctor_id: ID;
  clinic_id: ID;
  name: string;
  specialty: string;
  role: 'Owner' | 'Consultant' | 'Resident';
  status: 'Active' | 'Inactive';
}

export interface Staff {
  staff_id: ID;
  clinic_id: ID;
  name: string;
  role: 'Reception' | 'Coordinator' | 'Manager';
  email: string;
  phone: string;
  status: 'Active' | 'Inactive';
}

export interface Lead {
  lead_id: ID;
  clinic_id: ID;
  source: string;
  created_at: ISO;
  service_interested: string;
  status: LeadStatus;
  assigned_staff_id: ID | null;
  last_contact_at: ISO | null;
  next_action: string;
}

export interface Conversation {
  conversation_id: ID;
  lead_id: ID;
  channel: 'WhatsApp' | 'Phone' | 'Email' | 'InPerson';
  started_at: ISO;
  last_message_at: ISO;
  assigned_staff_id: ID | null;
  status: 'Open' | 'Closed';
}

export interface Message {
  message_id: ID;
  conversation_id: ID;
  sender: 'clinic' | 'lead' | 'system';
  body: string;
  sent_at: ISO;
}

export interface Appointment {
  appointment_id: ID;
  lead_id: ID;
  doctor_id: ID;
  scheduled_at: ISO;
  status: AppointmentStatus;
  reminder_status: 'Pending' | 'Sent' | 'Skipped';
  attended_at: ISO | null;
}

export interface Followup {
  followup_id: ID;
  lead_id: ID | null;
  appointment_id: ID | null;
  type: 'Reminder' | 'Recovery' | 'Reschedule' | 'Review Request';
  scheduled_at: ISO;
  channel: 'WhatsApp' | 'Phone' | 'Email';
  status: FollowupStatus;
  outcome: string;
}

export interface Review {
  review_id: ID;
  clinic_id: ID;
  appointment_id: ID | null;
  requested_at: ISO;
  status: ReviewStatus;
  rating: number | null;
  source: 'Google' | 'Practo' | 'Justdial' | 'Other';
}

export interface BusinessOutcome {
  outcome_id: ID;
  clinic_id: ID;
  appointment_id: ID | null;
  amount_inr: number;
  recorded_at: ISO;
  attribution_source: string;
  attribution_confidence: 'Low' | 'Medium' | 'High';
}

export interface Referral {
  referral_id: ID;
  clinic_id: ID;
  referring_lead_id: ID | null;
  referred_lead_id: ID | null;
  created_at: ISO;
  status: 'New' | 'Converted' | 'Lost';
  outcome: string;
}

export type Role = 'founder' | 'intern' | 'clinicOwner' | 'clinicStaff';
export type Workspace = 'internal' | 'clinic';

export interface Session {
  currentRole: Role;
  currentWorkspace: Workspace | null;
  activeClinicId: ID | null;
  email: string;
}