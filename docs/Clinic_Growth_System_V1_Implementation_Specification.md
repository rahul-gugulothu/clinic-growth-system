# Clinic Growth System — V1 Implementation Specification

*From Product Blueprint to Prototype Build*

**Status:** Build-ready planning document • V1 scope • September 2026

---

## 1. Purpose

This document converts the Clinic Growth System product planning work into an implementation-ready blueprint. It is intentionally narrower than the long-term vision: V1 demonstrates the core clinic-growth workflow without attempting to build a full practice-management or medical-record system.

The source PDF describes a validation-first model: research the market, audit clinics, approach prospects, secure 1–2 paying pilots, measure outcomes, and only then productize the repeatable workflow. The prototype therefore focuses on the workflow that can eventually become the software product.

## 2. V1 Product Goal

Demonstrate a complete, understandable journey from clinic prospecting and onboarding through patient enquiry handling, appointment management, follow-up, outcome tracking, and growth reporting.

| Journey | Target outcome |
|---|---|
| Internal team | Prospect → Audit → Outreach → Proposal → Onboarding |
| Clinic team | Lead → Conversation → Qualification → Appointment → Follow-up → Outcome |
| Business measurement | Enquiry → Booking → Attendance → Review/Retention → Revenue (when reliably attributable) |

## 3. Product Boundaries

| Build in V1 | Do not build in V1 |
|---|---|
| Clinic onboarding | Electronic Health Record (EHR) |
| Prospects + clinic research | Medical diagnosis or treatment advice |
| Clinic audit | Billing/accounting system |
| Leads and conversations | Deep Practice Management System (PMS) integrations |
| Appointments + reminders | Predictive AI / complex autonomous agents |
| Follow-ups | Large marketing campaign engine |
| Basic reviews | Full reputation-management platform |
| Basic analytics | Advanced revenue forecasting |

## 4. Workspaces

### 4.1 Internal Growth Workspace

Purpose: acquire and onboard the right clinics.

Navigation: Dashboard • Prospects • Audits • Outreach • Sales/Proposals • Reports • Settings

### 4.2 Clinic Workspace

Purpose: manage the clinic's enquiry-to-appointment journey and measure results.

Navigation: Dashboard • Leads • Conversations • Appointments • Follow-ups • Reviews • Analytics • Settings

## 5. Implementation Order

| Phase | Build | Output |
|---|---|---|
| Phase 1 | Application shell | Login, workspace selection, navigation, layout, shared components. |
| Phase 2 | Internal golden path | Prospects → Profile → Audit → Outreach → Proposal → Onboarding. |
| Phase 3 | Clinic golden path | Lead → Conversation → Qualification → Appointment → Follow-up → Outcome. |
| Phase 4 | Dashboard & analytics | Derive KPI cards and funnel numbers from workflow data. |
| Phase 5 | Supporting growth | Reviews, no-show recovery, lightweight referral/retention placeholders. |
| Phase 6 | AI assistance | AI suggestions for qualification and follow-up; human approval first. |
| Phase 7 | Real integrations | WhatsApp Business, calendar, Google Business Profile, PMS—after core flow is proven. |

## 6. Screen-by-Screen Specification

| Screen | Purpose | Primary content | Key interactions |
|---|---|---|---|
| Login | Authenticate a user. | Email/password fields; validation; demo login. | Navigate to workspace based on role. |
| Workspace Selection | Choose Internal or Clinic workspace. | Workspace cards; current role. | Open the selected workspace dashboard. |
| Internal Dashboard | See prospect/sales pipeline. | Prospects researched, audits, outreach, calls, proposals, clients, pipeline value. | Cards link to filtered modules. |
| Prospects | Manage researched clinics. | Table with clinic, doctor, area, website, rating/reviews, booking, WhatsApp, content score, problem, priority, status. | Open prospect, audit, outreach, change priority. |
| Prospect Profile | Review one clinic before outreach. | Basic facts, digital presence, evidence/notes, audit history, outreach status. | Create audit, add note, start outreach. |
| Clinic Audit | Record structured diagnosis. | Discovery, website, reviews, enquiry, WhatsApp, booking, follow-up, content, competitors, recommendations. | Save audit and set opportunity level. |
| Outreach | Track contact activity. | Channel, last contact, next follow-up, stage, owner, notes. | Record contact; schedule follow-up; move stage. |
| Proposal | Represent the handoff from sales to onboarding. | Scope, expected outcomes, pricing placeholder, timeline, status. | Send/mark accepted; convert to clinic. |
| Clinic Onboarding | Create the clinic workspace. | Clinic details, doctors, staff, services, hours, communication config. | Create clinic and initial baseline. |
| Clinic Dashboard | Show current growth performance. | Enquiries, qualified, booked, attended, no-shows, booking rate, response time, revenue where reliable. | Click metrics to open underlying records. |
| Leads | Manage enquiries. | Lead ID, source, service, status, assignee, last contact, next action. | Open lead, assign, qualify, schedule follow-up. |
| Lead Detail | Work one lead. | Summary, status, source, conversation timeline, next action. | Reply, qualify, book, schedule follow-up, mark lost. |
| Conversations | Central enquiry inbox. | Conversation list + message timeline + lead context. | Reply, assign, qualify, schedule, book. |
| Appointments | Manage bookings and outcomes. | Calendar/list, doctor, time, status, reminder status. | Book, reschedule, mark attended/no-show/cancelled. |
| Follow-ups | Work queue for pending actions. | Due today, upcoming, completed, missed; trigger, channel, due time. | Send/complete/reschedule and record outcome. |
| Reviews | Track lightweight reputation workflow. | Requests, pending, received, average rating. | Create request after attended outcome; record result. |
| Analytics | Explain funnel performance. | Leads by source, qualified-to-booked, attendance, no-show, response time, simple trends. | Drill down to underlying records. |
| Settings | Configure workspace. | Clinic profile, doctors, staff, services, hours, communication preferences. | Edit configuration. |

## 7. Golden Path Specifications

### 7.1 Internal: Prospect → Clinic

1. Open Prospects and select a clinic.
2. Review verified public research and evidence notes.
3. Open the Clinic Audit and record findings.
4. Set priority based on evidence and commercial fit.
5. Create an outreach record.
6. Record response/call/proposal stages.
7. When won, convert the Prospect to a Clinic without losing research/audit history.
8. Complete onboarding and create the clinic workspace.

### 7.2 Clinic: Lead → Appointment

1. A new lead is created with source and service of interest.
2. Open the lead and view the conversation.
3. Staff or AI-assisted workflow qualifies the lead.
4. Select a doctor and time slot.
5. Create the appointment.
6. Create the appropriate reminder/follow-up record.
7. Reflect the change in the lead status and appointment calendar.

### 7.3 Clinic: Appointment → Outcome

1. Appointment remains Booked until staff records an outcome.
2. Attended leads to review/next-step workflow.
3. No-show creates a recovery follow-up.
4. Cancelled can create a rescheduling follow-up.
5. Outcome/revenue is recorded only when the data is authorized and attribution is sufficiently reliable.
6. Dashboard KPI values update from the underlying records.

## 8. V1 Data Model (Implementation View)

| Entity | Purpose | Primary key | Core fields |
|---|---|---|---|
| Prospect | Prospect record for a potential clinic. | prospect_id | clinic_name, doctor_name, specialty, area, phone, website, Google rating/reviews, Instagram, booking, WhatsApp, visible advertising, content quality, obvious problem, priority, source URLs, research date, notes |
| Clinic Audit | Structured assessment of a prospect/customer clinic. | audit_id | prospect_id or clinic_id, audit_date, discovery, website, reviews, enquiry, WhatsApp, booking, follow-up, content, competitors, problems, recommendations, opportunity |
| Clinic | Active customer organization. | clinic_id | name, specialty, address, city, phone, website, WhatsApp, hours, status |
| Doctor | Doctor associated with a clinic. | doctor_id | clinic_id, name, specialty, role, status |
| Staff | Clinic/internal user who operates the workflow. | staff_id | clinic_id, name, role, email, phone, status |
| Lead | Potential patient enquiry. | lead_id | clinic_id, source, created_at, service_interested, status, assigned_staff_id, last_contact_at, next_action |
| Conversation | Communication thread linked to a lead. | conversation_id | lead_id, channel, started_at, last_message_at, assigned_staff_id, status |
| Appointment | Scheduled visit and outcome. | appointment_id | lead_id, doctor_id, scheduled_at, status, reminder_status, attended_at |
| Follow-up | Scheduled or completed action. | followup_id | lead_id, appointment_id, type, scheduled_at, channel, status, outcome |
| Review | Review-request / review event. | review_id | clinic_id, appointment_id, requested_at, status, rating, source |
| Referral | Referral from an existing lead/patient to a new lead. | referral_id | clinic_id, referring_person_id, referred_lead_id, created_at, status, outcome |
| Business Outcome | Revenue/outcome record where attribution is reliable. | outcome_id | clinic_id, appointment_id, amount, recorded_at, attribution_source, attribution_confidence |

## 9. Data Rules

- Public clinic research and private clinic operational data are separate concepts.
- Do not use real patient medical records for the prototype unless authorized and necessary.
- Prefer minimum necessary patient/lead data for the growth workflow.
- Do not treat ratings from different platforms as the same metric.
- Unknown/unverified fields must remain explicitly unknown rather than guessed.
- Every research record should preserve source URL(s) and research date.
- Observed facts and inferred growth problems must be distinguishable.
- Revenue attribution should carry a confidence indicator when used.

## 10. Prototype Demo Data Requirements

| Data set | Minimum demo volume | Purpose |
|---|---|---|
| Clinic | 1 | Populate clinic workspace and dashboard. |
| Doctors | 2 | Appointments and doctor assignment. |
| Staff | 3 | Roles/assignment examples. |
| Leads | 8 | Show multiple pipeline states. |
| Conversations | At least 4 | Demonstrate enquiry handling. |
| Appointments | 5 | Show booked, attended, no-show, cancelled cases. |
| Follow-ups | 5 | Show due/upcoming/completed actions. |
| Reviews | 3 | Demonstrate request/received states. |
| Business outcomes | 3 | Demonstrate simple attribution. |
| Prospects | 5 | Demonstrate internal prospecting and conversion. |

## 11. AI in V1

AI is an assistance layer in V1, not a fully autonomous clinic operator. This is a deliberate design choice: the product should first make the workflow deterministic and auditable.

| AI capability | V1 behavior | Human control |
|---|---|---|
| Lead qualification | Suggest status/qualification from conversation context. | Staff confirms. |
| Reply drafting | Generate suggested response. | Staff approves/sends. |
| Follow-up suggestion | Suggest next action and timing. | Staff confirms. |
| No-show recovery | Suggest recovery message. | Staff approves. |
| Insights | Summarize funnel bottlenecks. | Human decides action. |

## 12. UI / UX Quality Bar

- Clean B2B SaaS interface with simple hierarchy.
- Desktop-first for clinic staff, responsive enough for smaller screens.
- Clear status chips and action buttons.
- Tables for research/operational lists; cards only for high-level metrics.
- Empty, loading, success and error states must exist for major workflows.
- Every key action should give visible confirmation.
- Do not show fake integrations as if they are live.
- Use realistic but synthetic operational records in the prototype.

## 13. Acceptance Criteria

- User can reach either Internal or Clinic workspace after login.
- Internal team can open a Prospect, view research, create an Audit, record Outreach, and convert the Prospect to a Clinic.
- Clinic can open a Lead, view its Conversation, qualify it, and create an Appointment.
- Appointment statuses can change to Attended, No-show, or Cancelled.
- No-show creates a visible Follow-up item.
- Attended appointment can create a Review request.
- Dashboard metrics are derived from the underlying demo records rather than hard-coded text.
- All primary navigation links work.
- Major workflows preserve identifiers and relationships when moving between screens.
- Prototype clearly distinguishes demo/synthetic data from real integrations.

## 14. Implementation Notes for Developers

- The implementation prompt should tell the builder to infer UI from this specification, not to recreate the PDF's document layout. The PDF is the business source; this document is the translated product specification.
- Build shared layout/components first.
- Implement the three golden paths before polishing secondary screens.
- Use one source of demo data so updates propagate to lists, details, calendars and analytics.
- Keep research/prospect data separate from clinic operational data.
- Use realistic states so every screen demonstrates a meaningful case.
- Prefer deterministic workflows first; add AI assistance after the basic state transitions work.

## 15. Build Checklist

- ☐ Application shell complete
- ☐ Internal workspace navigable
- ☐ Clinic workspace navigable
- ☐ Prospect → Audit → Outreach → Clinic flow works
- ☐ Lead → Conversation → Appointment flow works
- ☐ No-show → Follow-up flow works
- ☐ Attended → Review request flow works
- ☐ Dashboard values update from demo data
- ☐ Research/audit evidence fields visible
- ☐ AI assistance placeholders ready
- ☐ Prototype QA completed

## 16. Decision Log

| Decision | Rationale |
|---|---|
| Prototype before production integrations | Reduces complexity and lets us validate the workflow first. |
| Research workspace + Clinic workspace | The PDF describes both internal acquisition operations and the clinic-side growth journey. |
| No full medical record | The PDF emphasizes data minimization and the commercial growth journey. |
| AI assistance before autonomous execution | Keeps workflows controllable and easier to validate. |
| 30-clinic sample is exploratory | It is enough to form hypotheses; deeper research is still needed before generalizing. |

## 17. Current Status

Planning foundation complete: PDF understanding, Idea Reality MCP validation, clinic research methodology, 30-clinic sample, public audit framework, data model, ERD, V1 scope, screen map, user flows, golden-path scenarios, and implementation specification.

Next action: implement the prototype starting with the application shell and the three golden paths. The same specification can be implemented directly in VS Code.