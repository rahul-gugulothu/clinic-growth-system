# Clinic Growth System — Data Model (Draft)

This is a working candidate model. It must be reviewed against the V1 scope before implementation.

## 1. Market / prospect data

The PDF explicitly requires a 100-clinic research database with:

- Clinic
- Doctor
- Specialty
- Area
- Phone
- Website
- Google rating
- Reviews
- Instagram
- Booking
- WhatsApp
- Visible advertising
- Content quality
- Obvious problem
- Priority

We should also retain `source_url` and `research_date` so each observation can be traced back to its source.

## 2. Candidate clinic-operational entities

These are inferred from the product workflow:

- Clinic
- Doctor
- Staff
- Lead / Enquiry
- Conversation
- Appointment
- Patient
- Follow-up
- Campaign
- Review
- Referral
- Revenue / Outcome
- Audit
- Task

## 3. Data minimization rule

The PDF recommends avoiding unnecessary medical information and preferring a Lead ID → source → enquiry → appointment → attended model.

For the prototype, avoid real patient medical information. Use synthetic operational records unless authorized clinic data is available.

## 4. Candidate relationships

**Clinic** 1→many **Doctors**

**Clinic** 1→many **Staff**

**Clinic** 1→many **Leads**

**Lead** 0→1 **Patient**

**Lead** 1→many **Conversations**

**Patient/Lead** 1→many **Appointments**

**Patient/Lead** 1→many **Follow-ups**

**Patient** 0→many **Reviews**

**Patient** 0→many **Referrals**

**Campaign** 1→many **Leads / Follow-ups / Referrals**

**Appointment / Campaign** → **Revenue / Outcome** where attribution is reliable

These relationships are provisional until V1 is finalized.