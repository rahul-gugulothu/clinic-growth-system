import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'weekly-report';

const contextSchema = z.object({});

export interface WeeklyReportResult {
  generatedAt: string;
  prospectsResearched: number;
  auditsCompleted: number;
  outreachRecords: number;
  responsesReceived: number;
  callsHad: number;
  proposalsCreated: number;
  wins: number;
  pipelineValue: number;
  biggestBottleneck?: string;
  notableWins?: string[];
  recommendedFocus: string;
  insufficientData: boolean;
}

interface ProspectRow {
  id: string;
  clinic_name: string;
  created_at: string;
}

interface OutreachRow {
  id: string;
  prospect_id: string;
  stage: string;
  created_at: string;
  updated_at: string;
}

interface ProposalRow {
  id: string;
  prospect_id: string;
  status: string;
  price_inr: number | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  prospect_id: string;
  created_at: string;
}

const STAGE_ORDER = [
  'Not contacted',
  'Contacted',
  'Responded',
  'Follow-up due',
  'Call',
  'Proposal',
  'Won',
];

const RESPONSE_STAGES = ['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'];
const CALL_STAGES = ['Call', 'Proposal', 'Won'];
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function parseISO(dateStr: string): number {
  return new Date(dateStr).getTime();
}

export const weeklyReportTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Weekly Founder Report',
  description: 'Generate a structured weekly founder report',
  tenant_scope: 'org',
  required_context: [],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    _toolContext: AiToolContext
  ): Promise<WeeklyReportResult> {
    const { organizationId } = execContext;
    const client = await getClient();

    try {
      const now = Date.now();
      const oneWeekAgo = now - WINDOW_MS;

      const prospectsResult = await client.query<ProspectRow>(
        `SELECT id, clinic_name, created_at FROM prospects
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const auditsResult = await client.query<AuditRow>(
        `SELECT id, prospect_id, created_at FROM audits
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const outreachResult = await client.query<OutreachRow>(
        `SELECT id, prospect_id, stage, created_at, updated_at FROM outreach
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const proposalsResult = await client.query<ProposalRow>(
        `SELECT id, prospect_id, status, price_inr, created_at FROM proposals
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const prospectsList = prospectsResult.rows;
      const auditsList = auditsResult.rows;
      const outreachList = outreachResult.rows;
      const proposalsList = proposalsResult.rows;

      const isWithinWeek = (dateStr: string): boolean =>
        parseISO(dateStr) >= oneWeekAgo;

      const prospectsResearched = prospectsList.filter((p) =>
        isWithinWeek(p.created_at)
      ).length;

      const auditsCompleted = auditsList.filter((a) =>
        isWithinWeek(a.created_at)
      ).length;

      const outreachRecords = outreachList.filter((o) =>
        isWithinWeek(o.created_at)
      ).length;

      const responsesReceived = outreachList.filter(
        (o) =>
          RESPONSE_STAGES.includes(o.stage) && isWithinWeek(o.updated_at)
      ).length;

      const callsHad = outreachList.filter((o) => CALL_STAGES.includes(o.stage))
        .length;

      const proposalsCreated = proposalsList.filter((p) =>
        isWithinWeek(p.created_at)
      ).length;

      const wins = proposalsList.filter((p) => p.status === 'Accepted').length;

      const pipelineValue = proposalsList
        .filter((p) => p.status !== 'Lost')
        .reduce((sum, p) => sum + (p.price_inr || 0), 0);

      const stages: Record<string, number> = {};
      for (const o of outreachList) {
        stages[o.stage] = (stages[o.stage] || 0) + 1;
      }

      let biggestBottleneck: string | undefined;
      let maxDropoff = 0;
      for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
        const current = stages[STAGE_ORDER[i]] || 0;
        const next = stages[STAGE_ORDER[i + 1]] || 0;
        if (current > 0) {
          const dropoff = current - next;
          if (dropoff > maxDropoff) {
            maxDropoff = dropoff;
            biggestBottleneck = `${STAGE_ORDER[i]} -> ${STAGE_ORDER[i + 1]}`;
          }
        }
      }

      const wonProspectIds = proposalsList
        .filter((p) => p.status === 'Accepted')
        .map((p) => p.prospect_id);

      const notableWins = wonProspectIds.slice(0, 3).map((id) => {
        const p = prospectsList.find((pr) => pr.id === id);
        return p?.clinic_name || id;
      });

      let recommendedFocus = 'Add more prospects to the pipeline';
      if (prospectsList.length > 0 && auditsCompleted === 0) {
        recommendedFocus = 'Complete audits for high-priority prospects';
      } else if (auditsCompleted > 0 && outreachRecords < auditsCompleted) {
        recommendedFocus = 'Start outreach for recently audited prospects';
      } else if (outreachRecords > 0 && responsesReceived === 0) {
        recommendedFocus = 'Improve outreach messaging to get more responses';
      } else if (responsesReceived > 0 && callsHad === 0) {
        recommendedFocus =
          'Schedule and conduct discovery calls with responding prospects';
      } else if (callsHad > 0 && proposalsCreated === 0) {
        recommendedFocus = 'Convert calls into proposals';
      } else if (wins > 0) {
        recommendedFocus = 'Onboard new clients and request referrals';
      }

      const insufficientData = prospectsList.length === 0;

      const result: WeeklyReportResult = {
        generatedAt: new Date().toISOString(),
        prospectsResearched,
        auditsCompleted,
        outreachRecords,
        responsesReceived,
        callsHad,
        proposalsCreated,
        wins,
        pipelineValue,
        biggestBottleneck,
        notableWins: notableWins.length > 0 ? notableWins : undefined,
        recommendedFocus,
        insufficientData,
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId },
        'weekly-report tool failed'
      );
      throw err;
    } finally {
      client.release();
    }
  },
};