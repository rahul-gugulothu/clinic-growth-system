import type { ToolDefinition, ToolContext, AIToolResult, WeeklyReportResult } from '../types';

export const weeklyReportTool: ToolDefinition = {
  id: 'weekly-report',
  name: 'Weekly Founder Report',
  description: 'Generate a structured weekly summary',
  execute: (context: ToolContext): AIToolResult => {
    const { prospects, audits, outreach, proposals } = context.store;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const prospectsList = Object.values(prospects) as {
      created_at: string;
      prospect_id: string;
      clinic_name: string;
    }[];
    const auditsList = Object.values(audits) as { created_at: string; prospect_id: string }[];
    const outreachList = Object.values(outreach) as {
      updated_at: string;
      created_at: string;
      prospect_id: string;
      stage: string;
    }[];
    const proposalsList = Object.values(proposals) as {
      created_at: string;
      status: string;
      price_inr?: number;
      prospect_id: string;
    }[];

    const isWithinWeek = (dateStr: string) => new Date(dateStr) >= oneWeekAgo;

    const prospectsResearched = prospectsList.filter((p) =>
      isWithinWeek(p.created_at),
    ).length;

    const auditsCompleted = auditsList.filter((a) =>
      isWithinWeek(a.created_at),
    ).length;

    const outreachRecords = outreachList.filter((o) =>
      isWithinWeek(o.created_at),
    ).length;

    const responsesReceived = outreachList.filter((o) =>
      ['Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'].includes(o.stage) &&
      isWithinWeek(o.updated_at),
    ).length;

    const callsHad = outreachList.filter((o) =>
      ['Call', 'Proposal', 'Won'].includes(o.stage),
    ).length;

    const proposalsCreated = proposalsList.filter((p) =>
      isWithinWeek(p.created_at),
    ).length;

    const wins = proposalsList.filter((p) =>
      p.status === 'Accepted',
    ).length;

    const pipelineValue = proposalsList
      .filter((p) => p.status !== 'Lost')
      .reduce((sum, p) => sum + (p.price_inr || 0), 0);

    const stages: Record<string, number> = {};
    for (const o of outreachList) {
      stages[o.stage] = (stages[o.stage] || 0) + 1;
    }

    let biggestBottleneck: string | undefined;
    let maxDropoff = 0;
    const stageOrder = ['Not contacted', 'Contacted', 'Responded', 'Follow-up due', 'Call', 'Proposal', 'Won'];
    for (let i = 0; i < stageOrder.length - 1; i++) {
      const current = stages[stageOrder[i]] || 0;
      const next = stages[stageOrder[i + 1]] || 0;
      if (current > 0 && current - next > maxDropoff) {
        maxDropoff = current - next;
        biggestBottleneck = `${stageOrder[i]} → ${stageOrder[i + 1]}`;
      }
    }

    const wonProspectIds = proposalsList
      .filter((p) => p.status === 'Accepted')
      .map((p) => p.prospect_id);
    const notableWins = wonProspectIds.slice(0, 3).map((id) => {
      const p = prospectsList.find((pr) => pr.prospect_id === id);
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
      recommendedFocus = 'Schedule and conduct discovery calls with responding prospects';
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

    return {
      toolId: 'weekly-report',
      toolName: 'Weekly Founder Report',
      resultType: 'weekly_report',
      data: result,
    };
  },
};
