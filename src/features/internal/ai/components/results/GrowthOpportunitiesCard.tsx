import type { GrowthOpportunitiesResult } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyCard } from './EmptyCard';

interface GrowthOpportunitiesCardProps {
  data: GrowthOpportunitiesResult;
}

export function GrowthOpportunitiesCard({ data }: GrowthOpportunitiesCardProps) {
  if (data.opportunities.length === 0) {
    return <EmptyCard message="No specific growth opportunities identified with current data." />;
  }

  return (
    <div className="space-y-2">
      {data.opportunities.map((opp: { opportunity: string; evidence: string; suggestedAction: string; confidence: string }, index: number) => (
        <Card key={index}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {index + 1}. {opp.opportunity}
              </CardTitle>
              <Badge tone={opp.confidence === 'high' ? 'success' : opp.confidence === 'medium' ? 'warning' : 'muted'}>
                {opp.confidence}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Evidence:</span> {opp.evidence}</p>
            <p><span className="text-muted-foreground">Action:</span> {opp.suggestedAction}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
