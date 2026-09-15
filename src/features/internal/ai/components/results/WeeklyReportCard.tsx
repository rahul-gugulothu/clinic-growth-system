import type { WeeklyReportResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { EmptyCard } from './EmptyCard';

interface WeeklyReportCardProps {
  data: WeeklyReportResult;
}

export function WeeklyReportCard({ data }: WeeklyReportCardProps) {
  if (data.insufficientData) {
    return <EmptyCard message="Not enough data for weekly comparison. Add more prospects and conduct more activities to enable weekly tracking." />;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Prospects researched" value={data.prospectsResearched} />
        <Kpi label="Audits completed" value={data.auditsCompleted} />
        <Kpi label="Outreach records" value={data.outreachRecords} />
        <Kpi label="Responses received" value={data.responsesReceived} />
        <Kpi label="Calls" value={data.callsHad} />
        <Kpi label="Proposals created" value={data.proposalsCreated} />
        <Kpi label="Wins" value={data.wins} />
        <Kpi label="Pipeline value" value={`₹${data.pipelineValue.toLocaleString('en-IN')}`} />
      </div>

      {data.biggestBottleneck && (
        <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Bottleneck
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{data.biggestBottleneck}</p>
          </CardContent>
        </Card>
      )}

      {data.notableWins && data.notableWins.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Notable Wins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.notableWins.map((win: string, i: number) => (
                <li key={i}>{win}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recommended Focus</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data.recommendedFocus}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
