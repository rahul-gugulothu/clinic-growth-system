import { useStore, selectDoctorsByClinic, selectStaffByClinic } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';

export default function ClinicSettingsPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const clinic = clinicId ? clinics[clinicId] : undefined;
  const doctors = useStore((s) => (clinicId ? selectDoctorsByClinic(clinicId)(s) : []));
  const staff = useStore((s) => (clinicId ? selectStaffByClinic(clinicId)(s) : []));

  const updateClinic = useStore((s) => s.updateClinic);
  const updateDoctor = useStore((s) => s.updateDoctor);
  const updateStaff = useStore((s) => s.updateStaff);

  if (!clinic) {
    return (
      <div className="p-6 text-sm text-muted-foreground">No clinic configured.</div>
    );
  }

  const saveClinic = () => {
    updateClinic(clinic.clinic_id, {
      name: clinic.name,
      address: clinic.address,
      specialty: clinic.specialty,
      working_hours: clinic.working_hours,
      phone: clinic.phone,
      website: clinic.website,
      whatsapp_number: clinic.whatsapp_number,
    });
    toast.success('Clinic settings saved');
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Clinic configuration and preferences.</p>
      </div>

      <SyntheticDataBanner />

      <Card>
        <CardHeader>
          <CardTitle>Clinic</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Clinic name</Label>
            <Input value={clinic.name} onChange={(e) => updateClinic(clinic.clinic_id, { name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Specialty</Label>
            <Input value={clinic.specialty} onChange={(e) => updateClinic(clinic.clinic_id, { specialty: e.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address</Label>
            <Input value={clinic.address} onChange={(e) => updateClinic(clinic.clinic_id, { address: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Working hours</Label>
            <Input value={clinic.working_hours} onChange={(e) => updateClinic(clinic.clinic_id, { working_hours: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={clinic.phone} onChange={(e) => updateClinic(clinic.clinic_id, { phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={clinic.website} onChange={(e) => updateClinic(clinic.clinic_id, { website: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp number</Label>
            <Input value={clinic.whatsapp_number} onChange={(e) => updateClinic(clinic.clinic_id, { whatsapp_number: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={saveClinic}>Save clinic settings</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {doctors.length === 0 && <p className="text-sm text-muted-foreground">No doctors yet.</p>}
          {doctors.map((d) => (
            <div key={d.doctor_id} className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={d.name} onChange={(e) => updateDoctor(d.doctor_id, { name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Specialty</Label>
                <Input value={d.specialty} onChange={(e) => updateDoctor(d.doctor_id, { specialty: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={d.role}
                  onChange={(e) => updateDoctor(d.doctor_id, { role: e.target.value as any })}
                >
                  <option>Owner</option>
                  <option>Consultant</option>
                  <option>Resident</option>
                </select>
              </div>
              <div className="flex items-center">
                <Badge tone={d.status === 'Active' ? 'success' : 'muted'}>{d.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {staff.length === 0 && <p className="text-sm text-muted-foreground">No staff yet.</p>}
          {staff.map((s) => (
            <div key={s.staff_id} className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={s.name} onChange={(e) => updateStaff(s.staff_id, { name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={s.role}
                  onChange={(e) => updateStaff(s.staff_id, { role: e.target.value as any })}
                >
                  <option>Reception</option>
                  <option>Coordinator</option>
                  <option>Manager</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={s.email} onChange={(e) => updateStaff(s.staff_id, { email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={s.phone} onChange={(e) => updateStaff(s.staff_id, { phone: e.target.value })} />
              </div>
              <div className="flex items-center">
                <Badge tone={s.status === 'Active' ? 'success' : 'muted'}>{s.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Communication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>WhatsApp configuration and notification preferences are placeholders in V1.</p>
          <p>Real integrations will be added in a later milestone after the core workflow is validated.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Google Business Profile, Practice Management System, and calendar integrations are not implemented in V1.</p>
          <p>These placeholders document the intended integration points.</p>
        </CardContent>
      </Card>
    </div>
  );
}