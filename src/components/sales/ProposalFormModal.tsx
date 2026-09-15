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
import { useStore } from '@/store';
import type { Proposal } from '@/types/entities';

interface ProposalFormModalProps {
  prospectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal?: Proposal | null;
  onDone?: () => void;
}

export function ProposalFormModal({ prospectId, open, onOpenChange, proposal, onDone }: ProposalFormModalProps) {
  const createProposal = useStore((s) => s.createProposal);
  const updateProposal = useStore((s) => s.updateProposal);
  const isEditing = !!proposal;

  const [problem, setProblem] = useState('');
  const [proposedService, setProposedService] = useState('90-day Clinic Growth Pilot');
  const [expectedOutcomes, setExpectedOutcomes] = useState('');
  const [priceInr, setPriceInr] = useState(75000);
  const [timeline, setTimeline] = useState('90 days');

  useEffect(() => {
    if (open && proposal) {
      setProblem(proposal.problem || '');
      setProposedService(proposal.proposed_service || '');
      setExpectedOutcomes(proposal.expected_outcomes || '');
      setPriceInr(proposal.price_inr || 0);
      setTimeline(proposal.timeline || '');
    } else if (!open) {
      reset();
    }
  }, [open, proposal]);

  const reset = () => {
    setProblem('');
    setProposedService('90-day Clinic Growth Pilot');
    setExpectedOutcomes('');
    setPriceInr(75000);
    setTimeline('90 days');
  };

  const handleSave = () => {
    try {
      if (isEditing && proposal) {
        updateProposal(proposal.proposal_id, {
          problem,
          proposed_service: proposedService,
          expected_outcomes: expectedOutcomes,
          price_inr: priceInr,
          timeline,
        });
        toast.success('Proposal updated');
      } else {
        createProposal({
          prospect_id: prospectId,
          problem,
          proposed_service: proposedService,
          expected_outcomes: expectedOutcomes,
          price_inr: priceInr,
          timeline,
        });
        toast.success('Proposal created');
      }
      reset();
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save proposal');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit proposal' : 'Create proposal'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the proposal details.' : 'Create a new proposal for this prospect.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="proposal-service">Proposed service</Label>
            <Input id="proposal-service" value={proposedService} onChange={(e) => setProposedService(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proposal-problem">Problem / opportunity</Label>
            <Textarea id="proposal-problem" value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What problem does this solve?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proposal-outcomes">Expected outcomes</Label>
            <Textarea id="proposal-outcomes" value={expectedOutcomes} onChange={(e) => setExpectedOutcomes(e.target.value)} placeholder="What results can the clinic expect?" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proposal-price">Price (INR)</Label>
              <Input id="proposal-price" type="number" value={priceInr} onChange={(e) => setPriceInr(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-timeline">Timeline</Label>
              <Input id="proposal-timeline" value={timeline} onChange={(e) => setTimeline(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{isEditing ? 'Update proposal' : 'Create proposal'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
