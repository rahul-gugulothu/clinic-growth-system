# Clinic Growth System — V1 Prototype Specification

## Purpose

This document converts the agreed business understanding, research findings, data model, V1 scope, screen map, and user flows into an implementation-ready prototype specification.

It is a planning/reference document, not a production technical design.

## Product Goal

Demonstrate the complete core journey:

**Prospect → Audit → Outreach → Client Onboarding → Lead → Conversation → Appointment → Follow-up → Outcome → Growth**

The original PDF frames the clinic-growth outcome as qualified enquiries → booked appointments → attended appointments → clinic revenue → retention/referrals. The prototype should make that journey understandable and clickable.

---

# 1. Workspaces

## Internal Growth Workspace

Used by the Clinic Growth System team.

Navigation:
- Dashboard
- Prospects
- Audits
- Outreach
- Sales
- Reports
- Settings

Core purpose:
**Find clinics → research → audit → contact → convert → onboard.**

## Clinic Workspace

Used by clinic owner/staff.

Navigation:
- Dashboard
- Leads
- Conversations
- Appointments
- Follow-ups
- Reviews
- Analytics
- Settings

Core purpose:
**Capture enquiries → handle → qualify → book → follow up → measure.**

---

## Internal Workspace Screens

### 2.1 Internal Dashboard

#### Purpose
Show the state of the company's prospecting and client pipeline.

#### Data shown
- Prospects researched
- Audits completed
- Clinics contacted
- Responses
- Calls
- Proposals
- Clients onboarded
- Pipeline value

#### Main actions
- Add prospect
- Open prospect
- Create audit
- Record outreach
- Create proposal
- Convert prospect to clinic

---

### 2.2 Prospects

#### Purpose
Manage the researched clinic database.

#### Table fields
- Clinic name
- Doctor/owner
- Specialty
- Area
- Google rating
- Review count
- Website
- Instagram
- Booking availability
- WhatsApp availability
- Content quality
- Obvious problem
- Priority
- Outreach status

#### Filters
- Area
- Specialty
- Priority
- Booking available
- WhatsApp available
- Research status
- Outreach status

#### Actions
- Open prospect
- Create audit
- Start outreach
- Change priority

---

### 2.3 Prospect Profile

#### Sections
1. Basic clinic information
2. Public digital presence
3. Verified facts
4. Observations/hypotheses
5. Audit history
6. Outreach history
7. Current status

#### Important rule
Keep verified facts separate from our interpretation.

Example:
- Fact: "Website has an appointment form."
- Observation: "The booking journey may still have friction."

#### Actions
- Create audit
- Add note
- Start outreach
- Move to next sales stage

---

### 2.4 Clinic Audit

#### Audit areas
- Search/discovery
- Google presence
- Website
- Reviews
- Enquiry process
- WhatsApp
- Booking
- Follow-up
- Content
- Competitors

#### Output
- Strengths
- Observed weaknesses
- Growth opportunities
- Evidence
- Recommended actions
- Opportunity level

#### Rule
Do not claim an internal clinic problem unless public evidence or direct research supports it.

---

### 2.5 Outreach Board

#### Pipeline stages
- Not contacted
- Contacted
- Responded
- Follow-up due
- Call
- Proposal
- Won
- Lost

#### Record for each outreach
- Clinic
- Channel
- Contact date
- Last contact
- Next action
- Owner
- Response

---

### 2.6 Sales / Proposal

#### Purpose
Move a qualified clinic from conversation into a customer.

#### Information
- Clinic
- Problem/opportunity
- Proposed service
- Expected outcomes
- Price
- Timeline
- Status

#### Main actions
- Create proposal
- Mark accepted
- Mark lost
- Convert to clinic

---

### 2.7 Clinic Onboarding

#### Required setup
- Clinic profile
- Doctors
- Staff
- Services
- Working hours
- Communication channels
- Growth goals
- Baseline metrics

#### Completion state
Clinic changes from prospect/customer pipeline into an active clinic workspace.

---

## Clinic Workspace Screens

### 3.1 Clinic Dashboard

#### Purpose
Answer:
**How is the clinic's growth pipeline performing?**

#### KPI cards
- New enquiries
- Qualified enquiries
- Booked appointments
- Attended appointments
- No-shows
- Booking rate
- Response time
- Revenue/outcome where reliable

#### Funnel
Enquiries → Qualified → Booked → Attended → Outcome

#### Insight panel
Show one or two actionable observations rather than many decorative charts.

Example:
"12 enquiries this week; 7 booked. Biggest drop-off is qualified → booked."

---

### 3.2 Leads

#### Table
- Lead ID
- Source
- Service interested
- Created date/time
- Status
- Assigned staff
- Last contact
- Next action

#### Statuses
- New
- Contacted
- Qualified
- Booked
- Attended
- Lost

#### Actions
- Open lead
- Change status
- Assign staff
- Open conversation
- Schedule follow-up
- Book appointment

---

### 3.3 Lead Detail

#### Header
- Lead ID
- Source
- Service
- Status
- Assigned staff

#### Main area
Conversation timeline.

#### Side area
- Lead information
- Appointment information
- Next action
- Follow-up state

#### Activity timeline
- Lead created
- Response sent
- Qualified
- Appointment suggested
- Appointment booked
- Reminder sent
- Outcome recorded

---

### 3.4 Conversations

#### Layout
- Conversation list
- Message history
- Lead context panel

#### Actions
- Reply
- Assign
- Qualify
- Schedule follow-up
- Book appointment
- Mark lost

#### V1 constraint
Simulated WhatsApp-style experience is acceptable. A live WhatsApp integration is not required for the prototype.

---

### 3.5 Appointments

#### Views
- Day
- Week
- Month

#### Appointment fields
- Lead
- Doctor
- Date/time
- Status
- Reminder status

#### Statuses
- Booked
- Attended
- No-show
- Cancelled

#### Actions
- Create
- Reschedule
- Mark attended
- Mark no-show
- Cancel

---

### 3.6 Follow-ups

#### Sections
- Due today
- Upcoming
- Completed
- Missed

#### Example task
Lead has not booked after enquiry → follow-up due today at 3:00 PM.

#### Actions
- Send
- Reschedule
- Mark completed
- Record outcome

---

### 3.7 Reviews

#### V1 scope
Keep simple.

#### Metrics
- Review requests sent
- Pending requests
- Reviews received
- Average rating

#### Core workflow
Appointment attended → request review → review outcome recorded.

---

### 3.8 Analytics

#### Main questions
- Where are leads coming from?
- How many enquiries become bookings?
- How many bookings become visits?
- Where are people dropping off?
- What revenue/outcomes can be attributed reliably?

#### Charts
- Leads by source
- Booking rate
- Attendance rate
- No-show rate
- Response time trend
- Enquiry-to-appointment funnel

---

### 3.9 Settings

#### Clinic
- Name
- Address
- Services
- Working hours

#### Team
- Doctors
- Staff
- Basic roles

#### Communication
- WhatsApp configuration placeholder
- Notifications

#### Integrations
Placeholders only in V1.

---

# 4. Prototype Golden Paths

## Golden Path A — Internal Team

Prospects → Prospect Profile → Audit → Outreach → Conversation/Call → Proposal → Won → Onboarding

Expected result:
A researched prospect becomes an active clinic without losing its research/audit history.

## Golden Path B — New Enquiry

Leads → Open new lead → Conversation → Qualify → Book appointment → Appointment created

Expected result:
The lead's status updates and the appointment appears automatically.

## Golden Path C — Appointment Outcome

Booked appointment → Reminder → Attended or No-show → Follow-up/outcome → Dashboard update

Expected result:
The business funnel reflects what happened.

---

# 5. V1 Prototype Data Requirements

The prototype needs enough data to demonstrate the workflows.

## Internal sample data
- Clinics/prospects
- Audits
- Outreach records
- Proposals

## Clinic operational demo data
- Leads
- Conversations/messages
- Appointments
- Follow-ups
- Reviews
- Business outcomes

## Data boundary
Do not use real patient medical information.
Use minimal/non-sensitive demo records or authorized clinic data when available.

---

# 6. V1 Explicitly Excludes

- Full medical records / Electronic Health Record (EHR)
- Billing/accounting system
- Medical diagnosis AI
- Treatment recommendation AI
- Deep Practice Management System (PMS) integrations
- Predictive churn/recommendation engine
- Full multilingual AI
- Advanced revenue attribution
- Enterprise-scale automation

---

# 7. Prototype Quality Bar

The prototype is successful when a reviewer can understand, without explanation:

1. How an internal team finds and converts a clinic.
2. How a clinic handles a new enquiry.
3. How an enquiry becomes an appointment.
4. How follow-up and outcomes are tracked.
5. How the dashboard shows the result.

The prototype should prioritize **one connected end-to-end journey** over many disconnected pages.