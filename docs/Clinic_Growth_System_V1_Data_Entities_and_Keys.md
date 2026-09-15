# Clinic Growth System — V1 Data Entities & Keys

**Purpose:** a simple reference for what information the prototype needs to store and how the entities connect.

**Important:** This is a planning/reference document, not a production database schema. It is based on the original operating plan, our V1 product decisions, and the current prototype scope.

---

## 1. Prospect

**Purpose:** A potential clinic we research before it becomes a customer.

| Key / Field | Required? | What it means |
|---|---|---|
| prospect_id | Yes | Foreign key linking research/audit data to a prospect. |
| clinic_name | Yes | Information stored for the entity. |
| doctor_name | | |
| specialty | | |
| area | | |
| phone | | Usually |
| website | | |
| google_rating | | |
| review_count | | |
| instagram_url | | |
| booking_available | | |
| whatsapp_available | | |
| visible_advertising | | |
| content_quality | | |
| obvious_problem | | |
| priority | | |
| source_urls | | |
| research_date | | |
| notes | | |

## 2. Clinic Audit

Our structured assessment of a clinic's public growth journey.

| Key / Field | Required? | What it means |
|---|---|---|
| audit_id | Yes | Primary key — unique identifier for this entity. |
| prospect_id or clinic_id | Yes | Foreign key linking the record to a prospect/customer. |
| audit_date | | |
| google_presence | | |
| reviews | | |
| enquiry_process | | |
| whatsapp | | |
| booking | | |
| follow_up | | |
| content | | |
| competitors | | |
| identified_problems | | |
| recommendations | | |
| overall_opportunity | | |

## 3. Clinic

The actual customer organization using the Clinic Growth System.

| Key / Field | Required? | What it means |
|---|---|---|
| clinic_id | Yes | Foreign key linking the record to a clinic. |
| name | | |
| address | | |
| city | | |
| whatsapp_number | | |
| working_hours | | |
| status | | |
| created_at | | |

## 4. Doctor

A doctor working at a clinic.

| Key / Field | Required? | What it means |
|---|---|---|
| doctor_id | Yes | Foreign key linking the appointment to a doctor. |
| role | | |

## 5. Staff

A person who operates the clinic workflow.

| Key / Field | Required? | What it means |
|---|---|---|
| staff_id | Yes | Primary key for a staff member. |
| email | | |

## 6. Lead

A potential patient enquiry entering the clinic growth funnel.

| Key / Field | Required? | What it means |
|---|---|---|
| lead_id | Yes | Foreign key linking activity to a lead. |
| source | | |
| service_interested | | |
| assigned_staff_id | | |
| last_contact_at | | |
| next_action | | |

## 7. Conversation

Communication history connected to a lead.

| Key / Field | Required? | What it means |
|---|---|---|
| conversation_id | Yes | |
| channel | | |
| started_at | | |
| last_message_at | | |

## 8. Appointment

A scheduled clinic visit linked to a lead and doctor.

| Key / Field | Required? | What it means |
|---|---|---|
| appointment_id | Yes | Foreign key linking follow-up/review/outcome to an appointment. |
| scheduled_at | | |
| reminder_status | | |
| attended_at | | |

## 9. Follow-up

A planned communication/action after an enquiry or appointment.

| Key / Field | Required? | What it means |
|---|---|---|
| followup_id | Yes | |
| type | | |
| outcome | | |

## 10. Review

A review request/result associated with a clinic visit.

| Key / Field | Required? | What it means |
|---|---|---|
| review_id | Yes | |
| requested_at | | |
| rating | | |

## 11. Referral

A new lead generated through an existing patient/lead referral.

| Key / Field | Required? | What it means |
|---|---|---|
| referral_id | Yes | |
| referring_lead_or_patient | | |
| referred_lead_id | | |

## 12. Business Outcome / Revenue

A measurable business result when revenue attribution is reliable enough to record.

| Key / Field | Required? | What it means |
|---|---|---|
| outcome_id | Yes | |
| amount | | |
| recorded_at | | |
| attribution_source | | |
| attribution_confidence | | |

---

## 13. Relationships — How the Entities Connect

**Internal growth side:** Prospect → Clinic Audit → Clinic → Outreach / onboarding.

**Clinic growth side:** Clinic → Lead → Conversation → Appointment → Follow-up → Outcome → Review / Referral / Revenue.

| From | Relationship |
|---|---|
| Prospect | Clinic Audit — One prospect can have multiple audits over time. |
| Prospect | Clinic — A prospect can become a customer clinic. |
| Clinic | Doctor — One clinic can have many doctors. |
| Clinic | Staff — One clinic can have many staff members. |
| Clinic | Lead — One clinic can have many leads. |
| Lead | Conversation — A lead can have one or more conversations. |
| Lead | Appointment — A lead can create one or more appointments. |
| Appointment | Follow-up — An appointment can trigger reminders or recovery follow-ups. |
| Appointment | Review — An attended appointment can trigger a review request. |
| Lead / Patient | Referral — A referral creates a new lead. |
| Appointment | Business Outcome — A reliable business outcome can be attributed to an appointment. |

## 14. V1 Data Principles

- Keep the system focused on clinic growth, not a full medical-record system.
- Use the minimum patient information needed for the commercial workflow.
- Keep research/prospect data separate from clinic operational data.
- Do not confuse public research facts with our own audit observations.
- Keep a source URL and research date for public research records.
- For revenue, record attribution confidence instead of pretending attribution is always exact.
- Missing public information should be recorded as unknown/unverified rather than guessed.

## 15. Key Terms

| Term | Simple meaning |
|---|---|
| Primary Key (PK) | A unique ID that identifies one record in a table/entity. |
| Foreign Key (FK) | An ID that points to a record in another entity and creates a relationship. |
| Entity | A type of information the product needs to manage, such as a Clinic or Lead. |
| Prospect | A clinic we are researching and may approach, but which is not yet a customer. |
| Lead | A potential patient/enquiry for a clinic. |
| Attribution | Connecting a business result such as revenue to a source, campaign or appointment. |
| MVP | Minimum Viable Product — the smallest useful version built to validate the core workflow. |
| PMS | Practice Management System — software a clinic may already use for operations such as scheduling. |
| CRM | Customer Relationship Management — a system for managing leads, customers and interactions. |