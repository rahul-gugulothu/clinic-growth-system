import type { PriorityClinicsResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';
import { EmptyCard } from './EmptyCard';

interface PriorityClinicsCardProps {
  data: PriorityClinicsResult;
}

export function PriorityClinicsCard({ data }: PriorityClinicsCardProps) {
  if (data.clinics.length === 0) {
    return <EmptyCard message="No priority clinics found." />;
  }

  return (
    <div className="space-y-2">
      {data.clinics.map((clinic: { prospectId: string; clinicName: string; priority: string; currentStage: string; reason: string; nextAction: string }, index: number) => (
        <Card key={clinic.prospectId}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {index + 1}. {clinic.clinicName}
              </CardTitle>
              <Badge tone={clinic.priority === 'High' ? 'destructive' : clinic.priority === 'Medium' ? 'warning' : 'muted'}>
                {clinic.priority}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Stage:</span>
              <span className="font-medium text-foreground">{clinic.currentStage}</span>
            </div>
            <p className="text-muted-foreground">{clinic.reason}</p>
            <div className="flex items-center gap-1 text-xs text-primary">
              <ArrowRight className="h-3 w-3" />
              <span>{clinic.nextAction}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
