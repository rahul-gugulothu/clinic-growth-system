import type { ToolDefinition, ToolContext, AIToolResult, DraftMessageResult } from '../types';

export const draftWhatsAppTool: ToolDefinition = {
  id: 'draft-whatsapp',
  name: 'Draft WhatsApp',
  description: 'Generate a WhatsApp outreach message for a prospect',
  requiresProspect: true,
  execute: (context: ToolContext): AIToolResult => {
    if (!context.prospectId) {
      return {
        toolId: 'draft-whatsapp',
        toolName: 'Draft WhatsApp',
        resultType: 'error',
        data: { message: 'No prospect specified. Please select a prospect first.' },
      };
    }

    const { prospects, audits, outreach } = context.store;

    const prospect = (prospects as Record<string, {
      clinic_name: string;
      doctor_name: string;
      specialty: string;
      area: string;
      phone?: string;
      whatsapp_available?: boolean;
      booking_available?: boolean;
      google_rating?: number | null;
      review_count?: number | null;
      content_quality?: string;
      visible_advertising?: string;
    }>)[context.prospectId];

    if (!prospect) {
      return {
        toolId: 'draft-whatsapp',
        toolName: 'Draft WhatsApp',
        resultType: 'error',
        data: { message: `Prospect not found: ${context.prospectId}` },
      };
    }

    const prospectAudits = Object.values(audits).filter(
      (a: unknown) => (a as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { identified_problems?: string; overall_opportunity?: string }[];

    const prospectOutreach = Object.values(outreach).filter(
      (o: unknown) => (o as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { stage: string; next_action?: string }[];

    const latestAudit = prospectAudits[0];
    const latestOutreach = prospectOutreach[0];

    let reasoning = `Selected ${prospect.clinic_name}. `;
    if (latestOutreach) {
      reasoning += `Current stage: ${latestOutreach.stage}. `;
      if (latestOutreach.next_action) {
        reasoning += `Previous next action: ${latestOutreach.next_action}. `;
      }
    }
    if (latestAudit) {
      reasoning += `Audit opportunity: ${latestAudit.overall_opportunity || 'N/A'}.`;
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

    return {
      toolId: 'draft-whatsapp',
      toolName: 'Draft WhatsApp',
      resultType: 'draft_whatsapp',
      data: result,
      requiresHumanReview: true,
    };
  },
};
