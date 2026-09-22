import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { BadRequestError, NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';
import { LLMError } from '../llm/client.js';

export const TOOL_ID = 'prospect-summary';

const contextSchema = z.object({
  prospectId: z.string().uuid(),
});

export interface ProspectSummaryResult {
  prospectId: string;
  clinic: string;
  doctor: string;
  specialty: string;
  area: string;
  priority: string;
  researchSummary: string;
  auditSummary?: string;
  outreachStatus?: string;
  proposalStatus?: string;
  recommendedNextAction: string;
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
  visible_advertising: string | null;
}

interface AuditRow {
  id: string;
  prospect_id: string | null;
  overall_opportunity: string | null;
  identified_problems: unknown;
  recommendations: unknown;
}

interface OutreachRow {
  id: string;
  prospect_id: string;
  stage: string;
  channel: string | null;
  last_contact_at: string | null;
  next_action: string | null;
}

interface ProposalRow {
  id: string;
  prospect_id: string;
  status: string;
  price_inr: number | null;
  proposed_service: string | null;
  timeline: string | null;
}

function parseProblems(field: unknown): string[] {
  if (Array.isArray(field)) {
    return field.filter((f): f is string => typeof f === 'string');
  }
  if (typeof field === 'string') {
    return field.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// LLM response schema for prospect-summary enhancement
const llmSummarySchema = z.object({
  researchSummary: z.string().min(1),
  recommendedNextAction: z.string().min(1),
});

// Construct LLM prompt from gathered context
function buildLlmPrompt(
  prospect: ProspectRow,
  auditSummary: string | undefined,
  outreachStatus: string | undefined,
  proposalStatus: string | undefined
): string {
  const facts: string[] = [];
  if (prospect.specialty) facts.push(prospect.specialty);
  if (prospect.area) facts.push(prospect.area);
  if (prospect.google_rating) facts.push(`Google rating ${prospect.google_rating}/5`);
  if (prospect.review_count) facts.push(`${prospect.review_count} reviews`);
  if (prospect.booking_available) facts.push('Online booking available');
  if (prospect.whatsapp_available) facts.push('WhatsApp available');
  if (prospect.content_quality) facts.push(`Content quality: ${prospect.content_quality}`);
  if (prospect.visible_advertising) facts.push(`Visible advertising: ${prospect.visible_advertising}`);

  const notesText = prospect.notes ? prospect.notes.slice(0, 300) : 'No notes available';

  return `PROSPECT SUMMARY TASK

Clinic: ${prospect.clinic_name}
Doctor: ${prospect.doctor_name || 'Unknown'}
Specialty: ${prospect.specialty || 'Unknown'}
Area: ${prospect.area || 'Unknown'}
Priority: ${prospect.priority || 'Unknown'}
Notes: ${notesText}
Audit Summary: ${auditSummary || 'No audit data'}
Outreach Status: ${outreachStatus || 'No outreach yet'}
Proposal Status: ${proposalStatus || 'No proposals yet'}
Key Facts: ${facts.join('. ') || 'None'}

Generate a JSON object with exactly these two fields:
1. "researchSummary": A concise 2-3 sentence summary of this clinic based on all available information (notes, audit, outreach, proposals). Focus on what makes this clinic unique and what the founder should know.
2. "recommendedNextAction": A specific, actionable next step for the founder to take with this clinic. Reference the clinic by name in your recommendation.

Return ONLY valid JSON. Do not include any text before or after the JSON.`;
}

// Attempt LLM enhancement with fallback to deterministic logic
async function enhanceWithLlm(
  execContext: AiToolExecutionContext,
  prospect: ProspectRow,
  auditSummary: string | undefined,
  outreachStatus: string | undefined,
  proposalStatus: string | undefined
): Promise<{ researchSummary: string; recommendedNextAction: string } | undefined> {
  if (!execContext.llmClient) {
    return undefined;
  }

  try {
    const prompt = buildLlmPrompt(prospect, auditSummary, outreachStatus, proposalStatus);

    const response = await execContext.llmClient.generateCompletion({
      prompt,
      systemPrompt: 'You are a helpful assistant that produces structured JSON for a clinic growth system.',
      maxTokens: 500,
      temperature: 0.3,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      logger.warn(
        { toolId: TOOL_ID, organizationId: execContext.organizationId, prospectId: prospect.id },
        'LLM response was not valid JSON; falling back to deterministic output'
      );
      return undefined;
    }

    const result = llmSummarySchema.safeParse(parsed);
    if (!result.success) {
      logger.warn(
        {
          toolId: TOOL_ID,
          organizationId: execContext.organizationId,
          prospectId: prospect.id,
          error: result.error.message,
        },
        'LLM response did not match expected schema; falling back to deterministic output'
      );
      return undefined;
    }

    return {
      researchSummary: result.data.researchSummary,
      recommendedNextAction: result.data.recommendedNextAction,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errKind = err instanceof LLMError ? err.kind : 'unknown';
    logger.warn(
      {
        toolId: TOOL_ID,
        organizationId: execContext.organizationId,
        prospectId: prospect.id,
        error: errMsg,
        errorKind: errKind,
      },
      'LLM enhancement failed; falling back to deterministic output'
    );
    return undefined;
  }
}

export const prospectSummaryTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Prospect Summary',
  description: 'Generate a structured summary for a prospect',
  tenant_scope: 'org',
  required_context: ['prospectId'],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    toolContext: AiToolContext
  ): Promise<ProspectSummaryResult> {
    const { organizationId } = execContext;
    const prospectId = toolContext.prospectId!;

    const client = await getClient();

    try {
      const prospectResult = await client.query<ProspectRow>(
        `SELECT id, organization_id, clinic_name, doctor_name, specialty, area,
                priority, notes, google_rating, review_count, website,
                booking_available, whatsapp_available, content_quality, visible_advertising
         FROM prospects
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [prospectId, organizationId]
      );

      if (prospectResult.rowCount !== 1) {
        throw new NotFoundError(`Prospect not found: ${prospectId}`);
      }

      const prospect = prospectResult.rows[0];

      const auditsResult = await client.query<AuditRow>(
        `SELECT id, prospect_id, overall_opportunity, identified_problems, recommendations
         FROM audits
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      const outreachResult = await client.query<OutreachRow>(
        `SELECT id, prospect_id, stage, channel, last_contact_at, next_action
         FROM outreach
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY last_contact_at DESC`,
        [prospectId, organizationId]
      );

      const proposalsResult = await client.query<ProposalRow>(
        `SELECT id, prospect_id, status, price_inr, proposed_service, timeline
         FROM proposals
         WHERE prospect_id = $1 AND organization_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [prospectId, organizationId]
      );

      let researchSummary: string =
        prospect.notes
          ? prospect.notes.slice(0, 300)
          : 'No research notes available.';

      let auditSummary: string | undefined;
      if (auditsResult.rowCount && auditsResult.rowCount > 0) {
        const latest = auditsResult.rows[0];
        const problems = parseProblems(latest.identified_problems);
        const problemSummary =
          problems.length > 0
            ? problems.slice(0, 2).join('; ')
            : 'various operational areas';
        auditSummary = `Opportunity: ${latest.overall_opportunity || 'N/A'}. Problems: ${problemSummary}`;
      }

      let outreachStatus: string | undefined;
      if (outreachResult.rowCount && outreachResult.rowCount > 0) {
        const latest = outreachResult.rows[0];
        outreachStatus = `${latest.stage} via ${latest.channel || 'unknown channel'}`;
        if (latest.next_action) {
          outreachStatus += ` — Next: ${latest.next_action}`;
        }
      }

      let proposalStatus: string | undefined;
      if (proposalsResult.rowCount && proposalsResult.rowCount > 0) {
        const latest = proposalsResult.rows[0];
        proposalStatus = latest.status;
        if (latest.price_inr) {
          proposalStatus += ` — ₹${latest.price_inr.toLocaleString('en-IN')}`;
        }
      }

      // V3.1.10: Try LLM enhancement for researchSummary and recommendedNextAction
      const llmResult = await enhanceWithLlm(
        execContext,
        prospect,
        auditSummary,
        outreachStatus,
        proposalStatus
      );

      if (llmResult) {
        researchSummary = llmResult.researchSummary;
      }

      let recommendedNextAction =
        'Create audit to understand the clinic better';
      if (outreachResult.rowCount && outreachResult.rowCount > 0) {
        const latestStage = outreachResult.rows[0].stage;
        if (latestStage === 'Not contacted') {
          recommendedNextAction = 'Initiate outreach via WhatsApp or Email';
        } else if (latestStage === 'Contacted') {
          recommendedNextAction = 'Follow up to get a response';
        } else if (latestStage === 'Responded') {
          recommendedNextAction = 'Schedule a discovery call';
        } else if (latestStage === 'Call') {
          recommendedNextAction = 'Prepare and conduct the call';
        } else if (latestStage === 'Proposal') {
          recommendedNextAction = 'Follow up on proposal decision';
        }
      }
      const acceptedProposal = proposalsResult.rows.find(
        (p) => p.status === 'Accepted'
      );
      if (acceptedProposal) {
        recommendedNextAction = 'Onboard the clinic';
      }

      // V3.1.10: If LLM provided a recommendation, use it
      if (llmResult) {
        recommendedNextAction = llmResult.recommendedNextAction;
      }

      const result: ProspectSummaryResult = {
        prospectId: prospect.id,
        clinic: prospect.clinic_name,
        doctor: prospect.doctor_name,
        specialty: prospect.specialty,
        area: prospect.area,
        priority: prospect.priority || 'Unknown',
        researchSummary,
        auditSummary,
        outreachStatus,
        proposalStatus,
        recommendedNextAction,
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, prospectId },
        'prospect-summary tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      if (err instanceof BadRequestError) throw err;
      throw new Error(`prospect-summary tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};
