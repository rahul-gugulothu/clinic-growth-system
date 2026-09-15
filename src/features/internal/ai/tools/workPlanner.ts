import type { ToolDefinition, ToolContext, AIToolResult, WorkPlannerResult } from '../types';

export const workPlannerTool: ToolDefinition = {
  id: 'work-planner',
  name: "Today's Work Planner",
  description: 'Generate a prioritized work plan for today',
  execute: (context: ToolContext): AIToolResult => {
    const { prospects, audits, outreach, proposals, clinics } = context.store;

    const prospectsList = Object.values(prospects) as {
      prospect_id: string;
      clinic_name: string;
      priority: string;
    }[];

    const auditsList = Object.values(audits) as { prospect_id: string }[];
    const outreachList = Object.values(outreach) as {
      prospect_id: string;
      stage: string;
      next_action?: string;
      next_action_at?: string | null;
    }[];
    const proposalsList = Object.values(proposals) as {
      prospect_id: string;
      status: string;
      price_inr?: number;
    }[];
    const clinicsList = Object.values(clinics) as { prospect_id: string | null }[];

    const auditedProspectIds = new Set(auditsList.map((a) => a.prospect_id));

    const doNow: { task: string; reason: string }[] = [];
    const doToday: { task: string; reason: string }[] = [];
    const optional: { task: string; reason: string }[] = [];

    const today = new Date().toISOString().split('T')[0];
    const overdueFollowups = outreachList.filter(
      (o) => o.stage === 'Follow-up due' || (o.next_action_at && o.next_action_at < today),
    );
    for (const o of overdueFollowups.slice(0, 3)) {
      doNow.push({
        task: `Follow up with ${o.prospect_id}`,
        reason: o.next_action || 'Follow-up is overdue',
      });
    }

    const awaitingProposals = proposalsList.filter((p) => p.status === 'Sent');
    for (const _p of awaitingProposals.slice(0, 2)) {
      doNow.push({
        task: `Follow up on proposal`,
        reason: 'Proposal awaiting decision',
      });
    }

    const highPriorityNotAudited = prospectsList.filter(
      (p) => p.priority === 'High' && !auditedProspectIds.has(p.prospect_id),
    );
    for (const p of highPriorityNotAudited.slice(0, 2)) {
      doNow.push({
        task: `Audit ${p.clinic_name}`,
        reason: 'High priority prospect without audit',
      });
    }

    const acceptedNotOnboarded = proposalsList.filter(
      (p) => p.status === 'Accepted',
    );
    const onboardedProspectIds = new Set(clinicsList.map((c) => c.prospect_id).filter(Boolean));
    for (const p of acceptedNotOnboarded) {
      if (p.prospect_id && !onboardedProspectIds.has(p.prospect_id)) {
        doNow.push({
          task: `Onboard clinic from proposal`,
          reason: 'Accepted proposal awaiting onboarding',
        });
      }
    }

    const respondedNotMoved = outreachList.filter((o) => o.stage === 'Responded');
    for (const o of respondedNotMoved.slice(0, 2)) {
      doToday.push({
        task: `Schedule call with ${o.prospect_id}`,
        reason: 'Prospect has responded',
      });
    }

    const contactedNotResponded = outreachList.filter((o) => o.stage === 'Contacted');
    for (const o of contactedNotResponded.slice(0, 3)) {
      doToday.push({
        task: `Follow up with ${o.prospect_id}`,
        reason: 'Awaiting response',
      });
    }

    const draftProposals = proposalsList.filter((p) => p.status === 'Draft');
    for (const _p of draftProposals.slice(0, 2)) {
      doToday.push({
        task: `Finalize proposal draft`,
        reason: 'Proposal in draft status',
      });
    }

    const highPriorityNoOutreach = prospectsList.filter(
      (p) => p.priority === 'High' && !outreachList.some((o) => o.prospect_id === p.prospect_id),
    );
    for (const p of highPriorityNoOutreach.slice(0, 3)) {
      optional.push({
        task: `Start outreach to ${p.clinic_name}`,
        reason: 'High priority prospect not contacted',
      });
    }

    const mediumPriority = prospectsList.filter((p) => p.priority === 'Medium');
    for (const p of mediumPriority.slice(0, 3)) {
      optional.push({
        task: `Research ${p.clinic_name}`,
        reason: 'Medium priority prospect',
      });
    }

    const result: WorkPlannerResult = {
      doNow: doNow.slice(0, 5),
      doToday: doToday.slice(0, 5),
      optional: optional.slice(0, 5),
    };

    return {
      toolId: 'work-planner',
      toolName: "Today's Work Planner",
      resultType: 'work_planner',
      data: result,
    };
  },
};
