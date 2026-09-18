import { z } from 'zod';
import { getClient } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
} from '../../types/aiTools.js';

export const TOOL_ID = 'pipeline-diagnosis';

const contextSchema = z.object({});

export interface PipelineStage {
  name: string;
  count: number;
  pct: number;
}

export type Bottleneck = {
  from: string;
  to: string;
  dropoff: number;
} | null;

export interface PipelineDiagnosisResult {
  stages: PipelineStage[];
  bottleneck: Bottleneck;
  recommendation: string;
}

export const pipelineDiagnosisTool: AiToolDefinition = {
  id: TOOL_ID,
  name: 'Pipeline Diagnosis',
  description: 'Analyze the acquisition pipeline for bottlenecks',
  tenant_scope: 'org',
  required_context: [],
  human_review_required: false,
  context_schema: contextSchema,

  async execute(
    execContext: AiToolExecutionContext,
    _toolContext: AiToolContext
  ): Promise<PipelineDiagnosisResult> {
    const { organizationId } = execContext;
    const client = await getClient();

    try {
      const prospectsResult = await client.query<{
        id: string;
      }>(
        `SELECT id FROM prospects
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const auditsResult = await client.query<{
        prospect_id: string;
      }>(
        `SELECT prospect_id FROM audits
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const outreachResult = await client.query<{
        prospect_id: string;
        stage: string;
      }>(
        `SELECT prospect_id, stage FROM outreach
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const proposalsResult = await client.query<{
        prospect_id: string | null;
        status: string;
      }>(
        `SELECT prospect_id, status FROM proposals
         WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId]
      );

      const prospectsList = prospectsResult.rows;
      const auditsList = auditsResult.rows;
      const outreachList = outreachResult.rows;
      const proposalsList = proposalsResult.rows;

      const auditedProspectIds = new Set(
        auditsList.map((a) => a.prospect_id)
      );

      const stages: Record<string, number> = {
        'Not contacted': 0,
        Contacted: 0,
        Responded: 0,
        'Follow-up due': 0,
        Call: 0,
        Proposal: 0,
        Won: 0,
        Lost: 0,
      };

      for (const o of outreachList) {
        if (stages[o.stage] !== undefined) {
          stages[o.stage]++;
        }
      }

      const prospectsWithoutOutreach = prospectsList.filter(
        (p) =>
          !outreachList.some(
            (o) => o.prospect_id === p.id
          )
      );
      stages['Not contacted'] = prospectsWithoutOutreach.length;

      const sentProposals = proposalsList.filter((p) =>
        ['Sent', 'Accepted'].includes(p.status)
      ).length;
      stages['Proposal'] = Math.max(stages['Proposal'], sentProposals);

      const stageCounts = [
        { name: 'Prospects', count: prospectsList.length },
        {
          name: 'Audited',
          count: auditedProspectIds.size,
        },
        {
          name: 'Contacted',
          count:
            stages['Contacted'] +
            stages['Responded'] +
            stages['Follow-up due'] +
            stages['Call'] +
            stages['Proposal'] +
            stages['Won'] +
            stages['Lost'],
        },
        {
          name: 'Responded',
          count:
            stages['Responded'] +
            stages['Follow-up due'] +
            stages['Call'] +
            stages['Proposal'] +
            stages['Won'],
        },
        {
          name: 'Call',
          count: stages['Call'] + stages['Proposal'] + stages['Won'],
        },
        { name: 'Proposal', count: sentProposals },
        { name: 'Won', count: stages['Won'] },
      ];

      const maxCount = stageCounts[0].count;
      const withPct = stageCounts.map((s) => ({
        ...s,
        pct: maxCount > 0 ? Math.round((s.count / maxCount) * 100) : 0,
      }));

      let bottleneck: Bottleneck = null;
      let maxDropoff = 0;

      for (let i = 0; i < withPct.length - 1; i++) {
        const current = withPct[i];
        const next = withPct[i + 1];
        if (current.count > 0) {
          const dropoff = current.count - next.count;
          if (dropoff > maxDropoff) {
            maxDropoff = dropoff;
            bottleneck = {
              from: current.name,
              to: next.name,
              dropoff,
            };
          }
        }
      }

      let recommendation =
        'Pipeline is empty. Add prospects to see recommendations.';
      if (prospectsList.length > 0) {
        if (auditedProspectIds.size === 0) {
          recommendation =
            'No audits completed yet. Create audits for high-priority prospects to understand their challenges.';
        } else if (stages['Not contacted'] > prospectsList.length * 0.5) {
          recommendation =
            'Many prospects are not contacted. Prioritize outreach to audited prospects.';
        } else if (stages['Contacted'] > 0 && stages['Responded'] === 0) {
          recommendation =
            'No responses from contacted prospects. Review outreach approach and messaging.';
        } else if (bottleneck && bottleneck.dropoff > 3) {
          recommendation = `Biggest drop-off: ${bottleneck.from} → ${bottleneck.to}. Focus on improving this transition.`;
        } else if (sentProposals > 0 && stages['Won'] === 0) {
          recommendation =
            'Proposals are being sent but not converting. Review proposal quality and follow-up process.';
        } else if (stages['Won'] > 0) {
          recommendation =
            'Pipeline is converting to wins. Continue current approach and scale outreach.';
        } else {
          recommendation =
            'Pipeline is progressing well. Continue nurturing prospects through each stage.';
        }
      }

      const result: PipelineDiagnosisResult = {
        stages: withPct,
        bottleneck,
        recommendation,
      };

      return result;
    } catch (err) {
      logger.error(
        { err, toolId: TOOL_ID, organizationId },
        'pipeline-diagnosis tool failed'
      );
      throw err;
    } finally {
      client.release();
    }
  },
};
