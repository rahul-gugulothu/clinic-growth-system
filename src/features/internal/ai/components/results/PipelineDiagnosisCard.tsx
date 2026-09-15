import type { PipelineDiagnosisResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, Target } from 'lucide-react';

interface PipelineDiagnosisCardProps {
  data: PipelineDiagnosisResult;
}

export function PipelineDiagnosisCard({ data }: PipelineDiagnosisCardProps) {
  const maxCount = data.stages[0]?.count || 1;

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
          {data.stages.map((stage: { name: string; count: number; pct: number }) => (
          <div key={stage.name} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted-foreground">{stage.name}</span>
            <div className="flex-1 h-2 rounded bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded bg-primary/70"
                style={{ width: `${(stage.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right font-medium">{stage.count}</span>
            <span className="w-12 text-right text-xs text-muted-foreground">{stage.pct}%</span>
          </div>
        ))}
      </div>

      {data.bottleneck && (
        <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-yellow-600" />
              Bottleneck
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {data.bottleneck.from} → {data.bottleneck.to}: {data.bottleneck.dropoff} drop
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" />
            Recommendation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{data.recommendation}</p>
        </CardContent>
      </Card>
    </div>
  );
}
