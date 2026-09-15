import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface AiSuggestionPanelProps {
  title: string;
  badge?: string;
  children: React.ReactNode;
  onDismiss: () => void;
  acceptLabel?: string;
  onAccept?: () => void;
  dismissLabel?: string;
}

export default function AiSuggestionPanel({
  title,
  badge = 'AI Suggestion',
  children,
  onDismiss,
  acceptLabel = 'Use suggestion',
  onAccept,
  dismissLabel = 'Dismiss',
}: AiSuggestionPanelProps) {
  return (
    <Card className="border-primary/60 bg-primary/5 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold text-primary">{title}</CardTitle>
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">{badge}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-foreground">{children}</div>
        <div className="flex flex-wrap gap-2">
          {onAccept && (
            <Button size="sm" onClick={onAccept}>
              {acceptLabel}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            {dismissLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
