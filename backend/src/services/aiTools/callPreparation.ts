import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'call-preparation';

const contextSchema = z.object({
  prospectId: z.string().uuid(),
});

export interface CallPrepResult {
  objective: string;
  clinicContext: string;
  auditFindings: string[];
  discussionPoints: string[];
  questionsToAsk: string[];
  suggestedNextStep: string;
}

interface ProspectRow {
  id: string;
  organization_id: string;
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  priority: string | null;
  notes: string | null;
  google_rating: number | null;
  review_count: number | null;
  website: string | null;
  booking_available: boolean | null;
  whatsapp_available: boolean | null;
  content_quality: string | null;
}

interface AuditRow {
  identified_problems: unknown;
  recommendations: unknown;
  google_presence: string | null;
  enquiry_process: string | null;
  competitors: string | null;
  overall_opportunity: string | null;
}

interface OutreachRow {
  stage: string;
}

function parseList(field: unknown): string[] {
  if (Array.isArray(field)) {
    return field.filter((f): f is string => typeof f === 'string');
  }
  if (typeof field === 'string') {
    return field.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export const callPreparationTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Call Preparation',
  description: 'Prepare for a discovery call with a prospect',
  tenant_scope: 'org',
  required_context: ['prospectId'],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    toolContext: AiToolContext
  ): Promise<CallPrepResult> {
    const { organizationId } = execContext;
    const prospectId = toolContext.prospectId!;

    const client = await getClient();

    try {
      const prospectResult = await client.query<ProspectRow>(
        `SELECT id, organization_id, clinic_name, doctor_name, specialty, area,
                priority, notes, google_rating, review_count, website,
                booking_available, whatsapp_available, content_quality
         FROM prospects
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [prospectId, organizationId]
      );

      if (prospectResult.rowCount !== 1) {
        throw new NotFoundError(`Prospect not found: ${prospectId}`);
      }

      const prospect = prospectResult.rows[0];

      const auditsResult = await client.query<AuditRow & { id: string }>(
        `SELECT id, identified_problems, recommendations,
                google_presence, enquiry_process, competitors, overall_opportunity
         FROM audits
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const outreachResult = await client.query<OutreachRow>(
        `SELECT stage FROM outreach
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY last_contact_at DESC`,
        [prospectId, organizationId]
      );

      const latestOutreach = outreachResult.rowCount
        ? outreachResult.rows[0]
        : null;
      const latestAudit = auditsResult.rowCount
        ? auditsResult.rows[0]
        : null;

      const objective = `Understand ${prospect.clinic_name}'s current challenges and growth priorities`;

      const clinicContext = [
        `${prospect.specialty} clinic in ${prospect.area}`,
        prospect.google_rating
          ? `Google rating: ${prospect.google_rating}/5 (${prospect.review_count || 0} reviews)`
          : 'No Google presence detected',
        prospect.website ? `Website: ${prospect.website}` : 'No website found',
        prospect.booking_available ? 'Online booking available' : 'No online booking',
        prospect.whatsapp_available ? 'WhatsApp available' : 'No WhatsApp for appointments',
        `Content quality: ${prospect.content_quality || 'Unknown'}`,
      ].join('. ');

      const auditFindings: string[] = [];
      if (latestAudit) {
        if (latestAudit.google_presence)
          auditFindings.push(`Google presence: ${latestAudit.google_presence}`);
        if (latestAudit.enquiry_process)
          auditFindings.push(`Enquiry process: ${latestAudit.enquiry_process}`);
        if (latestAudit.identified_problems) {
          const problems = parseList(latestAudit.identified_problems);
          problems.slice(0, 3).forEach((p) => auditFindings.push(`Problem: ${p}`));
        }
        if (latestAudit.competitors)
          auditFindings.push(`Competitors: ${latestAudit.competitors.slice(0, 100)}`);
      } else {
        auditFindings.push('No audit data available - rely on conversation to understand challenges');
      }

      const discussionPoints: string[] = [
        'Current patient acquisition channels',
        'Biggest challenges with patient bookings',
        'Existing digital marketing efforts',
        'Staff capacity for patient follow-up',
        'Goals for the next quarter',
      ];

      const questionsToAsk: string[] = [
        'What percentage of bookings come through your website vs phone?',
        'How do you currently handle appointment reminders?',
        'What is your biggest frustration with patient no-shows?',
        'Have you tried any digital marketing before?',
        'What would a 30% increase in enquiries mean for your practice?',
      ];

      const suggestedNextStep =
        latestOutreach?.stage === 'Responded'
          ? 'Schedule discovery call and share calendar link'
          : latestOutreach?.stage === 'Call'
            ? 'Confirm call time and prepare presentation'
            : 'Move prospect to Call stage and schedule meeting';

      const result: CallPrepResult = {
        objective,
        clinicContext,
        auditFindings,
        discussionPoints,
        questionsToAsk,
        suggestedNextStep,
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, prospectId },
        'call-preparation tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      throw new Error(`call-preparation tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};