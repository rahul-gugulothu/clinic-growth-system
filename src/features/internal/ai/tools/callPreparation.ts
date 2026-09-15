import type { ToolDefinition, ToolContext, AIToolResult, CallPrepResult } from '../types';

export const callPreparationTool: ToolDefinition = {
  id: 'call-preparation',
  name: 'Call Preparation',
  description: 'Prepare for a discovery call with a prospect',
  requiresProspect: true,
  execute: (context: ToolContext): AIToolResult => {
    if (!context.prospectId) {
      return {
        toolId: 'call-preparation',
        toolName: 'Call Preparation',
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
      website?: string;
      google_rating?: number | null;
      review_count?: number | null;
      booking_available?: boolean;
      whatsapp_available?: boolean;
      content_quality?: string;
      notes?: string;
    }>)[context.prospectId];

    if (!prospect) {
      return {
        toolId: 'call-preparation',
        toolName: 'Call Preparation',
        resultType: 'error',
        data: { message: `Prospect not found: ${context.prospectId}` },
      };
    }

    const prospectAudits = Object.values(audits).filter(
      (a: unknown) => (a as { prospect_id: string }).prospect_id === context.prospectId,
    ) as {
      identified_problems?: string;
      recommendations?: string;
      google_presence?: string;
      enquiry_process?: string;
      competitors?: string;
    }[];

    const prospectOutreach = Object.values(outreach).filter(
      (o: unknown) => (o as { prospect_id: string }).prospect_id === context.prospectId,
    ) as { stage: string; channel?: string; response?: string }[];

    const latestOutreach = prospectOutreach[0];
    const latestAudit = prospectAudits[0];

    const objective = `Understand ${prospect.clinic_name}'s current challenges and growth priorities`;

    const clinicContext = [
      `${prospect.specialty} clinic in ${prospect.area}`,
      prospect.google_rating ? `Google rating: ${prospect.google_rating}/5 (${prospect.review_count || 0} reviews)` : 'No Google presence detected',
      prospect.website ? `Website: ${prospect.website}` : 'No website found',
      prospect.booking_available ? 'Online booking available' : 'No online booking',
      prospect.whatsapp_available ? 'WhatsApp available' : 'No WhatsApp for appointments',
      `Content quality: ${prospect.content_quality || 'Unknown'}`,
    ].join('. ');

    const auditFindings: string[] = [];
    if (latestAudit) {
      if (latestAudit.google_presence) auditFindings.push(`Google presence: ${latestAudit.google_presence}`);
      if (latestAudit.enquiry_process) auditFindings.push(`Enquiry process: ${latestAudit.enquiry_process}`);
      if (latestAudit.identified_problems) {
        const problems = latestAudit.identified_problems.split('\n').filter(Boolean);
        problems.slice(0, 3).forEach((p) => auditFindings.push(`Problem: ${p}`));
      }
      if (latestAudit.competitors) auditFindings.push(`Competitors: ${latestAudit.competitors.slice(0, 100)}`);
    } else {
      auditFindings.push('No audit data available - rely on conversation to understand challenges');
    }

    const discussionPoints: string[] = [
      'Current patient acquisition channels',
      'Biggest challenges with patient bookings',
      'Existing digital marketing efforts',
      'Staff capacity for patient follow-up',
      'Goals for the next quarter',
    ];

    const questionsToAsk: string[] = [
      'What percentage of bookings come through your website vs phone?',
      'How do you currently handle appointment reminders?',
      'What is your biggest frustration with patient no-shows?',
      'Have you tried any digital marketing before?',
      'What would a 30% increase in enquiries mean for your practice?',
    ];

    const suggestedNextStep = latestOutreach?.stage === 'Responded'
      ? 'Schedule discovery call and share calendar link'
      : latestOutreach?.stage === 'Call'
        ? 'Confirm call time and prepare presentation'
        : 'Move prospect to Call stage and schedule meeting';

    const result: CallPrepResult = {
      objective,
      clinicContext,
      auditFindings,
      discussionPoints,
      questionsToAsk,
      suggestedNextStep,
    };

    return {
      toolId: 'call-preparation',
      toolName: 'Call Preparation',
      resultType: 'call_preparation',
      data: result,
    };
  },
};
