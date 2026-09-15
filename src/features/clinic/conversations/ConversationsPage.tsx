import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Send, UserCheck, Calendar, UserX, Sparkles, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useStore,
  selectDoctorsByClinic,
  selectAppointmentsByLead,
  selectFollowupsByLead,
} from '@/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/format';
import { suggestReplyDraft } from '@/lib/aiSuggestions';

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

export default function ConversationsPage() {
  const navigate = useNavigate();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [showBook, setShowBook] = useState(false);
  const [bookDoctorId, setBookDoctorId] = useState('');
  const [bookWhen, setBookWhen] = useState('');
  const [showScheduleFollowUp, setShowScheduleFollowUp] = useState(false);
  const [followUpType, setFollowUpType] = useState('Reminder');
  const [followUpChannel, setFollowUpChannel] = useState('WhatsApp');
  const [followUpWhen, setFollowUpWhen] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [showReplyDraft, setShowReplyDraft] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'New' | 'Qualified' | 'Booked'>('all');

  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];

  const allLeads = useStore((s) => {
    if (!clinicId) return [];
    return Object.values(s.leads).filter((l) => l.clinic_id === clinicId);
  });

  const allConversations = useStore((s) => {
    if (!clinicId) return [];
    const leadIds = new Set(allLeads.map((l) => l.lead_id));
    return Object.values(s.conversations)
      .filter((c) => c.lead_id && leadIds.has(c.lead_id))
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  });

  const conversations = useMemo(() => {
    if (filter === 'all') return allConversations;
    if (filter === 'attention') {
      return allConversations.filter((c) => {
        const lead = c.lead_id ? allLeads.find((l) => l.lead_id === c.lead_id) : undefined;
        if (!lead) return false;
        if (lead.status === 'New') return true;
        if (lead.status === 'Qualified') {
          const appts = selectAppointmentsByLead(lead.lead_id)(useStore.getState());
          return appts.length === 0;
        }
        return false;
      });
    }
    return allConversations.filter((c) => {
      const lead = c.lead_id ? allLeads.find((l) => l.lead_id === c.lead_id) : undefined;
      return lead?.status === filter;
    });
  }, [allConversations, allLeads, filter]);

  const lead = useStore((s) => {
    if (!activeConversationId) return undefined;
    const conv = s.conversations[activeConversationId];
    if (!conv?.lead_id) return undefined;
    return s.leads[conv.lead_id];
  });

  const convoMessages = useStore((s) => {
    if (!activeConversationId) return [];
    const msgs = Object.values(s.messages).filter((m) => m.conversation_id === activeConversationId);
    return msgs.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  });

  const appointments = useStore((s) => {
    if (!lead?.lead_id) return [];
    return selectAppointmentsByLead(lead.lead_id)(s);
  });

  const followups = useStore((s) => {
    if (!lead?.lead_id) return [];
    return selectFollowupsByLead(lead.lead_id)(s);
  });

  const doctors = useStore((s) => (clinicId ? selectDoctorsByClinic(clinicId)(s) : []));
  const setLeadStatus = useStore((s) => s.setLeadStatus);
  const addMessage = useStore((s) => s.addMessage);
  const addAppointment = useStore((s) => s.addAppointment);
  const addFollowup = useStore((s) => s.addFollowup);
  const updateLead = useStore((s) => s.updateLead);

  const activeConversation = activeConversationId ? allConversations.find((c) => c.conversation_id === activeConversationId) : undefined;
  const replyDraftSuggestion = activeConversation ? suggestReplyDraft(activeConversation, convoMessages) : null;

  const attentionCount = useMemo(() => {
    return allConversations.filter((c) => {
      const l = c.lead_id ? allLeads.find((x) => x.lead_id === c.lead_id) : undefined;
      if (!l) return false;
      if (l.status === 'New') return true;
      if (l.status === 'Qualified') {
        const appts = selectAppointmentsByLead(l.lead_id)(useStore.getState());
        return appts.length === 0;
      }
      return false;
    }).length;
  }, [allConversations, allLeads]);

  useEffect(() => {
    if (allConversations.length > 0 && !activeConversationId) {
      setActiveConversationId(allConversations[0].conversation_id);
    }
  }, [allConversations, activeConversationId]);

  const sendReply = () => {
    if (!activeConversationId || !replyBody.trim()) return;
    addMessage({
      conversation_id: activeConversationId,
      sender: 'clinic',
      body: replyBody.trim(),
    });
    setReplyBody('');
    setShowReplyDraft(false);
    setDraftText('');
  };

  const qualify = () => {
    if (!lead) return;
    try {
      setLeadStatus(lead.lead_id, 'Qualified');
      toast.success('Lead qualified');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const book = () => {
    if (!lead || !bookDoctorId || !bookWhen) {
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
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to book');
    }
  };

  const markLost = () => {
    if (!lead) return;
    try {
      setLeadStatus(lead.lead_id, 'Lost');
      toast.success('Lead marked as lost');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const scheduleFollowUp = () => {
    if (!lead || !followUpWhen) {
      toast.error('Select a date/time for the follow-up.');
      return;
    }
    try {
      const aptId = appointments.find((a) => a.status === 'Booked')?.appointment_id ?? null;
      addFollowup({
        lead_id: lead.lead_id,
        appointment_id: aptId,
        type: followUpType as any,
        scheduled_at: new Date(followUpWhen).toISOString(),
        channel: followUpChannel as any,
      });
      toast.success('Follow-up scheduled');
      setShowScheduleFollowUp(false);
      setFollowUpWhen('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to schedule follow-up');
    }
  };

  const assignLead = () => {
    if (!lead || !assigneeId) return;
    try {
      updateLead(lead.lead_id, { assigned_staff_id: assigneeId });
      toast.success('Lead reassigned');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to assign');
    }
  };

  const latestAppointment = appointments[0];
  const latestFollowup = followups[0];
  const assignedStaff = lead?.assigned_staff_id ? useStore.getState().staff[lead.assigned_staff_id] : undefined;
  const allStaff = useStore((s) => (clinicId ? Object.values(s.staff).filter((st) => st.clinic_id === clinicId) : []));

  const nextAction = (() => {
    if (!lead) return null;
    switch (lead.status) {
      case 'New':
      case 'Contacted':
        return { label: 'Reply to lead', primary: true };
      case 'Qualified':
        return { label: 'Book appointment', primary: true };
      case 'Booked':
        return { label: 'View appointment', primary: true };
      case 'Attended':
        return { label: 'Schedule follow-up', primary: true };
      case 'Lost':
        return null;
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <p className="text-sm text-muted-foreground">
          Clinic enquiry inbox · {allConversations.length} total · {attentionCount} needing attention
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'attention', 'New', 'Qualified', 'Booked'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'attention' ? `Needs attention (${attentionCount})` : f}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conversations match this filter.</p>
            ) : (
              conversations.map((c) => {
                const cLead = c.lead_id ? allLeads.find((l) => l.lead_id === c.lead_id) : undefined;
                const isActive = c.conversation_id === activeConversationId;
                const needsAttention = cLead && (cLead.status === 'New' || (cLead.status === 'Qualified' && selectAppointmentsByLead(cLead.lead_id)(useStore.getState()).length === 0));
                return (
                  <button
                    key={c.conversation_id}
                    type="button"
                    onClick={() => setActiveConversationId(c.conversation_id)}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {cLead ? `${cLead.service_interested}` : c.conversation_id}
                      </span>
                      {needsAttention && <AlertTriangle className="h-3 w-3 text-warning" />}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {cLead?.lead_id ?? '—'} · {c.channel}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {fmtRelative(c.last_message_at)}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge tone={statusTone(cLead?.status ?? 'New')} className="text-[10px]">
                        {cLead?.status ?? 'New'}
                      </Badge>
                      {cLead?.assigned_staff_id && (
                        <span className="text-[10px] text-muted-foreground">
                          {allStaff.find((st) => st.staff_id === cLead.assigned_staff_id)?.name ?? cLead.assigned_staff_id}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {activeConversation ? `Conversation · ${lead?.service_interested ?? ''}` : 'Select a conversation'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!activeConversationId || !activeConversation ? (
              <p className="text-sm text-muted-foreground">Pick a conversation from the queue to view messages.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="max-h-[50vh] overflow-y-auto pr-1">
                  {convoMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  ) : (
                    convoMessages.map((m) => (
                      <div
                        key={m.message_id}
                        className={`flex ${m.sender === 'clinic' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.sender === 'clinic'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          <div className="text-xs opacity-70 mb-1">
                            {m.sender === 'clinic' ? 'You' : 'Lead'} · {fmtDateTime(m.sent_at)}
                          </div>
                          <div>{m.body}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-2 flex flex-col gap-2">
                  {showReplyDraft && replyDraftSuggestion && (
                    <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                      <div className="text-xs font-medium text-primary">AI Suggested Reply</div>
                      <Textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="min-h-[80px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { setReplyBody(draftText || replyDraftSuggestion.draft); setShowReplyDraft(false); toast.success('Draft placed in composer'); }}>
                          Use draft
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowReplyDraft(false)}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Type a reply..."
                      className="min-h-[80px] text-sm"
                    />
                    <div className="flex flex-col gap-2">
                      <Button onClick={sendReply} disabled={!replyBody.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                      {!showReplyDraft && replyDraftSuggestion && (
                        <Button size="sm" variant="outline" onClick={() => { setDraftText(replyDraftSuggestion.draft); setShowReplyDraft(true); }}>
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lead context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!lead ? (
              <p className="text-sm text-muted-foreground">Select a conversation to view lead details.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{lead.lead_id}</div>
                    <div className="text-xs text-muted-foreground">{lead.source} · {lead.service_interested}</div>
                  </div>
                  <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>
                </div>

                <div className="grid gap-2 text-sm">
                  <div><span className="text-muted-foreground">Assigned:</span> {assignedStaff?.name ?? 'Unassigned'}</div>
                  <div><span className="text-muted-foreground">Last contact:</span> {lead.last_contact_at ? fmtDate(lead.last_contact_at) : '—'}</div>
                  <div><span className="text-muted-foreground">Next action:</span> {lead.next_action}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Assign</div>
                  <div className="flex gap-2">
                    <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-9">
                      <option value="">Select staff</option>
                      {allStaff.map((st) => (
                        <option key={st.staff_id} value={st.staff_id}>{st.name} — {st.role}</option>
                      ))}
                    </Select>
                    <Button size="sm" onClick={assignLead} disabled={!assigneeId}>Assign</Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Appointment</div>
                  {latestAppointment ? (
                    <div className="text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span>{latestAppointment.appointment_id}</span>
                        <Badge tone={statusTone(latestAppointment.status)}>{latestAppointment.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {doctors.find((d) => d.doctor_id === latestAppointment.doctor_id)?.name ?? latestAppointment.doctor_id} · {fmtDateTime(latestAppointment.scheduled_at)}
                      </div>
                      <Button asChild size="sm" variant="outline" className="w-full">
                        <Link to="/clinic/appointments">View appointment</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">No appointment booked.</p>
                      <Button size="sm" onClick={() => setShowBook((v) => !v)}>
                        <Calendar className="mr-2 h-4 w-4" /> Book appointment
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Follow-up</div>
                  {latestFollowup ? (
                    <div className="text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span>{latestFollowup.type}</span>
                        <Badge tone={latestFollowup.status === 'Scheduled' ? 'info' : 'muted'}>{latestFollowup.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Due: {fmtDateTime(latestFollowup.scheduled_at)} · {latestFollowup.channel}
                      </div>
                      {latestFollowup.outcome && (
                        <div className="text-xs text-muted-foreground">Outcome: {latestFollowup.outcome}</div>
                      )}
                      <Button asChild size="sm" variant="outline" className="w-full">
                        <Link to="/clinic/follow-ups">View follow-up</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">No active follow-up.</p>
                      <Button size="sm" onClick={() => setShowScheduleFollowUp((v) => !v)}>
                        <Calendar className="mr-2 h-4 w-4" /> Schedule follow-up
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-sm font-medium">Actions</div>
                  {nextAction && (
                    <Button size="sm" className="w-full" onClick={() => {
                      if (nextAction.label === 'Reply to lead') {
                        document.getElementById('composer')?.scrollIntoView({ behavior: 'smooth' });
                      } else if (nextAction.label === 'Book appointment') {
                        setShowBook(true);
                      } else if (nextAction.label === 'View appointment' && latestAppointment) {
                        navigate('/clinic/appointments');
                      }
                    }}>
                      {nextAction.label}
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={qualify} disabled={lead.status === 'Qualified' || lead.status === 'Booked' || lead.status === 'Attended'}>
                      <UserCheck className="mr-2 h-4 w-4" /> Qualify
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowBook((v) => !v)}>
                      <Calendar className="mr-2 h-4 w-4" /> Book
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowScheduleFollowUp((v) => !v)}>
                      <Clock className="mr-2 h-4 w-4" /> Follow-up
                    </Button>
                    <Button size="sm" variant="ghost" onClick={markLost} disabled={lead.status === 'Lost'}>
                      <UserX className="mr-2 h-4 w-4" /> Lost
                    </Button>
                  </div>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to={`/clinic/leads/${lead.lead_id}`}>Open lead detail</Link>
                  </Button>
                </div>

                {showBook && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="text-sm font-medium">Book appointment</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="conv-book-doctor">Doctor</Label>
                        <Select id="conv-book-doctor" value={bookDoctorId} onChange={(e) => setBookDoctorId(e.target.value)}>
                          <option value="">Select doctor</option>
                          {doctors.map((d) => (
                            <option key={d.doctor_id} value={d.doctor_id}>{d.name} — {d.specialty}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="conv-book-when">Date / time (ISO)</Label>
                        <Input id="conv-book-when" value={bookWhen} onChange={(e) => setBookWhen(e.target.value)} placeholder="2026-09-02T11:00:00.000Z" />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button onClick={book}>Confirm</Button>
                        <Button variant="outline" onClick={() => setShowBook(false)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}

                {showScheduleFollowUp && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="text-sm font-medium">Schedule follow-up</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="fu-type">Type</Label>
                        <Select id="fu-type" value={followUpType} onChange={(e) => setFollowUpType(e.target.value)}>
                          <option value="Reminder">Reminder</option>
                          <option value="Recovery">Recovery</option>
                          <option value="Reschedule">Reschedule</option>
                          <option value="Review Request">Review Request</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fu-channel">Channel</Label>
                        <Select id="fu-channel" value={followUpChannel} onChange={(e) => setFollowUpChannel(e.target.value)}>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Phone">Phone</option>
                          <option value="Email">Email</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fu-when">Date / time (ISO)</Label>
                        <Input id="fu-when" value={followUpWhen} onChange={(e) => setFollowUpWhen(e.target.value)} placeholder="2026-09-03T10:00:00.000Z" />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button onClick={scheduleFollowUp}>Create</Button>
                        <Button variant="outline" onClick={() => setShowScheduleFollowUp(false)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
