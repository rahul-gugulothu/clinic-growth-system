import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useStore } from '@/store';
import type { AuditOpportunity } from '@/types/status';
import type { ClinicAudit } from '@/types/entities';

interface AuditFormModalProps {
  prospectId: string;
  prospectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit?: ClinicAudit | null;
}

export function AuditFormModal({ prospectId, prospectName, open, onOpenChange, audit }: AuditFormModalProps) {
  const createAudit = useStore((s) => s.createAudit);
  const updateAudit = useStore((s) => s.updateAudit);
  const isEditing = !!audit;

  const [discovery, setDiscovery] = useState('');
  const [googleSearch, setGoogleSearch] = useState('');
  const [website, setWebsite] = useState('');
  const [reviews, setReviews] = useState('');
  const [enquiryProcess, setEnquiryProcess] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [booking, setBooking] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [content, setContent] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [identifiedProblems, setIdentifiedProblems] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [opportunity, setOpportunity] = useState<AuditOpportunity>('Medium');

  useEffect(() => {
    if (open && audit) {
      setDiscovery(audit.discovery || '');
      setGoogleSearch(audit.google_presence || '');
      setWebsite(audit.website || '');
      setReviews(audit.reviews || '');
      setEnquiryProcess(audit.enquiry_process || '');
      setWhatsapp(audit.whatsapp || '');
      setBooking(audit.booking || '');
      setFollowUp(audit.follow_up || '');
      setContent(audit.content || '');
      setCompetitors(audit.competitors || '');
      setIdentifiedProblems(audit.identified_problems || '');
      setRecommendations(audit.recommendations || '');
      setOpportunity(audit.overall_opportunity);
    } else if (!open) {
      reset();
    }
  }, [open, audit]);

  const reset = () => {
    setDiscovery('');
    setGoogleSearch('');
    setWebsite('');
    setReviews('');
    setEnquiryProcess('');
    setWhatsapp('');
    setBooking('');
    setFollowUp('');
    setContent('');
    setCompetitors('');
    setIdentifiedProblems('');
    setRecommendations('');
    setOpportunity('Medium');
  };

  const handleSave = () => {
    try {
      if (isEditing && audit) {
        updateAudit(audit.audit_id, {
          discovery,
          google_presence: googleSearch,
          website,
          reviews,
          enquiry_process: enquiryProcess,
          whatsapp,
          booking,
          follow_up: followUp,
          content,
          competitors,
          identified_problems: identifiedProblems,
          recommendations,
          overall_opportunity: opportunity,
        });
        toast.success('Audit updated');
      } else {
        createAudit({
          prospect_id: prospectId,
          discovery,
          google_presence: googleSearch,
          website,
          reviews,
          enquiry_process: enquiryProcess,
          whatsapp,
          booking,
          follow_up: followUp,
          content,
          competitors,
          identified_problems: identifiedProblems,
          recommendations,
          overall_opportunity: opportunity,
        });
        toast.success('Audit created');
      }
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save audit');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit audit' : 'Create audit'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update findings for' : 'Document the audit for'}{' '}
            <span className="font-medium">{prospectName}</span>. Findings
            appear in this prospect&apos;s Audit History and in the Audits list.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="1. Google / Search presence" v={googleSearch} onChange={setGoogleSearch} />
          <Field label="2. Website" v={website} onChange={setWebsite} />
          <Field label="3. Reviews" v={reviews} onChange={setReviews} />
          <Field label="4. Enquiry process" v={enquiryProcess} onChange={setEnquiryProcess} />
          <Field label="5. WhatsApp" v={whatsapp} onChange={setWhatsapp} />
          <Field label="6. Booking" v={booking} onChange={setBooking} />
          <Field label="7. Follow-up" v={followUp} onChange={setFollowUp} />
          <Field label="8. Content" v={content} onChange={setContent} />
          <Field label="9. Competitors" v={competitors} onChange={setCompetitors} />
          <Field label="Discovery (extra context)" v={discovery} onChange={setDiscovery} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-problems">Identified problems</Label>
          <Textarea
            id="audit-problems"
            value={identifiedProblems}
            onChange={(e) => setIdentifiedProblems(e.target.value)}
            placeholder="e.g. No WhatsApp auto-reply, slow enquiry response, no booking reminders."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-recs">Recommendations</Label>
          <Textarea
            id="audit-recs"
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            placeholder="e.g. Add WhatsApp Business with auto-reply, set up Google Business Profile posts."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-opp">Opportunity level / result</Label>
          <Select
            id="audit-opp"
            value={opportunity}
            onChange={(e) => setOpportunity(e.target.value as AuditOpportunity)}
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{isEditing ? 'Update audit' : 'Save audit'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  v,
  onChange,
}: {
  label: string;
  v: string;
  onChange: (x: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={v} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
