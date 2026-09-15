import type { Lead, Message, Conversation, Appointment, Followup } from '@/types/entities';
import type { LeadStatus } from '@/types/status';

export interface LeadQualificationSuggestion {
  type: 'qualification';
  suggestedStatus: LeadStatus;
  reason: string;
}

export interface ReplyDraftSuggestion {
  type: 'reply';
  draft: string;
}

export interface FollowUpSuggestion {
  type: 'followup';
  action: string;
  timing: string;
  reason: string;
}

export interface NoShowRecoverySuggestion {
  type: 'recovery';
  message: string;
}

export interface AnalyticsInsight {
  type: 'insight';
  text: string;
}

export type AiSuggestion =
  | LeadQualificationSuggestion
  | ReplyDraftSuggestion
  | FollowUpSuggestion
  | NoShowRecoverySuggestion
  | AnalyticsInsight;

function lastMessage(messages: Message[]): Message | undefined {
  return [...messages].sort((a, b) => a.sent_at.localeCompare(b.sent_at)).pop();
}

function hasPositiveIntent(msg: Message | undefined): boolean {
  if (!msg) return false;
  const body = msg.body.toLowerCase();
  return (
    body.includes('yes') ||
    body.includes('available') ||
    body.includes('book') ||
    body.includes('schedule') ||
    body.includes('share') ||
    body.includes('interested')
  );
}

function hasQuestion(msg: Message | undefined): boolean {
  if (!msg) return false;
  return msg.body.includes('?');
}

export function suggestLeadQualification(lead: Lead, messages: Message[]): LeadQualificationSuggestion | null {
  if (lead.status === 'Qualified' || lead.status === 'Booked' || lead.status === 'Attended' || lead.status === 'Lost') {
    return null;
  }

  const last = lastMessage(messages);
  const clinicReplied = messages.some((m) => m.sender === 'clinic');
  const positive = hasPositiveIntent(last);
  const question = hasQuestion(last);

  if (positive && clinicReplied) {
    return {
      type: 'qualification',
      suggestedStatus: 'Qualified',
      reason: 'Lead responded positively after clinic outreach and expressed clear interest in proceeding.',
    };
  }

  if (question && !clinicReplied) {
    return {
      type: 'qualification',
      suggestedStatus: 'Contacted',
      reason: 'Lead asked a question but has not yet received a clinic response. Keep in Contacted until answered.',
    };
  }

  if (messages.length >= 2 && clinicReplied) {
    return {
      type: 'qualification',
      suggestedStatus: 'Qualified',
      reason: 'Conversation has multiple exchanges and the lead is engaged. Ready for qualification.',
    };
  }

  return null;
}

export function suggestReplyDraft(conversation: Conversation, messages: Message[]): ReplyDraftSuggestion | null {
  const last = lastMessage(messages);
  if (!last || last.sender !== 'lead') {
    return null;
  }

  const body = last.body.toLowerCase();

  if (body.includes('pricing') || body.includes('price') || body.includes('cost')) {
    return {
      type: 'reply',
      draft: 'Thanks for reaching out! Pricing depends on the specific treatment area. Could we schedule a quick consultation so we can give you an accurate estimate?',
    };
  }

  if (body.includes('available') || body.includes('slot') || body.includes('timing')) {
    return {
      type: 'reply',
      draft: 'Great! We have slots available this week. Would you prefer morning or afternoon? I can hold a time for you.',
    };
  }

  if (body.includes('book') || body.includes('appointment') || body.includes('schedule')) {
    return {
      type: 'reply',
      draft: 'Absolutely, I can help with that. Which doctor would you prefer, and do you have a date in mind?',
    };
  }

  if (body.includes('reminder')) {
    return {
      type: 'reply',
      draft: 'No problem at all. We will send you a reminder before your appointment. Is WhatsApp the best way to reach you?',
    };
  }

  return {
    type: 'reply',
    draft: 'Thank you for your message. Could you confirm which service you are interested in so I can assist you better?',
  };
}

export function suggestFollowUp(lead: Lead, appointments: Appointment[], followups: Followup[]): FollowUpSuggestion | null {
  if (lead.status === 'Lost' || lead.status === 'Attended') {
    return null;
  }

  const upcomingAppointments = appointments.filter((a) => a.status === 'Booked');
  const hasReminder = followups.some((f) => f.type === 'Reminder' && f.status === 'Scheduled');

  if (upcomingAppointments.length > 0 && !hasReminder) {
    return {
      type: 'followup',
      action: 'Send appointment reminder',
      timing: '1 day before appointment',
      reason: 'Lead has a booked appointment but no scheduled reminder. A reminder reduces no-show risk.',
    };
  }

  if (lead.status === 'New' || lead.status === 'Contacted') {
    return {
      type: 'followup',
      action: 'Follow up with lead',
      timing: 'Tomorrow morning',
      reason: 'Lead has not been contacted recently. A follow-up keeps engagement high.',
    };
  }

  if (lead.status === 'Qualified') {
    return {
      type: 'followup',
      action: 'Offer available time slots',
      timing: 'Today',
      reason: 'Lead is qualified but not yet booked. Sending available slots converts interest into an appointment.',
    };
  }

  return null;
}

export function suggestNoShowRecovery(appointment: Appointment, lead: Lead): NoShowRecoverySuggestion | null {
  if (appointment.status !== 'NoShow') {
    return null;
  }

  return {
    type: 'recovery',
    message: `Hi ${lead.service_interested}, we noticed you couldn't make your appointment. Would you like us to help find another convenient time?`,
  };
}

export function generateAnalyticsInsights(
  leads: Lead[],
  appointments: Appointment[],
  followups: Followup[],
  outcomes: { amount_inr: number }[],
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  const totalLeads = leads.length;
  const booked = leads.filter((l) => l.status === 'Booked' || l.status === 'Attended').length;
  const attended = leads.filter((l) => l.status === 'Attended').length;
  const noShows = appointments.filter((a) => a.status === 'NoShow').length;
  const totalAppointments = appointments.length;
  const whatsappLeads = leads.filter((l) => l.source.toLowerCase().includes('whatsapp')).length;
  const totalRevenue = outcomes.reduce((sum, o) => sum + o.amount_inr, 0);

  if (totalLeads > 0 && booked / totalLeads < 0.5) {
    insights.push({
      type: 'insight',
      text: `Only ${Math.round((booked / totalLeads) * 100)}% of enquiries reach the booked stage. Consider strengthening qualification and time-slot offers.`,
    });
  }

  if (totalAppointments > 0 && noShows / totalAppointments > 0.2) {
    insights.push({
      type: 'insight',
      text: `No-show rate is ${Math.round((noShows / totalAppointments) * 100)}%. Automated reminders and recovery follow-ups can improve attendance.`,
    });
  }

  if (whatsappLeads > 0 && whatsappLeads / totalLeads > 0.3) {
    insights.push({
      type: 'insight',
      text: `A large share of enquiries (${Math.round((whatsappLeads / totalLeads) * 100)}%) comes from WhatsApp. Ensure WhatsApp response times stay fast.`,
    });
  }

  if (attended > 0 && totalRevenue > 0) {
    insights.push({
      type: 'insight',
      text: `Revenue is being recorded from ${attended} attended appointment(s). Ensure attribution confidence is reviewed for each outcome.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: 'insight',
      text: 'Funnel data is still limited. Add more appointments and outcomes to generate meaningful insights.',
    });
  }

  return insights;
}
