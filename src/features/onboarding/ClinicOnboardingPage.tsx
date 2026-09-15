import { useState, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Stethoscope, Users, Briefcase, Clock, MessageSquare, TrendingUp, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore, selectProspectById, selectProposalsByProspect } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/utils/cn';

type DoctorRole = 'Owner' | 'Consultant' | 'Resident';
type StaffRole = 'Reception' | 'Coordinator' | 'Manager';

interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
  required?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'profile', label: 'Clinic profile', icon: Stethoscope, required: true },
  { id: 'team', label: 'Team', icon: Users, required: true },
  { id: 'services', label: 'Services', icon: Briefcase },
  { id: 'hours', label: 'Working hours', icon: Clock },
  { id: 'communication', label: 'Communication', icon: MessageSquare },
  { id: 'goals', label: 'Growth goals', icon: TrendingUp },
  { id: 'baseline', label: 'Baseline metrics', icon: BarChart3 },
];

export default function ClinicOnboardingPage() {
  const { prospectId = '' } = useParams();
  const navigate = useNavigate();
  const prospect = useStore(selectProspectById(prospectId));
  const proposals = useStore(selectProposalsByProspect(prospectId));
  const onboard = useStore((s) => s.onboardClinicFromProspect);

  const acceptedProposal = useMemo(
    () => proposals.find((p) => p.status === 'Accepted') || null,
    [proposals]
  );

  const [name, setName] = useState(prospect?.clinic_name ?? '');
  const [specialty, setSpecialty] = useState(prospect?.specialty ?? '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [phone, setPhone] = useState(prospect?.phone ?? '');
  const [website, setWebsite] = useState(prospect?.website ?? '');
  const [whatsapp_number, setWhatsapp] = useState(prospect?.phone ?? '');
  const [working_hours, setHours] = useState('Mon–Sat, 10:00–19:00');
  const [growth_goals, setGoals] = useState('Improve qualified enquiry volume by 30% in 90 days.');
  const [baseline_metrics, setBaseline] = useState('~30 enquiries/month, ~12 qualified, ~8 bookings.');

  const [doctors_, setDoctors] = useState([
    { name: prospect?.doctor_name ?? 'Dr. Doctor One', specialty: prospect?.specialty ?? 'Dermatology', role: 'Owner' as DoctorRole },
  ]);
  const [staff_, setStaff] = useState([
    { name: 'Reception One', role: 'Reception' as StaffRole, email: 'reception@example.com', phone: '+91 98000 00001' },
  ]);

  const sectionStates = useMemo(() => {
    const profileComplete = !!(name && city);
    const teamComplete = doctors_.length > 0 && doctors_.every((d) => d.name.trim()) && staff_.length > 0 && staff_.every((s) => s.name.trim());
    const servicesComplete = !!acceptedProposal?.proposed_service;
    const hoursComplete = !!working_hours.trim();
    const communicationComplete = !!(phone || website || whatsapp_number);
    const goalsComplete = !!growth_goals.trim();
    const baselineComplete = !!baseline_metrics.trim();
    return {
      profile: profileComplete,
      team: teamComplete,
      services: servicesComplete,
      hours: hoursComplete,
      communication: communicationComplete,
      goals: goalsComplete,
      baseline: baselineComplete,
    };
  }, [name, city, doctors_, staff_, acceptedProposal, working_hours, phone, website, whatsapp_number, growth_goals, baseline_metrics]);

  if (!prospect) {
    return (
      <div className="p-6">
        <p className="text-sm">Prospect not found.</p>
        <Button asChild variant="link">
          <Link to="/internal/prospects">Back to prospects</Link>
        </Button>
      </div>
    );
  }

  const completedCount = Object.values(sectionStates).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / SECTIONS.length) * 100);
  const canComplete = sectionStates.profile && sectionStates.team;

  const submit = () => {
    if (!name || !city) {
      toast.error('Clinic name and city are required.');
      return;
    }
    if (doctors_.length === 0 || !doctors_.every((d) => d.name.trim())) {
      toast.error('At least one doctor with a name is required.');
      return;
    }
    if (staff_.length === 0 || !staff_.every((s) => s.name.trim())) {
      toast.error('At least one staff member with a name is required.');
      return;
    }
    const clinicId = onboard(prospectId, {
      name,
      specialty,
      address,
      city,
      phone,
      website,
      whatsapp_number,
      working_hours,
      growth_goals,
      baseline_metrics,
      doctors: doctors_,
      staff: staff_,
    });
    toast.success('Clinic onboarded successfully.');
    navigate(`/clinic/`);
    void clinicId;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/internal/prospects')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {acceptedProposal && (
          <Badge tone="success">Accepted proposal</Badge>
        )}
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Clinic onboarding</h1>
        <p className="text-sm text-muted-foreground">
          Convert <strong>{prospect.clinic_name}</strong> into an active clinic. Research and audit history are preserved.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full bg-primary transition-all', progressPercent === 100 ? 'bg-green-600' : '')}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-medium">{completedCount}/{SECTIONS.length}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {SECTIONS.map((s) => {
              const done = sectionStates[s.id as keyof typeof sectionStates];
              return (
                <div
                  key={s.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-2 text-xs',
                    done ? 'border-green-200 bg-green-50' : 'border-dashed bg-muted/20'
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={cn('font-medium', done ? 'text-green-800' : 'text-muted-foreground')}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clinic profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Clinic name" v={name} onChange={setName} required />
          <Field label="Specialty" v={specialty} onChange={setSpecialty} />
          <Field label="Phone" v={phone} onChange={setPhone} />
          <Field label="WhatsApp number" v={whatsapp_number} onChange={setWhatsapp} />
          <Field label="Website" v={website} onChange={setWebsite} />
          <Field label="Working hours" v={working_hours} onChange={setHours} />
          <Field label="Address" v={address} onChange={setAddress} />
          <Field label="City" v={city} onChange={setCity} required />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {doctors_.map((d, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-4">
              <Field label="Name" v={d.name} onChange={(v) => updateAt(setDoctors, doctors_, i, { ...d, name: v })} required />
              <Field label="Specialty" v={d.specialty} onChange={(v) => updateAt(setDoctors, doctors_, i, { ...d, specialty: v })} />
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={d.role} onChange={(e) => updateAt(setDoctors, doctors_, i, { ...d, role: e.target.value as DoctorRole })}>
                  <option>Owner</option>
                  <option>Consultant</option>
                  <option>Resident</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => setDoctors(doctors_.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setDoctors([...doctors_, { name: '', specialty: '', role: 'Consultant' }])}>
            Add doctor
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {staff_.map((s, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-5">
              <Field label="Name" v={s.name} onChange={(v) => updateAt(setStaff, staff_, i, { ...s, name: v })} required />
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={s.role} onChange={(e) => updateAt(setStaff, staff_, i, { ...s, role: e.target.value as StaffRole })}>
                  <option>Reception</option>
                  <option>Coordinator</option>
                  <option>Manager</option>
                </Select>
              </div>
              <Field label="Email" v={s.email} onChange={(v) => updateAt(setStaff, staff_, i, { ...s, email: v })} />
              <Field label="Phone" v={s.phone} onChange={(v) => updateAt(setStaff, staff_, i, { ...s, phone: v })} />
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => setStaff(staff_.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setStaff([...staff_, { name: '', role: 'Reception', email: '', phone: '' }])}>
            Add staff
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {acceptedProposal ? (
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              <span>Proposed service: <strong className="text-foreground">{acceptedProposal.proposed_service}</strong></span>
            </div>
          ) : (
            <p>No accepted proposal found for this prospect. Service configuration is not available in the current data model.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Communication</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground">Phone</span>
              <div className="font-medium">{phone || '—'}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground">WhatsApp</span>
              <div className="font-medium">{whatsapp_number || '—'}</div>
            </div>
          </div>
          <div className="flex items-start gap-2 md:col-span-2">
            <Globe className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground">Website</span>
              <div className="font-medium">{website || '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Growth goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={growth_goals} onChange={(e) => setGoals(e.target.value)} />
          <p className="text-xs text-muted-foreground">Configuration context only. Not persisted in the current clinic data model.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Baseline metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={baseline_metrics} onChange={(e) => setBaseline(e.target.value)} />
          <p className="text-xs text-muted-foreground">Configuration context only. Not persisted in the current clinic data model.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Handoff summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Clinic identity</span>
              <span className={cn('font-medium', sectionStates.profile ? 'text-green-700' : 'text-red-700')}>
                {sectionStates.profile ? 'Complete' : 'Incomplete'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Team configured</span>
              <span className={cn('font-medium', sectionStates.team ? 'text-green-700' : 'text-red-700')}>
                {sectionStates.team ? 'Complete' : 'Incomplete'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Services</span>
              <span className={cn('font-medium', sectionStates.services ? 'text-green-700' : 'text-amber-700')}>
                {sectionStates.services ? 'From proposal' : 'Not configured'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Working hours</span>
              <span className={cn('font-medium', sectionStates.hours ? 'text-green-700' : 'text-amber-700')}>
                {sectionStates.hours ? 'Set' : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Communication</span>
              <span className={cn('font-medium', sectionStates.communication ? 'text-green-700' : 'text-amber-700')}>
                {sectionStates.communication ? 'Configured' : 'Partial'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Growth goals</span>
              <span className={cn('font-medium', sectionStates.goals ? 'text-green-700' : 'text-amber-700')}>
                {sectionStates.goals ? 'Set' : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Baseline metrics</span>
              <span className={cn('font-medium', sectionStates.baseline ? 'text-green-700' : 'text-amber-700')}>
                {sectionStates.baseline ? 'Set' : 'Not set'}
              </span>
            </div>
          </div>
          {!canComplete && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4" />
              <span>Complete clinic profile and team before onboarding.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(`/internal/prospects/${prospectId}`)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canComplete}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Complete onboarding
        </Button>
      </div>
    </div>
  );
}

function Globe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function Field({
  label,
  v,
  onChange,
  required,
}: {
  label: string;
  v: string;
  onChange: (x: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input value={v} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function updateAt<T>(setter: (x: T[]) => void, arr: T[], i: number, val: T) {
  const next = arr.slice();
  next[i] = val;
  setter(next);
}
