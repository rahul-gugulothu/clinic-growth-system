# CLINIC GROWTH SYSTEM V1 --- PROJECT BRAIN

Version: V1.0 Frozen Prototype (September 2026)

## About this document

This document is the canonical documentation for Clinic Growth System
V1. It explains the product vision, architecture, entities, workflows,
AI layer, demo data, and roadmap.

------------------------------------------------------------------------

# Table of Contents

1.  Vision & Business Context
2.  Architecture Overview
3.  Data Model
4.  Zustand Store & State Machines
5.  Internal Workspace
6.  Clinic Workspace
7.  AI Assistance Layer
8.  Seed Data
9.  Golden User Journeys
10. Demo Script
11. Technical Decisions
12. V2 Roadmap

------------------------------------------------------------------------

# Chapter 1 --- Vision

Clinic Growth System is a dual-workspace CRM for dermatology, aesthetic,
cosmetic, and wellness clinics.

Goals: - Acquire clinics. - Onboard clinics. - Convert enquiries into
appointments. - Track reviews and revenue attribution. - Provide
AI-assisted operational workflows.

V1 is a browser-first functional prototype built entirely on React +
Zustand with synthetic data.

------------------------------------------------------------------------

# Chapter 2 --- Architecture

## Tech Stack

-   React + TypeScript
-   Vite
-   Zustand
-   React Router
-   Tailwind CSS
-   Recharts
-   Lucide Icons

## Folder Structure

src/ components/ features/ internal/ clinic/ onboarding/ store/ data/
lib/ types/

## Routing

Internal workspace: - /internal - /internal/prospects -
/internal/audits - /internal/outreach - /internal/sales -
/internal/reports

Clinic workspace: - /clinic - /clinic/leads - /clinic/conversations -
/clinic/appointments - /clinic/follow-ups - /clinic/reviews -
/clinic/analytics - /clinic/settings

------------------------------------------------------------------------

# Chapter 3 --- Data Model

## Internal entities

Prospect ClinicAudit OutreachRecord Proposal

## Clinic entities

Clinic Doctor Staff Lead Conversation Message Appointment Followup
Review BusinessOutcome Referral

Relationships: Prospect -\> Audit -\> Outreach -\> Proposal -\> Clinic

Clinic -\> Leads -\> Conversations -\> Appointments -\> Reviews -\>
Outcomes

------------------------------------------------------------------------

# Chapter 4 --- Zustand Store

Single global store.

Key concepts: - session.activeClinicId is the single source of truth. -
Selectors derive filtered data by clinic. - Persist middleware stores
entities in localStorage.

State Machines

Lead: New -\> Contacted -\> Qualified -\> Booked -\> Attended
New/Contacted/Qualified -\> Lost

Appointment: Booked -\> Attended Booked -\> NoShow Booked -\> Cancelled

Follow-up: Scheduled -\> Completed Scheduled -\> Missed Scheduled -\>
Rescheduled

Outreach: Research -\> Contacted -\> Responded -\> Follow-up Due -\>
Call -\> Proposal -\> Won/Lost

Proposal: Draft -\> Sent -\> Accepted/Lost

Clinic: Onboarding -\> Active -\> Paused -\> Churned

------------------------------------------------------------------------

# Chapter 5 --- Internal Workspace

## Dashboard

-   Acquisition funnel.
-   Pipeline KPIs.
-   Needs attention.
-   Recent activity.
-   Priority prospects.

## Prospect Profile

-   Verified facts.
-   Observations.
-   Evidence.
-   Audit history.
-   Outreach history.
-   Notes editor.

## Audit Detail

-   Audit summary.
-   Findings.
-   Recommendations.
-   Weaknesses.
-   Start outreach.
-   Edit audit.

## Outreach Board

-   Kanban stages.
-   Filters.
-   Needs attention strip.
-   Contact recorder.
-   Follow-up scheduler.
-   Detail drawer.

## Sales / Proposals

-   Proposal pipeline.
-   Proposal modal.
-   Proposal detail.
-   Accepted proposal onboarding handoff.

## Reports

-   Funnel.
-   Conversion.
-   Win rate.
-   Pipeline value.
-   Channel performance.
-   Owner performance.
-   Growth observations.

------------------------------------------------------------------------

# Chapter 6 --- Clinic Workspace

## Dashboard

-   KPI summary.
-   Conversion funnel.
-   Action queue.
-   Today's activity.
-   Growth insights.

## Leads

-   Lead list.
-   Filters.
-   Lead status transitions.

## Lead Detail

-   Conversation timeline.
-   Activity timeline.
-   Appointment card.
-   Follow-up card.
-   Context panel.
-   AI qualification.
-   AI follow-up.

## Conversations

-   Inbox queue.
-   Timeline.
-   Reply composer.
-   AI draft reply.
-   Assignment.
-   Appointment booking.

## Appointments

-   Day/Week/Month.
-   Detail panel.
-   Mark attended.
-   Mark no-show.
-   Cancel.
-   Reschedule.

## Follow-ups

-   Due today.
-   Upcoming.
-   Missed.
-   Completed.
-   Send.
-   Record outcome.
-   Reschedule.

## Reviews

-   Pending requests.
-   Received reviews.
-   Rating recorder.
-   Average rating KPI.

## Analytics

-   Funnel.
-   Source breakdown.
-   Attendance analysis.
-   Revenue attribution.
-   Response time.
-   AI insights.

------------------------------------------------------------------------

# Chapter 7 --- AI Assistance Layer

Five AI workflows:

1.  Lead qualification suggestion.
2.  Reply drafting.
3.  Follow-up suggestion.
4.  No-show recovery.
5.  Analytics insights.

All mutations require explicit human approval.

------------------------------------------------------------------------

# Chapter 8 --- Seed Data

Main demo records:

Prospect: - pro_drkaya

Clinic: - cln_kaya

Leads: - lead_riya - lead_meera - lead_anjali - lead_sneha - lead_rahul

Appointments, follow-ups, reviews, outcomes, referrals are connected to
cln_kaya.

SyntheticDataBanner identifies demo data.

------------------------------------------------------------------------

# Chapter 9 --- Golden User Journeys

Journey 1: Prospect -\> Audit -\> Outreach -\> Proposal -\> Onboarding
-\> Active Clinic

Journey 2: Lead -\> Conversation -\> Qualification -\> Appointment -\>
Outcome

Journey 3: Appointment -\> Review -\> Analytics

Journey 4: No-show -\> Recovery -\> Follow-up -\> Rebooking

------------------------------------------------------------------------

# Chapter 10 --- Demo Script

10-minute demo sequence:

1.  Internal Dashboard
2.  Prospect Profile
3.  Audit
4.  Outreach
5.  Proposal
6.  Onboarding
7.  Clinic Dashboard
8.  Conversations
9.  Appointments
10. Analytics

------------------------------------------------------------------------

# Chapter 11 --- Technical Decisions

Important decisions recorded during V1:

-   activeClinicId introduced as canonical clinic selector.
-   SPA navigation only.
-   Deterministic state machines.
-   Human approval AI.
-   Synthetic demo data.
-   localStorage persistence.
-   Reports unique-count fix.
-   Funnel visualization width fix.
-   Clinic onboarding creates Active clinic.

Known limitations: - No backend. - No WhatsApp integration. - No
payments. - No EHR. - Goals/baselines not persisted. - Bundle not
code-split.

------------------------------------------------------------------------

# Chapter 12 --- V2 Roadmap

Priority features:

P1: - Real WhatsApp integration. - Authentication backend. -
PostgreSQL. - Multi-clinic organizations.

P2: - Calendar scheduling UI. - AI conversation summaries. - AI
qualification via LLM. - AI follow-up generation.

P3: - Billing. - Campaign attribution. - PDF proposals. -
Notifications. - Real analytics date filters.

------------------------------------------------------------------------

# Appendix --- Milestones Completed

Milestone 1 - Internal workspace scaffold.

Milestone 2 - Clinic workspace scaffold.

Milestone 3 - AI assistance layer.

Milestone 4 - Dashboard depth pass.

Milestone 5 - Leads, Conversations, Appointments.

Milestone 6 - Follow-ups, Reviews, Analytics.

Milestone 7 - Internal Dashboard, Prospect Profile, Audit.

Milestone 8 - Outreach, Sales, Reports.

Milestone 9 - Onboarding.

Milestone 10 - Cleanup and calculation audit.

Status: - TypeScript PASS. - ESLint PASS. - Build PASS. - Prototype
complete.
