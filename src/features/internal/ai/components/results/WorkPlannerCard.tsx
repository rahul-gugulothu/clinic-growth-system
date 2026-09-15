import type { WorkPlannerResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import { EmptyCard } from './EmptyCard';

interface WorkPlannerCardProps {
  data: WorkPlannerResult;
}

export function WorkPlannerCard({ data }: WorkPlannerCardProps) {
  const hasTasks = data.doNow.length > 0 || data.doToday.length > 0 || data.optional.length > 0;

  if (!hasTasks) {
    return <EmptyCard message="No tasks identified for today." />;
  }

  return (
    <div className="space-y-3">
      {data.doNow.length > 0 && (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-red-600" />
              Do Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {data.doNow.map((task: { task: string; reason: string }, i: number) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{task.task}</span>
                  <span className="text-muted-foreground"> — {task.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.doToday.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600" />
              Do Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {data.doToday.map((task: { task: string; reason: string }, i: number) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{task.task}</span>
                  <span className="text-muted-foreground"> — {task.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.optional.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              Optional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {data.optional.map((task: { task: string; reason: string }, i: number) => (
                <li key={i} className="text-sm text-muted-foreground">
                  <span className="font-medium">{task.task}</span>
                  <span> — {task.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
