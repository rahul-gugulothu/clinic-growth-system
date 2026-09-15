import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, PhoneIncoming, Sparkles, Calendar, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, selectAppointmentsByClinic, selectLeadById, selectDoctorById, selectFollowupsByAppointment } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';
import { suggestNoShowRecovery } from '@/lib/aiSuggestions';
import AiSuggestionPanel from '@/components/AiSuggestionPanel';

type ViewMode = 'day' | 'week' | 'month';

function statusTone(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info' {
  switch (status) {
    case 'Booked':
      return 'info';
    case 'Attended':
      return 'success';
    case 'NoShow':
      return 'destructive';
    case 'Cancelled':
      return 'muted';
    default:
      return 'default';
  }
}

export default function AppointmentsPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const allAppointments = useStore((s) => (clinicId ? selectAppointmentsByClinic(clinicId)(s) : []));
  const setAppointmentStatus = useStore((s) => s.setAppointmentStatus);
  const addReview = useStore((s) => s.addReview);
  const addFollowup = useStore((s) => s.addFollowup);
  const updateAppointment = useStore((s) => s.updateAppointment);
  const addAppointment = useStore((s) => s.addAppointment);

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleWhen, setRescheduleWhen] = useState('');
  const [showRecoveryId, setShowRecoveryId] = useState<string | null>(null);
  const [createLeadId, setCreateLeadId] = useState('');
  const [createDoctorId, setCreateDoctorId] = useState('');
  const [createWhen, setCreateWhen] = useState('');
  const [reminderStatus, setReminderStatus] = useState('Pending');

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const todayAppointments = useMemo(() => {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return allAppointments
      .filter((a) => {
        const d = new Date(a.scheduled_at);
        return d >= start && d < end;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [allAppointments, today]);

  const weekAppointments = useMemo(() => {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return allAppointments
      .filter((a) => {
        const d = new Date(a.scheduled_at);
        return d >= start && d < end;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [allAppointments, today]);

  const monthAppointments = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return allAppointments
      .filter((a) => {
        const d = new Date(a.scheduled_at);
        return d >= start && d <= end;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [allAppointments, today]);

  const visibleAppointments = useMemo(() => {
    if (viewMode === 'day') return todayAppointments;
    if (viewMode === 'week') return weekAppointments;
    return monthAppointments;
  }, [viewMode, todayAppointments, weekAppointments, monthAppointments]);

  const selectedAppointment = selectedId ? allAppointments.find((a) => a.appointment_id === selectedId) : undefined;
  const selectedLead = selectedAppointment ? selectLeadById(selectedAppointment.lead_id)(useStore.getState()) : undefined;
  const selectedDoctor = selectedAppointment?.doctor_id ? selectDoctorById(selectedAppointment.doctor_id)(useStore.getState()) : undefined;
  const selectedFollowups = selectedAppointment ? selectFollowupsByAppointment(selectedAppointment.appointment_id)(useStore.getState()) : [];
  const allLeads = useStore((s) => Object.values(s.leads));
  const allDoctors = useStore((s) => (clinicId ? Object.values(s.doctors).filter((d) => d.clinic_id === clinicId) : []));

  const upcomingCount = todayAppointments.filter((a) => a.status === 'Booked').length;
  const attendedCount = todayAppointments.filter((a) => a.status === 'Attended').length;
  const noShowCount = todayAppointments.filter((a) => a.status === 'NoShow').length;
  const cancelledCount = todayAppointments.filter((a) => a.status === 'Cancelled').length;

  const markAttended = (a: any) => {
    try {
      setAppointmentStatus(a.appointment_id, 'Attended');
      const lead = selectLeadById(a.lead_id)(useStore.getState());
      const cId = lead?.clinic_id || clinicId;
      addReview({ clinic_id: cId, appointment_id: a.appointment_id, source: 'Google' });
      toast.success('Marked attended; review request created');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const markNoShow = (a: any) => {
    try {
      setAppointmentStatus(a.appointment_id, 'NoShow');
      addFollowup({
        lead_id: a.lead_id,
        appointment_id: a.appointment_id,
        type: 'Recovery',
        scheduled_at: new Date().toISOString(),
        channel: 'WhatsApp',
      });
      toast.success('Marked no-show; recovery follow-up created');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const cancelAppt = (a: any) => {
    try {
      setAppointmentStatus(a.appointment_id, 'Cancelled');
      addFollowup({
        lead_id: a.lead_id,
        appointment_id: a.appointment_id,
        type: 'Reschedule',
        scheduled_at: new Date().toISOString(),
        channel: 'WhatsApp',
      });
      toast.success('Cancelled; rescheduling follow-up created');
    } catch (e: any) {
      toast.error(e?.message ?? 'Invalid transition');
    }
  };

  const createAppointment = () => {
    if (!createLeadId || !createDoctorId || !createWhen) {
      toast.error('Fill all fields');
      return;
    }
    try {
      addAppointment({
        lead_id: createLeadId,
        doctor_id: createDoctorId,
        scheduled_at: new Date(createWhen).toISOString(),
      });
      toast.success('Appointment created');
      setShowCreate(false);
      setCreateLeadId('');
      setCreateDoctorId('');
      setCreateWhen('');
      setReminderStatus('Pending');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create');
    }
  };

  const rescheduleAppointment = () => {
    if (!selectedAppointment || !rescheduleWhen) {
      toast.error('Select a new date/time');
      return;
    }
    try {
      updateAppointment(selectedAppointment.appointment_id, { scheduled_at: new Date(rescheduleWhen).toISOString() });
      toast.success('Appointment rescheduled');
      setShowReschedule(false);
      setRescheduleWhen('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to reschedule');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
        <p className="text-sm text-muted-foreground">
          Clinic schedule · {fmtDate(today.toISOString())} · {todayAppointments.length} today ({upcomingCount} upcoming, {attendedCount} attended, {noShowCount} no-shows, {cancelledCount} cancelled)
        </p>
      </div>

      <SyntheticDataBanner />

      <div className="flex flex-wrap items-center gap-2">
        {(['day', 'week', 'month'] as const).map((mode) => (
          <Button key={mode} size="sm" variant={viewMode === mode ? 'default' : 'outline'} onClick={() => setViewMode(mode)}>
            {mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Month'}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <UserPlus className="mr-2 h-4 w-4" /> New appointment
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {viewMode === 'day' ? `Today` : viewMode === 'week' ? 'This week' : 'This month'} ({visibleAppointments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visibleAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments in this period.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[calc(100vh-260px)] overflow-y-auto">
                {visibleAppointments.map((a) => {
                  const lead = selectLeadById(a.lead_id)(useStore.getState());
                  const doctor = a.doctor_id ? selectDoctorById(a.doctor_id)(useStore.getState()) : undefined;
                  const isSelected = a.appointment_id === selectedId;
                  return (
                    <button
                      key={a.appointment_id}
                      type="button"
                      onClick={() => setSelectedId(a.appointment_id)}
                      className={`w-full rounded-md border p-3 text-left transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {fmtDateTime(a.scheduled_at)}
                        </span>
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {lead?.service_interested ?? '—'} · {doctor?.name ?? '—'}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Reminder: {a.reminder_status}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{selectedAppointment ? 'Appointment detail' : 'Select an appointment'}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedAppointment ? (
              <p className="text-sm text-muted-foreground">Pick an appointment from the list to view details and actions.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Appointment:</span> {selectedAppointment.appointment_id}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <Badge tone={statusTone(selectedAppointment.status)}>{selectedAppointment.status}</Badge>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Date / time:</span> {fmtDateTime(selectedAppointment.scheduled_at)}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Reminder:</span> {selectedAppointment.reminder_status}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Lead:</span> {selectedLead?.lead_id ?? '—'}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Service:</span> {selectedLead?.service_interested ?? '—'}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Doctor:</span> {selectedDoctor?.name ?? selectedAppointment.doctor_id}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Lead status:</span>{' '}
                    <Badge tone={selectedLead ? statusTone(selectedLead.status) : 'muted'}>{selectedLead?.status ?? '—'}</Badge>
                  </div>
                </div>

                {selectedFollowups.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Follow-ups</div>
                    {selectedFollowups.map((f) => (
                      <div key={f.followup_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <div>
                          <div className="font-medium">{f.type}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDateTime(f.scheduled_at)} · {f.channel} · {f.status}
                          </div>
                          {f.outcome && <div className="text-xs text-muted-foreground">Outcome: {f.outcome}</div>}
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/clinic/follow-ups">View</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {selectedAppointment.status === 'Booked' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => markAttended(selectedAppointment)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Mark attended
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => markNoShow(selectedAppointment)}>
                        <PhoneIncoming className="mr-2 h-4 w-4" /> Mark no-show
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => cancelAppt(selectedAppointment)}>
                        <XCircle className="mr-2 h-4 w-4" /> Cancel
                      </Button>
                    </>
                  )}
                  {selectedAppointment.status === 'NoShow' && (
                    <Button size="sm" variant="outline" onClick={() => setShowRecoveryId(selectedAppointment.appointment_id)}>
                      <Sparkles className="mr-2 h-4 w-4" /> AI recovery
                    </Button>
                  )}
                  {selectedAppointment.status === 'Booked' && (
                    <Button size="sm" variant="outline" onClick={() => setShowReschedule((v) => !v)}>
                      <Calendar className="mr-2 h-4 w-4" /> Reschedule
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/clinic/leads/${selectedLead?.lead_id}`}>Open lead</Link>
                  </Button>
                </div>

                {showReschedule && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="text-sm font-medium">Reschedule appointment</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="reschedule-when">New date / time (ISO)</Label>
                        <Input
                          id="reschedule-when"
                          value={rescheduleWhen}
                          onChange={(e) => setRescheduleWhen(e.target.value)}
                          placeholder="2026-09-03T11:00:00.000Z"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button onClick={rescheduleAppointment}>Confirm</Button>
                        <Button variant="outline" onClick={() => setShowReschedule(false)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create appointment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="create-lead">Lead</Label>
              <Select id="create-lead" value={createLeadId} onChange={(e) => setCreateLeadId(e.target.value)}>
                <option value="">Select lead</option>
                {allLeads.map((l) => (
                  <option key={l.lead_id} value={l.lead_id}>{l.lead_id} — {l.service_interested}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-doctor">Doctor</Label>
              <Select id="create-doctor" value={createDoctorId} onChange={(e) => setCreateDoctorId(e.target.value)}>
                <option value="">Select doctor</option>
                {allDoctors.map((d) => (
                  <option key={d.doctor_id} value={d.doctor_id}>{d.name} — {d.specialty}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-when">Date / time (ISO)</Label>
              <Input
                id="create-when"
                value={createWhen}
                onChange={(e) => setCreateWhen(e.target.value)}
                placeholder="2026-09-03T11:00:00.000Z"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-reminder">Reminder</Label>
              <Select id="create-reminder" value={reminderStatus} onChange={(e) => setReminderStatus(e.target.value)}>
                <option value="Pending">Pending</option>
                <option value="Sent">Sent</option>
                <option value="Skipped">Skipped</option>
              </Select>
            </div>
            <div className="flex items-end gap-2 md:col-span-4">
              <Button onClick={createAppointment}>Create</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showRecoveryId && (() => {
        const appt = allAppointments.find((a) => a.appointment_id === showRecoveryId);
        if (!appt || appt.status !== 'NoShow') return null;
        const lead = selectLeadById(appt.lead_id)(useStore.getState());
        if (!lead) return null;
        const suggestion = suggestNoShowRecovery(appt, lead);
        if (!suggestion) return null;
        return (
          <AiSuggestionPanel
            title="AI no-show recovery assistance"
            onDismiss={() => setShowRecoveryId(null)}
            acceptLabel="Use message"
            onAccept={() => {
              toast.success('Recovery message ready. Copy it from the panel to use in WhatsApp or a follow-up.');
            }}
          >
            <p>{suggestion.message}</p>
            <p className="text-xs text-muted-foreground">Copy this message and send it via WhatsApp or your follow-up workflow. It will not be sent automatically.</p>
          </AiSuggestionPanel>
        );
      })()}
    </div>
  );
}
