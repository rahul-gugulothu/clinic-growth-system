import type { ToolDefinition, ToolContext, AIToolResult, PriorityClinicsResult } from '../types';

export const priorityClinicsTool: ToolDefinition = {
  id: 'priority-clinics',
  name: 'Priority Clinics',
  description: 'Get top prospects requiring attention',
  execute: (context: ToolContext): AIToolResult => {
    const { prospects, audits, outreach } = context.store;

    const prospectsList = Object.values(prospects) as {
      prospect_id: string;
      clinic_name: string;
      priority: string;
      updated_at: string;
      notes?: string;
    }[];

    const auditsList = Object.values(audits) as { prospect_id: string }[];
    const outreachList = Object.values(outreach) as {
      prospect_id: string;
      stage: string;
      next_action?: string;
      updated_at: string;
    }[];

    const auditedProspectIds = new Set(auditsList.map((a) => a.prospect_id));
    const outreachByProspect = new Map<string, typeof outreachList>();
    for (const o of outreachList) {
      if (!outreachByProspect.has(o.prospect_id)) {
        outreachByProspect.set(o.prospect_id, []);
      }
      outreachByProspect.get(o.prospect_id)!.push(o);
    }

    const scored = prospectsList.map((p) => {
      let score = 0;
      let stage = 'New';
      let reason = '';

      if (p.priority === 'High') score += 30;
      else if (p.priority === 'Medium') score += 15;

      const pOutreach = outreachByProspect.get(p.prospect_id) || [];
      if (pOutreach.length > 0) {
        const latest = pOutreach.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
        stage = latest.stage;
        if (latest.stage === 'Not contacted') {
          score += 25;
          reason = 'High priority but not contacted';
        } else if (latest.stage === 'Responded' || latest.stage === 'Follow-up due') {
          score += 20;
          reason = 'Responded, needs follow-up';
        } else if (latest.stage === 'Proposal') {
          score += 15;
          reason = 'Proposal sent, awaiting decision';
        } else if (latest.stage === 'Lost') {
          score -= 50;
        }
      } else {
        score += 20;
        reason = 'No outreach yet';
      }

      if (auditedProspectIds.has(p.prospect_id)) {
        score += 5;
      }

      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceUpdate > 3) score += 5;

      return { prospect: p, score, stage, reason };
    });

    scored.sort((a, b) => b.score - a.score);

    const top5 = scored.slice(0, 5).map((item) => {
      let nextAction = 'Create audit and start outreach';
      if (item.stage === 'Not contacted') {
        nextAction = 'Initiate outreach';
      } else if (item.stage === 'Responded' || item.stage === 'Follow-up due') {
        nextAction = 'Schedule call';
      } else if (item.stage === 'Call') {
        nextAction = 'Move to proposal stage';
      } else if (item.stage === 'Proposal') {
        nextAction = 'Follow up on proposal';
      } else if (item.stage === 'Won') {
        nextAction = 'Onboard clinic';
      } else if (item.stage === 'Lost') {
        nextAction = 'Re-engage or archive';
      }

      return {
        prospectId: item.prospect.prospect_id,
        clinicName: item.prospect.clinic_name,
        priority: item.prospect.priority,
        currentStage: item.stage,
        reason: item.reason || 'Standard priority',
        nextAction,
      };
    });

    const result: PriorityClinicsResult = { clinics: top5 };

    return {
      toolId: 'priority-clinics',
      toolName: 'Priority Clinics',
      resultType: 'priority_clinics',
      data: result,
    };
  },
};
