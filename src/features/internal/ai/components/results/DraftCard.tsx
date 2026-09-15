import { useState } from 'react';
import type { DraftMessageResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle2 } from 'lucide-react';

interface DraftCardProps {
  data: DraftMessageResult;
  channel: string;
}

export function DraftCard({ data, channel }: DraftCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {channel} Draft for {data.recipient}
            </CardTitle>
            <Badge tone="warning">Human review required</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm font-mono">
            {data.draftText}
          </pre>
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
