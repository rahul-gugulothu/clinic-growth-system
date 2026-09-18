import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { NotFoundError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'audit-summary';

const contextSchema = z.object({
  auditId: z.string().uuid(),
});

export interface AreaFinding {
  label: string;
  value: string;
}

export interface AuditSummaryResult {
  auditId: string;
  prospectName: string;
  overallOpportunity: string;
  areasReviewed: number;
  weaknessesCount: number;
  recommendationsCount: number;
  identifiedProblems: string[];
  recommendations: string[];
  areaFindings: AreaFinding[];
  nextActions: string[];
  insufficientData: boolean;
}

interface AuditRow {
  id: string;
  audit_id: string;
  prospect_id: string | null;
  overall_opportunity: string | null;
  identified_problems: unknown;
  recommendations: unknown;
  discovery: string | null;
  google_presence: string | null;
  website: string | null;
  reviews: string | null;
  enquiry_process: string | null;
  whatsapp: string | null;
  booking: string | null;
  follow_up: string | null;
  content: string | null;
  competitors: string | null;
}

interface ProspectRow {
  clinic_name: string | null;
}

const AREA_FIELDS: Array<{ key: keyof AuditRow; label: string }> = [
  { key: 'discovery', label: 'Search / Discovery' },
  { key: 'google_presence', label: 'Google Presence' },
  { key: 'website', label: 'Website' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'enquiry_process', label: 'Enquiry Process' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'booking', label: 'Booking' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'content', label: 'Content' },
  { key: 'competitors', label: 'Competitors' },
];

function parseList(field: unknown): string[] {
  if (Array.isArray(field)) {
    return field.filter((f): f is string => typeof f === 'string');
  }
  if (typeof field === 'string') {
    return field.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export const auditSummaryTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Audit Summary',
  description: 'Explain growth opportunities from an audit',
  tenant_scope: 'org',
  required_context: ['auditId'],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    toolContext: AiToolContext
  ): Promise<AuditSummaryResult> {
    const { organizationId } = execContext;
    const auditId = toolContext.auditId!;

    const client = await getClient();

    try {
      const auditResult = await client.query<AuditRow & { audit_id: string }>(
        `SELECT id as audit_id, prospect_id, overall_opportunity,
                identified_problems, recommendations,
                discovery, google_presence, website, reviews,
                enquiry_process, whatsapp, booking, follow_up,
                content, competitors
         FROM audits
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [auditId, organizationId]
      );

      if (auditResult.rowCount !== 1 || !auditResult.rows[0]) {
        throw new NotFoundError(`Audit not found: ${auditId}`);
      }

      const audit = auditResult.rows[0];

      let prospectName = 'Unknown clinic';
      if (audit.prospect_id) {
        const prospectResult = await client.query<ProspectRow>(
          `SELECT clinic_name FROM prospects
           WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [audit.prospect_id, organizationId]
        );
        if (prospectResult.rowCount === 1) {
          prospectName = prospectResult.rows[0].clinic_name || 'Unknown clinic';
        }
      }

      const identifiedProblems = parseList(audit.identified_problems).slice(0, 5);
      const recommendations = parseList(audit.recommendations).slice(0, 5);

      const areaFindings: AreaFinding[] = AREA_FIELDS
        .map((f) => ({ label: f.label, value: (audit[f.key] as string | null) || '' }))
        .filter((f) => f.value.trim());

      const areasReviewed = areaFindings.length;

      const nextActions: string[] = [];
      if (identifiedProblems.length > 0) {
        nextActions.push('Address identified problems');
      }
      if (recommendations.length > 0) {
        nextActions.push('Implement recommendations');
      }
      if (
        identifiedProblems.length === 0 &&
        recommendations.length === 0 &&
        areasReviewed === 0
      ) {
        nextActions.push('Complete additional audit areas');
      }

      const insufficientData =
        identifiedProblems.length === 0 &&
        recommendations.length === 0 &&
        areasReviewed === 0;

      const result: AuditSummaryResult = {
        auditId: audit.audit_id,
        prospectName,
        overallOpportunity: audit.overall_opportunity || 'N/A',
        areasReviewed,
        weaknessesCount: identifiedProblems.length,
        recommendationsCount: recommendations.length,
        identifiedProblems,
        recommendations,
        areaFindings: areaFindings.slice(0, 6),
        nextActions,
        insufficientData,
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId, auditId },
        'audit-summary tool failed'
      );
      if (err instanceof NotFoundError) throw err;
      throw new Error(`audit-summary tool failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  },
};
