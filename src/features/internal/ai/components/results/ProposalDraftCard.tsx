import { useState } from 'react';
import type { ProposalDraftResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle2, IndianRupee } from 'lucide-react';

interface ProposalDraftCardProps {
  data: ProposalDraftResult;
}

export function ProposalDraftCard({ data }: ProposalDraftCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `Proposal Draft for ${data.clinic}

Scope: ${data.scope}

Expected Outcomes:
${data.expectedOutcomes}

Timeline: ${data.timeline}
${data.price ? `Price: ₹${data.price.toLocaleString('en-IN')}` : 'Price: To be finalized after scope confirmation'}

Assumptions:
${data.assumptions.map((a) => `• ${a}`).join('\n')}

Next Step: ${data.nextStep}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Proposal Draft for {data.clinic}
            </CardTitle>
            <Badge tone="warning">Human review required</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="font-medium">Scope:</span> {data.scope}
          </div>
          <div>
            <span className="font-medium">Expected Outcomes:</span>
            <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
              {data.expectedOutcomes}
            </pre>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-medium">Timeline:</span> {data.timeline}
          </div>
          <div className="flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Price:</span>
            {data.price ? (
              <span>₹{data.price.toLocaleString('en-IN')}</span>
            ) : (
              <span className="text-muted-foreground">To be finalized after scope confirmation</span>
            )}
          </div>
          <div>
            <span className="font-medium">Assumptions:</span>
            <ul className="mt-1 space-y-1">
              {data.assumptions.map((assumption: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-muted-foreground">
                  <span>•</span>
                  <span>{assumption}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="font-medium">Next Step:</span> {data.nextStep}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? <CheckCircle2 className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Review before sending. Do not send automatically.
        </span>
      </div>
    </div>
  );
}
