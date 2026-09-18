import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'draft-whatsapp';

const contextSchema = z.object({
  prospectId: z.string().uuid(),
});

export interface DraftMessageResult {
  channel: string;
  recipient: string;
  draftText: string;
  reasoning: string;
}

interface ProspectRow {
  id: string;
  organization_id: string;
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  booking_available: boolean;
  whatsapp_available: boolean;
  google_rating: number | null;
  review_count: number | null;
  content_quality: string | null;
  visible_advertising: string | null;
}

interface AuditRow {
  overall_opportunity: string | null;
}

interface OutreachRow {
  stage: string;
  next_action: string | null;
}

export const draftWhatsAppTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Draft WhatsApp',
  description: 'Generate a WhatsApp outreach message for a prospect',
  tenant_scope: 'org',
  required_context: ['prospectId'],
  human_review_required: true,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    toolContext: AiToolContext
  ): Promise<DraftMessageResult> {
    const { organizationId } = execContext;
    const prospectId = toolContext.prospectId!;

    const client = await getClient();

    try {
      const prospectResult = await client.query<ProspectRow>(
        `SELECT id, organization_id, clinic_name, doctor_name, specialty, area,
                booking_available, whatsapp_available, google_rating,
                review_count, content_quality, visible_advertising
         FROM prospects
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [prospectId, organizationId]
      );

      if (prospectResult.rowCount !== 1) {
        throw new NotFoundError(`Prospect not found: ${prospectId}`);
      }

      const prospect = prospectResult.rows[0];

      const auditsResult = await client.query<AuditRow>(
        `SELECT overall_opportunity FROM audits
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const outreachResult = await client.query<OutreachRow>(
        `SELECT stage, next_action FROM outreach
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY last_contact_at DESC`,
        [prospectId, organizationId]
      );

      const latestAudit = auditsResult.rowCount
        ? auditsResult.rows[0]
        : null;
      const latestOutreach = outreachResult.rowCount
        ? outreachResult.rows[0]
        : null;

      let reasoning = `Selected ${prospect.clinic_name}. `;
      if (latestOutreach) {
        reasoning += `Current stage: ${latestOutreach.stage}.`;
        if (latestOutreach.next_action) {
          reasoning += ` Previous next action: ${latestOutreach.next_action}.`;
        }
      }
      if (latestAudit) {
        reasoning += ` Audit opportunity: ${latestAudit.overall_opportunity || 'N/A'}.`;
      }

      let stage = 'initial';
      if (latestOutreach) {
        if (latestOutreach.stage === 'Not contacted') stage = 'initial';
        else if (latestOutreach.stage === 'Contacted') stage = 'follow_up';
        else if (latestOutreach.stage === 'Responded') stage = 'response_received';
        else if (latestOutreach.stage === 'Follow-up due') stage = 'follow_up';
        else if (latestOutreach.stage === 'Call') stage = 'call_followup';
        else if (latestOutreach.stage === 'Proposal') stage = 'proposal_followup';
      }

      const recipientName = prospect.doctor_name?.trim();
      const greeting = recipientName ? `Hi ${recipientName}` : 'Hello';

      const facts: string[] = [];
      if (prospect.specialty) facts.push(prospect.specialty);
      if (prospect.area) facts.push(prospect.area);
      if (prospect.booking_available) facts.push('online booking');
      if (prospect.whatsapp_available) facts.push('WhatsApp');
      if (prospect.google_rating) facts.push(`Google rating ${prospect.google_rating}/5`);
      if (prospect.review_count) facts.push(`${prospect.review_count} reviews`);
      if (prospect.content_quality === 'High') facts.push('strong content');
      if (prospect.visible_advertising) facts.push(prospect.visible_advertising);

      const factSummary = facts.length > 0 ? facts.slice(0, 3).join(', ') : 'your clinic';

      let draftText = '';
      if (stage === 'initial') {
        draftText = `${greeting},\n\nI came across ${factSummary} and wanted to reach out.\n\nWe help clinics improve patient acquisition and streamline operations. Would you be open to a brief chat?\n\nBest regards`;
      } else if (stage === 'follow_up') {
        draftText = `${greeting},\n\nJust following up on my earlier message. I'd love to share how we help clinics like yours improve patient acquisition.\n\nLet me know a convenient time to connect.\n\nBest regards`;
      } else if (stage === 'response_received') {
        draftText = `${greeting},\n\nThank you for your response! I've prepared some insights specific to your clinic.\n\nWhen would be a good time for a quick call?\n\nBest regards`;
      } else if (stage === 'call_followup') {
        draftText = `${greeting},\n\nLooking forward to our call. Just wanted to confirm you're still available this week.\n\nLet me know the best time to reach you.\n\nBest regards`;
      } else if (stage === 'proposal_followup') {
        draftText = `${greeting},\n\nHope you had a chance to review the proposal. I'm happy to clarify any questions or discuss adjustments.\n\nLooking forward to your thoughts.\n\nBest regards`;
      }

      const result: DraftMessageResult = {
        channel: 'WhatsApp',
        recipient: `${prospect.clinic_name} (${prospect.doctor_name})`,
        draftText,
        reasoning,
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, prospectId },
        'draft-whatsapp tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      throw new Error(`draft-whatsapp tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};