import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, RefreshCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, selectFollowupsByLead, selectLeadById, selectAppointmentsByLead } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtDateTime } from '@/lib/format';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';

function statusTone(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info' {
  switch (status) {
    case 'Scheduled':
      return 'info';
    case 'Completed':
      return 'success';
    case 'Missed':
      return 'destructive';
    case 'Cancelled':
      return 'muted';
    default:
      return 'default';
  }
}

export default function FollowupsPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const leads = useStore((s) => {
    if (!clinicId) return [];
    return Object.values(s.leads).filter((l) => l.clinic_id === clinicId);
  });

  const allFollowups = useMemo(() => {
    return leads.flatMap((l) => selectFollowupsByLead(l.lead_id)(useStore.getState()));
  }, [leads]);

  const setFollowupStatus = useStore((s) => s.setFollowupStatus);
  const updateFollowup = useStore((s) => s.updateFollowup);

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const todayEnd = useMemo(() => {
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    return end;
  }, [today]);

  const dueToday = useMemo(() => {
    return allFollowups
      .filter((f) => {
        const d = new Date(f.scheduled_at);
        return f.status === 'Scheduled' && d >= today && d < todayEnd;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [allFollowups, today, todayEnd]);

  const upcoming = useMemo(() => {
    return allFollowups
      .filter((f) => {
        const d = new Date(f.scheduled_at);
        return f.status === 'Scheduled' && d >= todayEnd;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [allFollowups, todayEnd]);

  const completed = useMemo(() => {
    return allFollowups
      .filter((f) => f.status === 'Completed')
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
  }, [allFollowups]);

  const missed = useMemo(() => {
    return allFollowups
      .filter((f) => f.status === 'Missed')
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
  }, [allFollowups]);

  const markCompleted = (f: any) => {
    try {
      setFollowupStatus(f.followup_id, 'Completed');
      toast.success('Follow-up marked completed');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const reschedule = (f: any, newWhen: string) => {
    if (!newWhen) {
      toast.error('Select a new date/time');
      return;
    }
    try {
      updateFollowup(f.followup_id, {
        scheduled_at: new Date(newWhen).toISOString(),
        status: 'Scheduled',
      });
      toast.success('Follow-up rescheduled');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to reschedule');
    }
  };

  const sendFollowup = (f: any) => {
    try {
      updateFollowup(f.followup_id, {
        outcome: f.outcome ? `${f.outcome}; Sent` : 'Sent',
      });
      toast.success('Follow-up marked as sent');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          Your follow-up work queue · {dueToday.length} due today · {missed.length} missed · {upcoming.length} upcoming
        </p>
      </div>

      <SyntheticDataBanner />

      <Card>
        <CardHeader>
          <CardTitle>Due today</CardTitle>
        </CardHeader>
        <CardContent>
          {dueToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No follow-ups due today.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {dueToday.map((f) => {
                const lead = f.lead_id ? selectLeadById(f.lead_id)(useStore.getState()) : undefined;
                const appointments = f.lead_id ? selectAppointmentsByLead(f.lead_id)(useStore.getState()) : [];
                const relatedAppt = appointments[0];
                return (
                  <FollowupRow
                    key={f.followup_id}
                    followup={f}
                    lead={lead}
                    relatedAppt={relatedAppt}
                    onSend={sendFollowup}
                    onComplete={markCompleted}
                    onReschedule={reschedule}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming follow-ups.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((f) => {
                const lead = f.lead_id ? selectLeadById(f.lead_id)(useStore.getState()) : undefined;
                const appointments = f.lead_id ? selectAppointmentsByLead(f.lead_id)(useStore.getState()) : [];
                const relatedAppt = appointments[0];
                return (
                  <FollowupRow
                    key={f.followup_id}
                    followup={f}
                    lead={lead}
                    relatedAppt={relatedAppt}
                    onSend={sendFollowup}
                    onComplete={markCompleted}
                    onReschedule={reschedule}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed</CardTitle>
        </CardHeader>
        <CardContent>
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed follow-ups yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {completed.map((f) => {
                const lead = f.lead_id ? selectLeadById(f.lead_id)(useStore.getState()) : undefined;
                const appointments = f.lead_id ? selectAppointmentsByLead(f.lead_id)(useStore.getState()) : [];
                const relatedAppt = appointments[0];
                return (
                  <FollowupRow
                    key={f.followup_id}
                    followup={f}
                    lead={lead}
                    relatedAppt={relatedAppt}
                    onSend={sendFollowup}
                    onComplete={markCompleted}
                    onReschedule={reschedule}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Missed</CardTitle>
        </CardHeader>
        <CardContent>
          {missed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No missed follow-ups.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {missed.map((f) => {
                const lead = f.lead_id ? selectLeadById(f.lead_id)(useStore.getState()) : undefined;
                const appointments = f.lead_id ? selectAppointmentsByLead(f.lead_id)(useStore.getState()) : [];
                const relatedAppt = appointments[0];
                return (
                  <FollowupRow
                    key={f.followup_id}
                    followup={f}
                    lead={lead}
                    relatedAppt={relatedAppt}
                    onSend={sendFollowup}
                    onComplete={markCompleted}
                    onReschedule={reschedule}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FollowupRow({ followup, lead, relatedAppt, onSend, onComplete, onReschedule }: any) {
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeText, setOutcomeText] = useState('');
  const updateFollowup = useStore((s) => s.updateFollowup);

  const saveOutcome = () => {
    if (!outcomeText.trim()) return;
    updateFollowup(followup.followup_id, { outcome: outcomeText.trim() });
    toast.success('Outcome recorded');
    setShowOutcome(false);
    setOutcomeText('');
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{followup.type}</span>
          <Badge tone={statusTone(followup.status)}>{followup.status}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{fmtDateTime(followup.scheduled_at)}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {lead?.lead_id ?? '—'} · {lead?.service_interested ?? '—'} · {followup.channel}
      </div>
      {relatedAppt && (
        <div className="mt-1 text-xs text-muted-foreground">
          Appointment: {relatedAppt.appointment_id} ({relatedAppt.status})
        </div>
      )}
      {followup.outcome && (
        <div className="mt-1 text-xs text-muted-foreground">Outcome: {followup.outcome}</div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => onSend(followup)}>
          <Send className="mr-1 h-3 w-3" /> Send
        </Button>
        <Button size="sm" variant="outline" onClick={() => onComplete(followup)}>
          <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
        </Button>
        <RescheduleForm followup={followup} onReschedule={onReschedule} />
        <Button asChild size="sm" variant="ghost">
          <Link to={`/clinic/leads/${lead?.lead_id}`}>Open lead</Link>
        </Button>
        {relatedAppt && (
          <Button asChild size="sm" variant="ghost">
            <Link to="/clinic/appointments">Appointment</Link>
          </Button>
        )}
        {followup.status === 'Completed' && (
          <Button size="sm" variant="outline" onClick={() => setShowOutcome((v) => !v)}>
            {showOutcome ? 'Cancel' : 'Record outcome'}
          </Button>
        )}
      </div>
      {showOutcome && (
        <div className="mt-2 flex gap-1">
          <Input
            value={outcomeText}
            onChange={(e) => setOutcomeText(e.target.value)}
            placeholder="Outcome (e.g., Replied, Booked, No response)"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={saveOutcome}>Save</Button>
        </div>
      )}
    </div>
  );
}

function RescheduleForm({ followup, onReschedule }: { followup: any; onReschedule: (f: any, newWhen: string) => void }) {
  const [when, setWhen] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <div className="flex gap-1">
          <Input
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            placeholder="2026-09-03T10:00:00.000Z"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={() => { onReschedule(followup, when); setOpen(false); setWhen(''); }}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <RefreshCcw className="mr-1 h-3 w-3" /> Reschedule
        </Button>
      )}
    </>
  );
}
