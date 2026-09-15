import { useNavigate, useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  UserCheck,
  UserX,
  Phone,
  Sparkles,
  Send,
  Clock,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useStore,
  selectLeadById,
  selectConversationsByLead,
  selectAppointmentsByLead,
  selectFollowupsByLead,
  selectDoctorsByClinic,
  selectMessagesByConversation,
  selectOutcomesByAppointment,
} from '@/store';
import { LEAD_STATUSES, type LeadStatus } from '@/types/status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { suggestLeadQualification, suggestFollowUp, suggestReplyDraft } from '@/lib/aiSuggestions';
import AiSuggestionPanel from '@/components/AiSuggestionPanel';

function statusTone(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info' {
  switch (status) {
    case 'New':
      return 'info';
    case 'Contacted':
      return 'default';
    case 'Qualified':
      return 'success';
    case 'Booked':
      return 'info';
    case 'Attended':
      return 'success';
    case 'Lost':
      return 'muted';
    case 'NoShow':
      return 'warning';
    case 'Cancelled':
      return 'destructive';
    default:
      return 'default';
  }
}

export default function LeadDetailPage() {
  const { leadId = '' } = useParams();
  const navigate = useNavigate();
  const lead = useStore(selectLeadById(leadId));
  const conversations = useStore(selectConversationsByLead(leadId));
  const appointments = useStore(selectAppointmentsByLead(leadId));
  const followups = useStore(selectFollowupsByLead(leadId));
  const allMessages = useStore((s) => {
    if (!conversations) return [];
    return conversations.flatMap((c) => selectMessagesByConversation(c.conversation_id)(s));
  });
  const setLeadStatus = useStore((s) => s.setLeadStatus);
  const addAppointment = useStore((s) => s.addAppointment);
  const addFollowup = useStore((s) => s.addFollowup);
  const addMessage = useStore((s) => s.addMessage);
  const clinic = useStore((s) => {
    const leads = s.leads;
    const l = leads[leadId];
    if (!l) return undefined;
    return s.clinics[l.clinic_id];
  });
  const doctors = useStore((s) => (clinic ? selectDoctorsByClinic(clinic.clinic_id)(s) : []));
  const assignedStaff = useStore((s) => (lead?.assigned_staff_id ? s.staff[lead.assigned_staff_id] : undefined));

  const [showBook, setShowBook] = useState(false);
  const [bookDoctorId, setBookDoctorId] = useState('');
  const [bookWhen, setBookWhen] = useState('');
  const [showQualifySuggestion, setShowQualifySuggestion] = useState(false);
  const [showFollowUpSuggestion, setShowFollowUpSuggestion] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [showReplyDraft, setShowReplyDraft] = useState(false);
  const [draftText, setDraftText] = useState('');

  const latestConversation = conversations[0];
  const latestAppointment = appointments[0];
  const latestFollowup = followups[0];
  const primaryConversation = latestConversation ? conversations.find((c) => c.conversation_id === latestConversation.conversation_id) : undefined;
  const conversationMessages = useStore((s) => {
    if (!primaryConversation) return [];
    return selectMessagesByConversation(primaryConversation.conversation_id)(s);
  });

  const qualificationSuggestion = suggestLeadQualification(lead, allMessages);
  const followUpSuggestion = suggestFollowUp(lead, appointments, followups);
  const replyDraftSuggestion = primaryConversation ? suggestReplyDraft(primaryConversation, conversationMessages) : null;

  if (!lead) {
    return (
      <div className="p-6">
        <p className="text-sm">Lead not found.</p>
        <Button asChild variant="link">
          <Link to="/clinic/leads">Back to leads</Link>
        </Button>
      </div>
    );
  }

  const qualify = () => {
    try {
      setLeadStatus(lead.lead_id, 'Qualified');
      toast.success('Lead qualified');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const book = () => {
    if (!bookDoctorId || !bookWhen) {
      toast.error('Select a doctor and date/time.');
      return;
    }
    try {
      const aptId = addAppointment({
        lead_id: lead.lead_id,
        doctor_id: bookDoctorId,
        scheduled_at: new Date(bookWhen).toISOString(),
      });
      addFollowup({
        lead_id: lead.lead_id,
        appointment_id: aptId,
        type: 'Reminder',
        scheduled_at: new Date(bookWhen).toISOString(),
        channel: 'WhatsApp',
      });
      toast.success('Appointment booked with reminder');
      setShowBook(false);
      setBookWhen('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to book');
    }
  };

  const markLost = () => {
    try {
      setLeadStatus(lead.lead_id, 'Lost');
      toast.success('Lead marked as lost');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const sendReply = () => {
    if (!replyBody.trim() || !primaryConversation) return;
    addMessage({
      conversation_id: primaryConversation.conversation_id,
      sender: 'clinic',
      body: replyBody.trim(),
    });
    setReplyBody('');
    setShowReplyDraft(false);
    setDraftText('');
    toast.success('Reply sent');
  };

  const nextAction = (() => {
    switch (lead.status) {
      case 'New':
      case 'Contacted':
        return { label: 'Reply to lead', href: '#composer' };
      case 'Qualified':
        return { label: 'Book appointment', href: '#book' };
      case 'Booked':
        return { label: 'View appointment', href: latestAppointment ? '#appointment' : '#book' };
      case 'Attended':
        return { label: 'Schedule follow-up', href: '#followup' };
      case 'Lost':
        return null;
      default:
        return null;
    }
  })();

  const activityItems = (() => {
    const items: { id: string; label: string; date: string; href?: string }[] = [];

    items.push({
      id: 'created',
      label: `Enquiry created · ${lead.service_interested}`,
      date: lead.created_at,
    });

    if (primaryConversation) {
      items.push({
        id: 'conversation',
        label: `Conversation started via ${primaryConversation.channel}`,
        date: primaryConversation.started_at,
        href: `/clinic/conversations?lead=${lead.lead_id}`,
      });
    }

    const lastMsg = conversationMessages[conversationMessages.length - 1];
    if (lastMsg) {
      items.push({
        id: 'last-msg',
        label: `Latest message: ${lastMsg.sender === 'clinic' ? 'You' : 'Lead'} — "${lastMsg.body.slice(0, 60)}${lastMsg.body.length > 60 ? '...' : ''}"`,
        date: lastMsg.sent_at,
      });
    }

    if (latestAppointment) {
      const doctor = doctors.find((d) => d.doctor_id === latestAppointment.doctor_id);
      items.push({
        id: 'appointment',
        label: `Appointment ${latestAppointment.status.toLowerCase()}${doctor ? ` with ${doctor.name}` : ''}`,
        date: latestAppointment.scheduled_at,
        href: '/clinic/appointments',
      });
    }

    if (latestFollowup) {
      items.push({
        id: 'followup',
        label: `${latestFollowup.type} follow-up ${latestFollowup.status.toLowerCase()}`,
        date: latestFollowup.scheduled_at,
        href: '/clinic/follow-ups',
      });
    }

    const appointmentOutcomes = appointments.flatMap((a) => selectOutcomesByAppointment(a.appointment_id)(useStore.getState()));
    if (appointmentOutcomes.length > 0) {
      const outcome = appointmentOutcomes[0];
      items.push({
        id: 'outcome',
        label: `Outcome recorded: ₹${outcome.amount_inr.toLocaleString('en-IN')}`,
        date: outcome.recorded_at,
        href: '/clinic/analytics',
      });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  return (
    <div className="space-y-6 p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/clinic/leads')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to leads
      </Button>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lead {lead.lead_id}</h1>
            <p className="text-sm text-muted-foreground">
              {lead.source} · {lead.service_interested}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>
            <Select
              value={lead.status}
              onChange={(e) => {
                const next = e.target.value as LeadStatus;
                try {
                  setLeadStatus(lead.lead_id, next);
                  toast.success(`Status updated to ${next}`);
                } catch (err: any) {
                  toast.error(err?.message ?? 'Invalid transition');
                }
              }}
              className="h-9 w-36"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>Assigned: {assignedStaff?.name ?? 'Unassigned'}</span>
          <span>·</span>
          <span>Created: {fmtDate(lead.created_at)}</span>
          {lead.last_contact_at && (
            <>
              <span>·</span>
              <span>Last contact: {fmtDate(lead.last_contact_at)}</span>
            </>
          )}
          <span>·</span>
          <span>Next action: {lead.next_action}</span>
        </div>
      </div>

      {nextAction && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Next: {nextAction.label}</span>
            </div>
            {nextAction.href?.startsWith('#') ? (
              <Button size="sm" onClick={() => {
                const el = document.getElementById(nextAction.href.replace('#', ''));
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}>
                {lead.status === 'Qualified' ? 'Book now' : lead.status === 'Booked' ? 'View appointment' : 'Reply'}
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to={nextAction.href ?? '#'}>{nextAction.label}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <Card id="composer">
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {primaryConversation ? (
                <>
                  <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
                    {conversationMessages.map((m) => (
                      <div
                        key={m.message_id}
                        className={`flex ${m.sender === 'clinic' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.sender === 'clinic'
                              ? 'bg-muted text-foreground'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          <div className="text-xs text-muted-foreground mb-1">
                            {m.sender === 'clinic' ? 'You' : 'Lead'} · {fmtDateTime(m.sent_at)}
                          </div>
                          <div>{m.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {showReplyDraft && replyDraftSuggestion && (
                    <AiSuggestionPanel
                      title="AI reply drafting"
                      onDismiss={() => setShowReplyDraft(false)}
                      acceptLabel="Use draft"
                      onAccept={() => {
                        setReplyBody(draftText || replyDraftSuggestion.draft);
                        setShowReplyDraft(false);
                        toast.success('Draft placed in composer');
                      }}
                    >
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">AI-generated reply. You can edit it before sending.</p>
                        <Textarea
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          className="min-h-[100px] text-sm"
                        />
                      </div>
                    </AiSuggestionPanel>
                  )}

                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Type a reply..."
                      className="min-h-[80px] text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={sendReply} disabled={!replyBody.trim()}>
                        <Send className="mr-2 h-3 w-3" /> Send
                      </Button>
                      {!showReplyDraft && replyDraftSuggestion && (
                        <Button size="sm" variant="outline" onClick={() => { setDraftText(replyDraftSuggestion.draft); setShowReplyDraft(true); }}>
                          <Sparkles className="mr-2 h-3 w-3" /> AI draft reply
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No conversation yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {activityItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {activityItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div>{item.label}</div>
                        <div className="text-xs text-muted-foreground">{fmtDateTime(item.date)}</div>
                      </div>
                      {item.href && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to={item.href}><ExternalLink className="h-3 w-3" /></Link>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Clinic:</span> {clinic?.name ?? '—'}</div>
              <div><span className="text-muted-foreground">Source:</span> {lead.source}</div>
              <div><span className="text-muted-foreground">Service interested:</span> {lead.service_interested}</div>
              <div><span className="text-muted-foreground">Assigned staff:</span> {assignedStaff?.name ?? '—'}</div>
              <div><span className="text-muted-foreground">Last contact:</span> {lead.last_contact_at ? fmtDate(lead.last_contact_at) : '—'}</div>
              <div><span className="text-muted-foreground">Next action:</span> {lead.next_action}</div>
            </CardContent>
          </Card>

          <Card id="appointment">
            <CardHeader>
              <CardTitle>Appointment</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {latestAppointment ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{latestAppointment.appointment_id}</span>
                    <Badge tone={statusTone(latestAppointment.status)}>{latestAppointment.status}</Badge>
                  </div>
                  <div><span className="text-muted-foreground">Doctor:</span> {doctors.find((d) => d.doctor_id === latestAppointment.doctor_id)?.name ?? latestAppointment.doctor_id}</div>
                  <div><span className="text-muted-foreground">Scheduled:</span> {fmtDateTime(latestAppointment.scheduled_at)}</div>
                  <div><span className="text-muted-foreground">Reminder:</span> {latestAppointment.reminder_status}</div>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to="/clinic/appointments">View appointment</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-muted-foreground">No appointment booked.</p>
                  <Button size="sm" onClick={() => setShowBook((v) => !v)} id="book">
                    <Calendar className="mr-2 h-4 w-4" /> Book appointment
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="followup">
            <CardHeader>
              <CardTitle>Follow-up</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {latestFollowup ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{latestFollowup.type}</span>
                    <Badge tone={latestFollowup.status === 'Scheduled' ? 'info' : 'muted'}>{latestFollowup.status}</Badge>
                  </div>
                  <div><span className="text-muted-foreground">Due:</span> {fmtDateTime(latestFollowup.scheduled_at)}</div>
                  <div><span className="text-muted-foreground">Channel:</span> {latestFollowup.channel}</div>
                  {latestFollowup.outcome && (
                    <div><span className="text-muted-foreground">Outcome:</span> {latestFollowup.outcome}</div>
                  )}
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to="/clinic/follow-ups">View follow-up</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-muted-foreground">No active follow-up.</p>
                  <Button size="sm" onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    addFollowup({
                      lead_id: lead.lead_id,
                      appointment_id: latestAppointment?.appointment_id ?? null,
                      type: 'Reminder',
                      scheduled_at: tomorrow.toISOString(),
                      channel: 'WhatsApp',
                    });
                    toast.success('Follow-up scheduled');
                  }}>
                    <Calendar className="mr-2 h-4 w-4" /> Schedule follow-up
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {!showQualifySuggestion && qualificationSuggestion && lead.status !== 'Qualified' && lead.status !== 'Booked' && lead.status !== 'Attended' && (
                <Button size="sm" variant="outline" onClick={() => setShowQualifySuggestion(true)} className="w-full">
                  <Sparkles className="mr-2 h-4 w-4" /> AI suggest qualify
                </Button>
              )}
              {lead.status !== 'Qualified' && lead.status !== 'Booked' && lead.status !== 'Attended' && (
                <Button size="sm" onClick={qualify} className="w-full">
                  <UserCheck className="mr-2 h-4 w-4" /> Qualify
                </Button>
              )}
              {!showFollowUpSuggestion && followUpSuggestion && (
                <Button size="sm" variant="outline" onClick={() => setShowFollowUpSuggestion(true)} className="w-full">
                  <Sparkles className="mr-2 h-4 w-4" /> AI suggest follow-up
                </Button>
              )}
              {(lead.status === 'Qualified' || lead.status === 'New' || lead.status === 'Contacted') && (
                <Button size="sm" onClick={() => setShowBook((v) => !v)} className="w-full" id="book">
                  <Calendar className="mr-2 h-4 w-4" /> Book appointment
                </Button>
              )}
              {lead.status !== 'Lost' && (
                <Button size="sm" variant="ghost" onClick={markLost} className="w-full">
                  <UserX className="mr-2 h-4 w-4" /> Mark lost
                </Button>
              )}
              {latestConversation && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/clinic/conversations?lead=${lead.lead_id}`)} className="w-full">
                  <Phone className="mr-2 h-4 w-4" /> Open full conversation
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showQualifySuggestion && qualificationSuggestion && (
        <AiSuggestionPanel
          title="AI qualification assistance"
          onDismiss={() => setShowQualifySuggestion(false)}
          acceptLabel="Use suggestion"
          onAccept={() => {
            try {
              setLeadStatus(lead.lead_id, qualificationSuggestion.suggestedStatus);
              toast.success(`Lead status updated to ${qualificationSuggestion.suggestedStatus}`);
            } catch (e: any) {
              toast.error(e?.message ?? 'Invalid transition');
            }
          }}
        >
          <div className="space-y-1">
            <p><span className="font-medium">Suggested status:</span> {qualificationSuggestion.suggestedStatus}</p>
            <p className="text-xs text-muted-foreground">{qualificationSuggestion.reason}</p>
          </div>
        </AiSuggestionPanel>
      )}

      {showFollowUpSuggestion && followUpSuggestion && (
        <AiSuggestionPanel
          title="AI follow-up assistance"
          onDismiss={() => setShowFollowUpSuggestion(false)}
          acceptLabel="Create follow-up"
          onAccept={() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const aptId = latestAppointment?.appointment_id ?? null;
            addFollowup({
              lead_id: lead.lead_id,
              appointment_id: aptId,
              type: 'Reminder',
              scheduled_at: tomorrow.toISOString(),
              channel: 'WhatsApp',
            });
            toast.success('Follow-up created from AI suggestion');
          }}
        >
          <div className="space-y-1">
            <p><span className="font-medium">Suggested action:</span> {followUpSuggestion.action}</p>
            <p><span className="font-medium">Timing:</span> {followUpSuggestion.timing}</p>
            <p className="text-xs text-muted-foreground">{followUpSuggestion.reason}</p>
          </div>
        </AiSuggestionPanel>
      )}

      {showBook && (
        <Card>
          <CardHeader>
            <CardTitle>Book appointment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="book-doctor">Doctor</Label>
              <Select id="book-doctor" value={bookDoctorId} onChange={(e) => setBookDoctorId(e.target.value)}>
                <option value="">Select doctor</option>
                {doctors.map((d) => (
                  <option key={d.doctor_id} value={d.doctor_id}>
                    {d.name} — {d.specialty}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-when">Date / time (ISO)</Label>
              <Input
                id="book-when"
                value={bookWhen}
                onChange={(e) => setBookWhen(e.target.value)}
                placeholder="2026-09-02T11:00:00.000Z"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={book}>Confirm booking</Button>
              <Button variant="outline" onClick={() => setShowBook(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
