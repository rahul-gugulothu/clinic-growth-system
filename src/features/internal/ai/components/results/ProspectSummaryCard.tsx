import type { ProspectSummaryResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, MapPin, FileText, Send, CheckCircle2 } from 'lucide-react';

interface ProspectSummaryCardProps {
  data: ProspectSummaryResult;
}

export function ProspectSummaryCard({ data }: ProspectSummaryCardProps) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              {data.clinic}
            </CardTitle>
            <Badge tone={data.priority === 'High' ? 'destructive' : data.priority === 'Medium' ? 'warning' : 'muted'}>
              {data.priority}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{data.doctor}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{data.specialty} · {data.area}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Research</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data.researchSummary}</p>
        </CardContent>
      </Card>

      {data.auditSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.auditSummary}</p>
          </CardContent>
        </Card>
      )}

      {data.outreachStatus && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Send className="h-4 w-4" />
              Outreach
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.outreachStatus}</p>
          </CardContent>
        </Card>
      )}

      {data.proposalStatus && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Proposal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.proposalStatus}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recommended Next Action</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">{data.recommendedNextAction}</p>
        </CardContent>
      </Card>
    </div>
  );
}
