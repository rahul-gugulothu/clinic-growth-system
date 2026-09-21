import type { ToolDefinition, ToolContext, AIToolResult, ToolResultType } from '../types';
import { priorityClinicsTool } from './priorityClinics';
import { prospectSummaryTool } from './prospectSummary';
import { draftWhatsAppTool } from './draftWhatsApp';
import { draftEmailTool } from './draftEmail';
import { callPreparationTool } from './callPreparation';
import { generateProposalTool } from './generateProposal';
import { pipelineDiagnosisTool } from './pipelineDiagnosis';
import { workPlannerTool } from './workPlanner';
import { weeklyReportTool } from './weeklyReport';
import { growthOpportunitiesTool } from './growthOpportunities';
import { auditSummaryTool } from './auditSummary';

export const ALL_TOOLS: ToolDefinition[] = [
  priorityClinicsTool,
  prospectSummaryTool,
  draftWhatsAppTool,
  draftEmailTool,
  callPreparationTool,
  generateProposalTool,
  pipelineDiagnosisTool,
  workPlannerTool,
  weeklyReportTool,
  growthOpportunitiesTool,
  auditSummaryTool,
];

export const TOOL_BY_ID: Record<string, ToolDefinition> = Object.fromEntries(
  ALL_TOOLS.map((t) => [t.id, t]),
);

export function executeTool(toolId: string, context: ToolContext): AIToolResult {
  const tool = TOOL_BY_ID[toolId];
  if (!tool) {
    return {
      toolId: 'error',
      toolName: 'Error',
      resultType: 'error',
      data: { message: `Tool not found: ${toolId}` },
    };
  }
  try {
    return tool.execute(context);
  } catch (error) {
    return {
      toolId: tool.id,
      toolName: tool.name,
      resultType: 'error',
      data: { message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

export function resolveToolFromIntent(
  userMessage: string,
  _context?: { prospectId?: string; prospectName?: string },
): string | null {
  const msg = userMessage.toLowerCase();

  if (
    msg.includes('follow-up') ||
    msg.includes('followup') ||
    msg.includes('priorit') ||
    msg.includes('urgent') ||
    msg.includes('important')
  ) {
    return 'priority-clinics';
  }

  if (
    (msg.includes('summarize') || msg.includes('summary')) &&
    (msg.includes('dr.') || msg.includes('clinic') || msg.includes('prospect'))
  ) {
    return 'prospect-summary';
  }

  if (
    msg.includes('whatsapp') &&
    (msg.includes('draft') || msg.includes('write') || msg.includes('message'))
  ) {
    return 'draft-whatsapp';
  }

  if (
    msg.includes('email') &&
    (msg.includes('draft') || msg.includes('write'))
  ) {
    return 'draft-email';
  }

  if (
    (msg.includes('call') || msg.includes('phone')) &&
    (msg.includes('prepar') || msg.includes('talk') || msg.includes('discussion'))
  ) {
    return 'call-preparation';
  }

  if (
    msg.includes('proposal') &&
    (msg.includes('generat') || msg.includes('draft') || msg.includes('create'))
  ) {
    return 'generate-proposal';
  }

  if (
    msg.includes('pipeline') &&
    (msg.includes('diagnos') || msg.includes('bottleneck') || msg.includes('weak') || msg.includes('issue'))
  ) {
    return 'pipeline-diagnosis';
  }

  if (
    msg.includes('plan') ||
    msg.includes('work') ||
    msg.includes('todo') ||
    msg.includes('agenda') ||
    msg.includes('today')
  ) {
    return 'work-planner';
  }

  if (
    msg.includes('week') ||
    msg.includes('report') ||
    msg.includes('summary')
  ) {
    return 'weekly-report';
  }

  if (
    msg.includes('growth') ||
    msg.includes('opportunit') ||
    msg.includes('improv')
  ) {
    return 'growth-opportunities';
  }

  if (
    msg.includes('audit') ||
    msg.includes('explain') ||
    msg.includes('weakness') ||
    msg.includes('recommendation')
  ) {
    return 'audit-summary';
  }

  return null;
}

export function getToolForPrompt(
  prompt: string,
  context: { prospectId?: string; prospectName?: string },
): string | null {
  const toolIdFromIntent = resolveToolFromIntent(prompt, context);
  if (toolIdFromIntent) {
    return toolIdFromIntent;
  }

  const promptLower = prompt.toLowerCase();

  if (promptLower.includes('morning brief')) return 'work-planner';
  if (promptLower.includes('priority clinic')) return 'priority-clinics';
  if (promptLower.includes('prospect summary')) return 'prospect-summary';
  if (promptLower.includes('draft whatsapp')) return 'draft-whatsapp';
  if (promptLower.includes('draft email')) return 'draft-email';
  if (promptLower.includes('call preparation')) return 'call-preparation';
  if (promptLower.includes('generate proposal') || promptLower.includes('proposal draft')) return 'generate-proposal';
  if (promptLower.includes('pipeline diagnosis') || promptLower.includes('pipeline')) return 'pipeline-diagnosis';
  if (promptLower.includes('work planner') || promptLower.includes('today')) return 'work-planner';
  if (promptLower.includes('weekly report')) return 'weekly-report';
  if (promptLower.includes('growth opportunit')) return 'growth-opportunities';
  if (promptLower.includes('audit') || promptLower.includes('explain growth')) return 'audit-summary';

  return null;
}

export function resolveProspectFromMessage(
  userMessage: string,
  prospects: Record<string, { clinic_name: string; doctor_name: string; prospect_id: string }>,
): { prospectId: string; prospectName: string } | null {
  const msg = userMessage.toLowerCase();

  for (const p of Object.values(prospects)) {
    const nameLower = p.clinic_name.toLowerCase();
    const doctorLower = p.doctor_name.toLowerCase();

    const clinicWords = nameLower.split(' ');
    const doctorWords = doctorLower.split(' ');

    for (const word of clinicWords) {
      if (word.length > 3 && msg.includes(word)) {
        return { prospectId: p.prospect_id, prospectName: p.clinic_name };
      }
    }

    for (const word of doctorWords) {
      if (word.length > 3 && msg.includes(word)) {
        return { prospectId: p.prospect_id, prospectName: p.clinic_name };
      }
    }
  }

  return null;
}

export { priorityClinicsTool, prospectSummaryTool, draftWhatsAppTool, draftEmailTool, callPreparationTool, generateProposalTool, pipelineDiagnosisTool, workPlannerTool, weeklyReportTool, growthOpportunitiesTool, auditSummaryTool };

export const TOOL_RESULT_TYPE_MAP: Record<string, ToolResultType> = {
  'priority-clinics': 'priority_clinics',
  'prospect-summary': 'prospect_summary',
  'draft-whatsapp': 'draft_whatsapp',
  'draft-email': 'draft_email',
  'call-preparation': 'call_preparation',
  'generate-proposal': 'proposal_draft',
  'pipeline-diagnosis': 'pipeline_diagnosis',
  'work-planner': 'work_planner',
  'weekly-report': 'weekly_report',
  'growth-opportunities': 'growth_opportunities',
  'audit-summary': 'audit_summary',
};

export function getToolResultType(toolId: string): ToolResultType {
  return TOOL_RESULT_TYPE_MAP[toolId] ?? 'text';
}
