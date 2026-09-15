import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore, selectLeadsByClinic, selectAppointmentsByClinic, selectFollowupsByLead, selectOutcomesByClinic, selectConversationsByLead, selectMessagesByConversation, selectAppointmentsByLead } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';
import {
  Users,
  ClipboardCheck,
  Calendar,
  PhoneIncoming,
  TrendingUp,
  IndianRupee,
  MessageSquare,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { fmtDate } from '@/lib/format';

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

export default function ClinicDashboardPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const leads = useStore((s) => (clinicId ? selectLeadsByClinic(clinicId)(s) : []));
  const appointments = useStore((s) => (clinicId ? selectAppointmentsByClinic(clinicId)(s) : []));
  const outcomes = useStore((s) => (clinicId ? selectOutcomesByClinic(clinicId)(s) : []));
  const clinic = clinicId ? clinics[clinicId] : undefined;

  const now = useMemo(() => new Date(), []);

  const newLeads = leads.filter((l) => l.status === 'New');
  const qualifiedLeads = leads.filter((l) => l.status === 'Qualified');
  const bookedAppointments = appointments.filter((a) => a.status === 'Booked');
  const attendedAppointments = appointments.filter((a) => a.status === 'Attended');
  const noShowAppointments = appointments.filter((a) => a.status === 'NoShow');

  const bookingRate = leads.length > 0 ? Math.round((bookedAppointments.length / leads.length) * 100) : 0;

  const totalRevenue = outcomes.reduce((sum, o) => sum + o.amount_inr, 0);

  const avgResponseHours = useMemo(() => {
    const store = useStore.getState();
    let totalHours = 0;
    let count = 0;
    for (const lead of leads) {
      const convs = selectConversationsByLead(lead.lead_id)(store);
      if (convs.length === 0) continue;
      const conv = convs[0];
      const msgs = selectMessagesByConversation(conv.conversation_id)(store);
      const firstLead = msgs.find((m) => m.sender === 'lead');
      const firstClinic = msgs.find((m) => m.sender === 'clinic');
      if (firstLead && firstClinic) {
        const diff = new Date(firstClinic.sent_at).getTime() - new Date(firstLead.sent_at).getTime();
        totalHours += diff / (1000 * 60 * 60);
        count++;
      }
    }
    return count > 0 ? Math.round(totalHours / count) : null;
  }, [leads]);

  const actionItems = useMemo(() => {
    const store = useStore.getState();
    const items: { id: string; label: string; href: string; tone: 'warning' | 'destructive' | 'info' | 'success' }[] = [];

    for (const l of qualifiedLeads) {
      const appts = selectAppointmentsByLead(l.lead_id)(store);
      if (appts.length === 0) {
        items.push({ id: `qual-${l.lead_id}`, label: `${l.service_interested} — qualified, not booked`, href: `/clinic/leads/${l.lead_id}`, tone: 'warning' });
      }
    }

    for (const l of newLeads) {
      items.push({ id: `new-${l.lead_id}`, label: `${l.service_interested} — needs first response`, href: `/clinic/leads/${l.lead_id}`, tone: 'info' });
    }

    for (const a of noShowAppointments) {
      items.push({ id: `noshow-${a.appointment_id}`, label: `No-show recovery: ${a.appointment_id}`, href: `/clinic/appointments`, tone: 'destructive' });
    }

    const missedFollowups = appointments.flatMap((a) => selectFollowupsByLead(a.lead_id)(store)).filter((f) => f.status === 'Missed');
    for (const f of missedFollowups) {
      items.push({ id: `missed-${f.followup_id}`, label: `Missed follow-up: ${f.type}`, href: `/clinic/follow-ups`, tone: 'destructive' });
    }

    return items.slice(0, 6);
  }, [appointments, qualifiedLeads, newLeads, noShowAppointments]);

  const todayAppointments = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return appointments
      .filter((a) => {
        const d = new Date(a.scheduled_at);
        return d >= start && d < end;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [appointments, now]);

  const todayFollowups = useMemo(() => {
    const store = useStore.getState();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return leads.flatMap((l) => selectFollowupsByLead(l.lead_id)(store)).filter((f) => {
      const d = new Date(f.scheduled_at);
      return d >= start && d < end && f.status === 'Scheduled';
    });
  }, [leads, now]);

  const insights = useMemo(() => {
    const result: { text: string; tone: 'warning' | 'info' | 'success' }[] = [];
    if (leads.length > 0 && qualifiedLeads.length / leads.length < 0.4) {
      result.push({ text: `Only ${Math.round((qualifiedLeads.length / leads.length) * 100)}% of enquiries are qualified. Strengthen initial consultation and follow-up.`, tone: 'warning' });
    }
    if (noShowAppointments.length > attendedAppointments.length) {
      result.push({ text: 'No-shows exceed attended appointments. Review reminder timing and confirmation flow.', tone: 'warning' });
    }
    if (totalRevenue > 0 && outcomes.length > 0) {
      result.push({ text: `₹${totalRevenue.toLocaleString('en-IN')} revenue recorded from ${outcomes.length} outcome(s).`, tone: 'success' });
    }
    if (avgResponseHours !== null && avgResponseHours > 24) {
      result.push({ text: `Average response time is ~${avgResponseHours}h. Faster replies improve qualification rate.`, tone: 'info' });
    }
    return result.slice(0, 2);
  }, [leads, qualifiedLeads, noShowAppointments, attendedAppointments, totalRevenue, outcomes, avgResponseHours]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {clinic ? `${clinic.name}` : 'Clinic Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Growth pipeline overview · {fmtDate(now.toISOString())}
        </p>
      </div>

      <SyntheticDataBanner />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/clinic/leads" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">New enquiries</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{newLeads.length}</div>
              <p className="text-xs text-muted-foreground">{leads.length} total leads</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/clinic/leads" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Qualified</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{qualifiedLeads.length}</div>
              <p className="text-xs text-muted-foreground">{leads.length} total leads</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/clinic/appointments" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Booked</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{bookedAppointments.length}</div>
              <p className="text-xs text-muted-foreground">Appointments</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/clinic/appointments" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Attended</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{attendedAppointments.length}</div>
              <p className="text-xs text-muted-foreground">Appointments</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">No-shows</CardTitle>
            <PhoneIncoming className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{noShowAppointments.length}</div>
            <p className="text-xs text-muted-foreground">Appointments missed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Booking rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{bookingRate}%</div>
            <p className="text-xs text-muted-foreground">Leads to bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Response time</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{avgResponseHours !== null ? `~${avgResponseHours}h` : '—'}</div>
            <p className="text-xs text-muted-foreground">Avg first reply</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₹{totalRevenue.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">{outcomes.length} outcomes</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {(() => {
                const contactedCount = leads.filter((l) => ['Contacted', 'Qualified', 'Booked', 'Attended'].includes(l.status)).length;
                const qualifiedCount = leads.filter((l) => ['Qualified', 'Booked', 'Attended'].includes(l.status)).length;
                const bookedCount = bookedAppointments.length;
                const attendedCount = attendedAppointments.length;
                const stages = [
                  { label: 'Enquiries', count: leads.length, pct: 100, widthPct: 100 },
                  { label: 'Contacted', count: contactedCount, pct: leads.length ? Math.round((contactedCount / leads.length) * 100) : 0, widthPct: leads.length ? Math.round((contactedCount / leads.length) * 100) : 0 },
                  { label: 'Qualified', count: qualifiedCount, pct: contactedCount ? Math.round((qualifiedCount / contactedCount) * 100) : 0, widthPct: leads.length ? Math.round((qualifiedCount / leads.length) * 100) : 0 },
                  { label: 'Booked', count: bookedCount, pct: qualifiedCount ? Math.round((bookedCount / qualifiedCount) * 100) : 0, widthPct: leads.length ? Math.round((bookedCount / leads.length) * 100) : 0 },
                  { label: 'Attended', count: attendedCount, pct: bookedCount ? Math.round((attendedCount / bookedCount) * 100) : 0, widthPct: leads.length ? Math.round((attendedCount / leads.length) * 100) : 0 },
                ];
                return stages.map((stage) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-muted-foreground">{stage.label}</div>
                    <div className="flex-1 h-8 rounded-md bg-muted/50 overflow-hidden">
                      <div
                        className="h-full rounded-md bg-primary/80 transition-all"
                        style={{ width: `${Math.max(stage.widthPct, 4)}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-sm font-medium">{stage.count}</div>
                    <div className="w-16 text-right text-xs text-muted-foreground">{stage.pct}%</div>
                  </div>
                ));
              })()}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span>{outcomes.length} outcomes</span>
              <span>·</span>
              <span>₹{totalRevenue.toLocaleString('en-IN')} revenue</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent>
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No immediate actions flagged.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {actionItems.map((item) => (
                  <Link
                    key={item.id}
                    to={item.href}
                    className="flex items-start gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-accent"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                    <span className="flex-1">{item.label}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today&apos;s activity</CardTitle>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 && todayFollowups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments or follow-ups scheduled for today.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {todayAppointments.map((a) => (
                  <Link
                    key={a.appointment_id}
                    to="/clinic/appointments"
                    className="flex items-center gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent"
                  >
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">Appointment {a.appointment_id}</div>
                      <div className="text-xs text-muted-foreground">{new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </Link>
                ))}
                {todayFollowups.map((f) => (
                  <div key={f.followup_id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">{f.type} follow-up</div>
                      <div className="text-xs text-muted-foreground">{new Date(f.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {f.channel}</div>
                    </div>
                    <Badge tone={f.status === 'Scheduled' ? 'info' : 'muted'}>{f.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Growth insight</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add more appointments and outcomes to generate insights.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {insights.map((insight) => (
                  <div key={insight.text} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    <TrendingUp className="mt-0.5 h-4 w-4 text-primary" />
                    <span>{insight.text}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick navigation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link to="/clinic/leads" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Leads <ExternalLink className="ml-2 h-3 w-3" />
          </Link>
          <Link to="/clinic/conversations" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
            Conversations <ExternalLink className="ml-2 h-3 w-3" />
          </Link>
          <Link to="/clinic/appointments" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
            Appointments <ExternalLink className="ml-2 h-3 w-3" />
          </Link>
          <Link to="/clinic/follow-ups" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
            Follow-ups <ExternalLink className="ml-2 h-3 w-3" />
          </Link>
          <Link to="/clinic/analytics" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
            Analytics <ExternalLink className="ml-2 h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
