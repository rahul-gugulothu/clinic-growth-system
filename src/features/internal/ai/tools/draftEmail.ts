import type { ToolDefinition, ToolContext, AIToolResult, DraftMessageResult } from '../types';

export const draftEmailTool: ToolDefinition = {
  id: 'draft-email',
  name: 'Draft Email',
  description: 'Generate a professional email for clinic outreach',
  requiresProspect: true,
  execute: (context: ToolContext): AIToolResult => {
    if (!context.prospectId) {
      return {
        toolId: 'draft-email',
        toolName: 'Draft Email',
        resultType: 'error',
        data: { message: 'No prospect specified. Please select a prospect first.' },
      };
    }

    const { prospects, audits } = context.store;

    const prospect = (prospects as Record<string, {
      clinic_name: string;
      doctor_name: string;
      specialty: string;
      area: string;
      website?: string;
      booking_available?: boolean;
      whatsapp_available?: boolean;
      google_rating?: number | null;
      review_count?: number | null;
      content_quality?: string;
      visible_advertising?: string;
    }>)[context.prospectId];

    if (!prospect) {
      return {
        toolId: 'draft-email',
        toolName: 'Draft Email',
        resultType: 'error',
        data: { message: `Prospect not found: ${context.prospectId}` },
      };
    }

    const prospectAudits = Object.values(audits).filter(
      (a: unknown) => (a as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { identified_problems?: string; overall_opportunity?: string }[];

    const latestAudit = prospectAudits[0];

    const subject = `Growth Opportunity for ${prospect.clinic_name}`;

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
      const problems = latestAudit.identified_problems
        ?.split('\n')
        .filter(Boolean)
        .slice(0, 2)
        .join('; ') || 'various operational areas';

      body += `I recently reviewed ${prospect.clinic_name} and wanted to share observations about ${problems}.\n\n`;
      body += `At Clinic Growth, we work with dermatology and aesthetic clinics on:\n\n`;
      body += `• Qualified enquiry growth\n`;
      body += `• Digital presence and review management\n`;
      body += `• Patient communication automation\n`;
      body += `• Appointment and follow-up workflows\n\n`;

      if (latestAudit.overall_opportunity === 'High') {
        body += `Based on this review, there appears to be meaningful potential to discuss. I'd love to share more details in a brief call.\n\n`;
      } else {
        body += `I'd be happy to discuss how these areas might apply to your clinic.\n\n`;
      }
    } else {
      body += `I came across ${factSummary} and wanted to reach out.\n\n`;
      body += `At Clinic Growth, we partner with dermatology and aesthetic clinics on:\n\n`;
      body += `• Qualified enquiry growth\n`;
      body += `• Digital presence and review management\n`;
      body += `• Patient communication automation\n`;
      body += `• Appointment and follow-up workflows\n\n`;
      body += `I'd be happy to share how these services could fit your clinic.\n\n`;
    }

    body += `Would you be available for a 15-minute call this week?\n\n`;
    body += `Best regards,\n`;
    body += `Clinic Growth Team`;

    let reasoning = `Generated email for ${prospect.clinic_name} (${prospect.specialty}). `;
    if (latestAudit) {
      reasoning += `Referencing verified audit findings: ${(latestAudit.identified_problems || 'General growth').slice(0, 100)}.`;
    } else {
      reasoning += 'No audit data available, using general outreach template without clinic-specific claims.';
    }

    const result: DraftMessageResult = {
      channel: 'Email',
      recipient: `${prospect.doctor_name} - ${prospect.clinic_name}`,
      draftText: `Subject: ${subject}\n\n${body}`,
      reasoning,
    };

    return {
      toolId: 'draft-email',
      toolName: 'Draft Email',
      resultType: 'draft_email',
      data: result,
      requiresHumanReview: true,
    };
  },
};
