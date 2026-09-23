import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { BadRequestError, NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { LLMError } from '../llm/client.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'draft-email';

const contextSchema = z.object({
  prospectId: z.string().uuid(),
});

export interface DraftMessageResult {
  channel: string;
  recipient: string;
  draftText: string;
  reasoning: string;
  to: string;
  subject: string;
  body: string;
  body_type: 'text' | 'html';
}

interface ProspectRow {
  id: string;
  organization_id: string;
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  website: string | null;
  booking_available: boolean;
  whatsapp_available: boolean;
  google_rating: number | null;
  review_count: number | null;
  content_quality: string | null;
  visible_advertising: string | null;
  email: string | null;
}

interface AuditRow {
  identified_problems: string | null;
  recommendations: string | null;
  overall_opportunity: string | null;
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

// V3.1.11: LLM response schema for draft-email enhancement. body_type is pinned
// to "text" to match the deterministic output and SendGrid delivery contract.
const llmDraftEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  body_type: z.literal('text'),
});

function buildLlmPrompt(
  prospect: ProspectRow,
  latestAudit: AuditRow | null
): string {
  const facts: string[] = [];
  if (prospect.specialty) facts.push(`specialty: ${prospect.specialty}`);
  if (prospect.area) facts.push(`area: ${prospect.area}`);
  if (prospect.google_rating) {
    facts.push(`Google rating: ${prospect.google_rating}/5`);
  }
  if (prospect.review_count) facts.push(`${prospect.review_count} reviews`);
  if (prospect.booking_available) facts.push('online booking available');
  if (prospect.whatsapp_available) facts.push('WhatsApp available');
  if (prospect.content_quality) {
    facts.push(`content quality: ${prospect.content_quality}`);
  }
  if (prospect.visible_advertising) {
    facts.push(`visible advertising: ${prospect.visible_advertising}`);
  }

  const problems = latestAudit
    ? parseList(latestAudit.identified_problems).join('; ')
    : 'none identified';
  const recommendations = latestAudit
    ? parseList(latestAudit.recommendations).join('; ')
    : 'none';

  return `PROSPECT OUTREACH EMAIL TASK

Clinic: ${prospect.clinic_name}
Doctor: ${prospect.doctor_name || 'Unknown'}
Specialty: ${prospect.specialty || 'Unknown'}
Area: ${prospect.area || 'Unknown'}

Key facts: ${facts.join('. ') || 'none'}
Website: ${prospect.website || 'not available'}
Audit problems: ${problems}
Audit recommendations: ${recommendations}

Write a concise, professional outreach email to the doctor above from the Clinic Growth team. Reference the clinic by name and include a single, specific call to action for a brief discovery call.

Return ONLY a JSON object with exactly these fields:
- "subject": a concise professional email subject line
- "body": the full email body as plain text (no markdown)
- "body_type": "text"

Do not invent pricing, guarantees, clinical outcomes, or services not listed above. Do not include any text before or after the JSON.`;
}

async function enhanceWithLlm(
  execContext: AiToolExecutionContext,
  prospect: ProspectRow,
  latestAudit: AuditRow | null
): Promise<{ subject: string; body: string; body_type: 'text' } | undefined> {
  if (!execContext.llmClient) {
    return undefined;
  }

  try {
    const prompt = buildLlmPrompt(prospect, latestAudit);

    const response = await execContext.llmClient.generateCompletion({
      prompt,
      systemPrompt:
        'You are a helpful assistant that drafts concise, professional outreach emails for a clinic growth system. Return ONLY valid JSON.',
      maxTokens: 600,
      temperature: 0.4,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      logger.warn(
        {
          tool: TOOL_ID,
          organizationId: execContext.organizationId,
          prospectId: prospect.id,
        },
        'LLM response was not valid JSON; falling back to deterministic draft-email output'
      );
      return undefined;
    }

    const result = llmDraftEmailSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn(
        {
          tool: TOOL_ID,
          organizationId: execContext.organizationId,
          prospectId: prospect.id,
          error: result.error.message,
        },
        'LLM response did not match expected schema; falling back to deterministic draft-email output'
      );
      return undefined;
    }

    return {
      subject: result.data.subject,
      body: result.data.body,
      body_type: 'text',
    };
  } catch (err: unknown) {
    const errKind = err instanceof LLMError ? err.kind : 'unknown';
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      {
        tool: TOOL_ID,
        organizationId: execContext.organizationId,
        prospectId: prospect.id,
        error: errMsg,
        errorKind: errKind,
      },
      'LLM enhancement failed; falling back to deterministic draft-email output'
    );
    return undefined;
  }
}

export const draftEmailTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Draft Email',
  description: 'Generate a professional email for clinic outreach',
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
                website, booking_available, whatsapp_available, google_rating,
                review_count, content_quality, visible_advertising, email
         FROM prospects
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [prospectId, organizationId]
      );

      if (prospectResult.rowCount !== 1) {
        throw new NotFoundError(`Prospect not found: ${prospectId}`);
      }

      const prospect = prospectResult.rows[0];

      if (!prospect.email) {
        throw new BadRequestError(
          `Prospect ${prospect.id} has no email address; cannot draft email`
        );
      }

      const auditsResult = await client.query<AuditRow>(
        `SELECT identified_problems, recommendations, overall_opportunity
         FROM audits
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const latestAudit = auditsResult.rowCount
        ? auditsResult.rows[0]
        : null;

      let subject = `Growth Opportunity for ${prospect.clinic_name}`;
      const recipientName = prospect.doctor_name?.trim();
      const greeting = recipientName ? `Dear ${recipientName}` : 'Hello';

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

      let body = `${greeting},\n\n`;

      if (latestAudit) {
        const problems = parseList(latestAudit.identified_problems)
          .slice(0, 2)
          .join('; ') || 'various operational areas';

        body += `I recently reviewed ${prospect.clinic_name} and wanted to share observations about ${problems}.\n\n`;
        body += `At Clinic Growth, we work with dermatology and aesthetic clinics on:\n\n`;
        body += `\u2022 Qualified enquiry growth\n`;
        body += `\u2022 Digital presence and review management\n`;
        body += `\u2022 Patient communication automation\n`;
        body += `\u2022 Appointment and follow-up workflows\n\n`;

        if (latestAudit.overall_opportunity === 'High') {
          body += `Based on this review, there appears to be meaningful potential to discuss. I'd love to share more details in a brief call.\n\n`;
        } else {
          body += `I'd be happy to discuss how these areas might apply to your clinic.\n\n`;
        }
      } else {
        body += `I came across ${factSummary} and wanted to reach out.\n\n`;
        body += `At Clinic Growth, we partner with dermatology and aesthetic clinics on:\n\n`;
        body += `\u2022 Qualified enquiry growth\n`;
        body += `\u2022 Digital presence and review management\n`;
        body += `\u2022 Patient communication automation\n`;
        body += `\u2022 Appointment and follow-up workflows\n\n`;
        body += `I'd be happy to share how these services could fit your clinic.\n\n`;
      }

      body += `Would you be available for a 15-minute call this week?\n\n`;
      body += `Best regards,\n`;
      body += `Clinic Growth Team`;

      let reasoning = `Generated email for ${prospect.clinic_name} (${prospect.specialty}).`;
      if (latestAudit) {
        reasoning += ` Referencing verified audit findings: ${(latestAudit.identified_problems || 'General growth').slice(0, 100)}.`;
      } else {
        reasoning += ' No audit data available, using general outreach template without clinic-specific claims.';
      }

      // V3.1.11: Try LLM enhancement for subject/body; fall back to the
      // deterministic template above on any LLM failure or missing client.
      const llmResult = await enhanceWithLlm(execContext, prospect, latestAudit);
      if (llmResult) {
        subject = llmResult.subject;
        body = llmResult.body;
      }

      const result: DraftMessageResult = {
        channel: 'Email',
        recipient: `${prospect.doctor_name} - ${prospect.clinic_name}`,
        draftText: `Subject: ${subject}\n\n${body}`,
        reasoning,
        to: prospect.email,
        subject,
        body,
        body_type: 'text',
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, prospectId },
        'draft-email tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      if (err instanceof BadRequestError) throw err;
      throw new Error(`draft-email tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};