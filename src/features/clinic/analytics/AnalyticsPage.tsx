import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore, selectLeadsByClinic, selectAppointmentsByClinic, selectOutcomesByClinic, selectConversationsByLead, selectMessagesByConversation } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';
import { TrendingUp } from 'lucide-react';

export default function AnalyticsPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const leads = useStore((s) => (clinicId ? selectLeadsByClinic(clinicId)(s) : []));
  const appointments = useStore((s) => (clinicId ? selectAppointmentsByClinic(clinicId)(s) : []));
  const outcomes = useStore((s) => (clinicId ? selectOutcomesByClinic(clinicId)(s) : []));

  const totalLeads = leads.length;
  const qualified = leads.filter((l) => l.status === 'Qualified' || l.status === 'Booked' || l.status === 'Attended').length;
  const booked = leads.filter((l) => l.status === 'Booked' || l.status === 'Attended').length;
  const attended = leads.filter((l) => l.status === 'Attended').length;

  const totalAppointments = appointments.length;
  const attendedAppts = appointments.filter((a) => a.status === 'Attended').length;
  const noShows = appointments.filter((a) => a.status === 'NoShow').length;
  const cancelled = appointments.filter((a) => a.status === 'Cancelled').length;

  const bookingRate = totalLeads > 0 ? Math.round((booked / totalLeads) * 100) : 0;
  const attendanceRate = totalAppointments > 0 ? Math.round((attendedAppts / totalAppointments) * 100) : 0;
  const noShowRate = totalAppointments > 0 ? Math.round((noShows / totalAppointments) * 100) : 0;

  const totalRevenue = outcomes.reduce((sum, o) => sum + o.amount_inr, 0);
  const avgDealSize = outcomes.length > 0 ? Math.round(totalRevenue / outcomes.length) : 0;

  const bySource = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of leads) {
      map[l.source] = (map[l.source] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  const responseTimeAvg = useMemo(() => {
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

  const responseTimeBySource = useMemo(() => {
    const store = useStore.getState();
    const map: Record<string, { hours: number; count: number }> = {};
    for (const lead of leads) {
      const convs = selectConversationsByLead(lead.lead_id)(store);
      if (convs.length === 0) continue;
      const conv = convs[0];
      const msgs = selectMessagesByConversation(conv.conversation_id)(store);
      const firstLead = msgs.find((m) => m.sender === 'lead');
      const firstClinic = msgs.find((m) => m.sender === 'clinic');
      if (firstLead && firstClinic) {
        const diff = new Date(firstClinic.sent_at).getTime() - new Date(firstLead.sent_at).getTime();
        const hours = diff / (1000 * 60 * 60);
        if (!map[lead.source]) map[lead.source] = { hours: 0, count: 0 };
        map[lead.source].hours += hours;
        map[lead.source].count += 1;
      }
    }
    return Object.entries(map)
      .map(([name, data]) => ({ name, hours: Math.round(data.hours / data.count), count: data.count }))
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.hours - a.hours);
  }, [leads]);

  const funnel = useMemo(() => {
    const stages = [
      { stage: 'Enquiries', count: totalLeads, pct: 100 },
      { stage: 'Qualified', count: qualified, pct: totalLeads ? Math.round((qualified / totalLeads) * 100) : 0 },
      { stage: 'Booked', count: booked, pct: qualified ? Math.round((booked / qualified) * 100) : 0 },
      { stage: 'Attended', count: attended, pct: booked ? Math.round((attended / booked) * 100) : 0 },
      { stage: 'Outcome', count: outcomes.length, pct: attended ? Math.round((outcomes.length / attended) * 100) : 0 },
    ];
    return stages;
  }, [totalLeads, qualified, booked, attended, outcomes.length]);

  const insights = useMemo(() => {
    const result: { text: string; tone: 'warning' | 'info' | 'success' }[] = [];
    if (totalLeads > 0 && qualified / totalLeads < 0.4) {
      result.push({ text: `Only ${Math.round((qualified / totalLeads) * 100)}% of enquiries are qualified. Strengthen initial consultation.`, tone: 'warning' });
    }
    if (booked > 0 && attendanceRate < 70) {
      result.push({ text: `Attendance rate is ${attendanceRate}%. Consider improving reminders and confirmation flow.`, tone: 'warning' });
    }
    if (noShowRate > attendanceRate) {
      result.push({ text: `No-shows (${noShowRate}%) exceed attendance (${attendanceRate}%). Review scheduling gaps.`, tone: 'warning' });
    }
    if (totalRevenue > 0 && outcomes.length > 0) {
      result.push({ text: `₹${totalRevenue.toLocaleString('en-IN')} attributed revenue from ${outcomes.length} outcome(s).`, tone: 'success' });
    }
    if (bySource.length > 0) {
      result.push({ text: `Top source: ${bySource[0].name} (${bySource[0].value} enquiries).`, tone: 'info' });
    }
    if (responseTimeAvg !== null && responseTimeAvg > 24) {
      result.push({ text: `Average response time is ~${responseTimeAvg}h. Faster replies improve qualification.`, tone: 'info' });
    }
    return result.slice(0, 4);
  }, [totalLeads, qualified, booked, attendanceRate, noShowRate, totalRevenue, outcomes.length, bySource, responseTimeAvg]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Understand your enquiry-to-appointment funnel</p>
      </div>

      <SyntheticDataBanner />

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What the data says</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {insights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <TrendingUp className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{insight.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/clinic/leads" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total enquiries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{totalLeads}</div>
              <p className="text-xs text-muted-foreground">{qualified} qualified · {booked} booked</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/clinic/appointments" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Booked / Attended</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{booked} / {attendedAppts}</div>
              <p className="text-xs text-muted-foreground">{bookingRate}% booking rate · {attendanceRate}% attendance</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">No-shows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{noShows}</div>
            <p className="text-xs text-muted-foreground">{noShowRate}% of {totalAppointments} appointments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Attributed revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₹{totalRevenue.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">{outcomes.length} outcomes · avg ₹{avgDealSize.toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Enquiry-to-appointment funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {funnel.every((f) => f.count === 0) ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {funnel.map((stage, idx) => {
                  const widthPct = idx === 0 ? 100 : totalLeads ? Math.round((stage.count / totalLeads) * 100) : 0;
                  return (
                    <div key={stage.stage} className="flex items-center gap-3">
                      <div className="w-24 text-sm text-muted-foreground">{stage.stage}</div>
                      <div className="flex-1 h-8 rounded-md bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-md bg-primary/80 transition-all"
                          style={{ width: `${Math.max(widthPct, 4)}%` }}
                        />
                      </div>
                      <div className="w-12 text-right text-sm font-medium">{stage.count}</div>
                      <div className="w-16 text-right text-xs text-muted-foreground">{stage.pct}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead source breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {bySource.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {bySource.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{s.value} enquiries</span>
                      <Badge tone={s.name === bySource[0].name ? 'success' : 'default'}>{totalLeads ? Math.round((s.value / totalLeads) * 100) : 0}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance and no-show</CardTitle>
          </CardHeader>
          <CardContent>
            {totalAppointments === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Booked</span>
                    <span className="font-medium">{totalAppointments}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Attended</span>
                    <span className="font-medium">{attendedAppts} ({attendanceRate}%)</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">No-show</span>
                    <span className="font-medium">{noShows} ({noShowRate}%)</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cancelled</span>
                    <span className="font-medium">{cancelled}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {noShowRate > attendanceRate
                    ? 'No-shows exceed attendance. Review reminders and confirmation flow.'
                    : 'Attendance is stronger than no-shows. Continue monitoring.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response time</CardTitle>
          </CardHeader>
          <CardContent>
            {responseTimeAvg === null ? (
              <p className="text-sm text-muted-foreground">Not enough message data to calculate response time.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-2xl font-semibold">~{responseTimeAvg}h</div>
                <p className="text-xs text-muted-foreground">Average first reply time across {leads.length} leads</p>
                {responseTimeBySource.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {responseTimeBySource.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{item.name}</span>
                        <span>~{item.hours}h ({item.count} leads)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue and outcomes</CardTitle>
        </CardHeader>
        <CardContent>
          {outcomes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attributed outcomes recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Attributed revenue</div>
                  <div className="text-2xl font-semibold">₹{totalRevenue.toLocaleString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Outcomes</div>
                  <div className="text-2xl font-semibold">{outcomes.length}</div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {Object.entries(
                  outcomes.reduce<Record<string, { amount: number; count: number }>>((acc, o) => {
                    const key = o.attribution_confidence;
                    if (!acc[key]) acc[key] = { amount: 0, count: 0 };
                    acc[key].amount += o.amount_inr;
                    acc[key].count += 1;
                    return acc;
                  }, {})
                ).map(([confidence, data]) => (
                  <div key={confidence} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span className="font-medium">{confidence} confidence</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{data.count} outcome(s)</span>
                      <span className="font-medium">₹{data.amount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
