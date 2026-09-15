import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, MessageSquare, BarChart2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ActivityItem } from '../types';

interface ActivityTimelineProps {
  items?: ActivityItem[];
}

const TYPE_CONFIG = {
  summary: { icon: FileText, label: 'Summary', color: 'text-blue-500' },
  draft: { icon: MessageSquare, label: 'Draft', color: 'text-green-500' },
  report: { icon: BarChart2, label: 'Report', color: 'text-purple-500' },
};

export function ActivityTimeline({ items = [] }: ActivityTimelineProps) {
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">AI Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your AI-generated summaries, outreach drafts, and reports will appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((item, index) => {
              const config = TYPE_CONFIG[item.type];
              const Icon = config.icon;
              return (
                <div key={item.id} className="flex gap-3">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      'bg-muted',
                      config.color
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  {index < items.length - 1 && (
                    <div className="absolute left-4 top-12 h-full w-px bg-border" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
