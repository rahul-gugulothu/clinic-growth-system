import type { AuditSummaryResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Lightbulb, ArrowRight } from 'lucide-react';
import { EmptyCard } from './EmptyCard';

interface AuditSummaryCardProps {
  data: AuditSummaryResult;
}

export function AuditSummaryCard({ data }: AuditSummaryCardProps) {
  if (data.insufficientData) {
    return <EmptyCard message="This audit does not yet contain enough verified findings to explain growth opportunities. Complete additional audit areas to enable analysis." />;
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {data.prospectName}
            </CardTitle>
            <Badge tone={data.overallOpportunity === 'High' ? 'success' : data.overallOpportunity === 'Medium' ? 'warning' : 'muted'}>
              {data.overallOpportunity} opportunity
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Areas reviewed:</span>
            <span className="ml-1 font-medium">{data.areasReviewed}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Weaknesses:</span>
            <span className="ml-1 font-medium">{data.weaknessesCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Recommendations:</span>
            <span className="ml-1 font-medium">{data.recommendationsCount}</span>
          </div>
        </CardContent>
      </Card>

      {data.identifiedProblems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Identified Problems
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.identifiedProblems.map((problem: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{problem}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.recommendations.map((rec: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.areaFindings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Area Findings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {data.areaFindings.map((finding: { label: string; value: string }, i: number) => (
                <div key={i}>
                  <span className="font-medium">{finding.label}:</span> {finding.value}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            Next Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
              {data.nextActions.map((action: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
