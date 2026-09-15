import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IndianRupee, Users, Clock, FileText, TrendingUp } from 'lucide-react';

interface KPIWidgetProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
}

function KPIWidget({ label, value, icon: Icon }: KPIWidgetProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold">{value}</span>
      </div>
    </div>
  );
}

interface ContextSidebarProps {
  pipelineValue?: number;
  activeProspects?: number;
  followUpsDue?: number;
  awaitingDecision?: number;
  winRate?: string;
  activeProspectName?: string;
  activeAuditId?: string;
}

export function ContextSidebar({
  pipelineValue = 0,
  activeProspects = 0,
  followUpsDue = 0,
  awaitingDecision = 0,
  winRate = '0%',
  activeProspectName,
  activeAuditId,
}: ContextSidebarProps) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-muted/20 p-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Live Context</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(activeProspectName || activeAuditId) && (
            <div className="flex flex-col gap-1 rounded-md border p-2">
              <span className="text-xs text-muted-foreground">Active context</span>
              {activeProspectName && (
                <span className="text-sm font-medium">{activeProspectName}</span>
              )}
              {activeAuditId && (
                <span className="text-xs text-muted-foreground">Audit: {activeAuditId}</span>
              )}
            </div>
          )}
          <KPIWidget
            label="Pipeline Value"
            value={`₹${pipelineValue.toLocaleString('en-IN')}`}
            icon={IndianRupee}
          />
          <KPIWidget
            label="Active Prospects"
            value={activeProspects}
            icon={Users}
          />
          <KPIWidget
            label="Follow-ups Due"
            value={followUpsDue}
            icon={Clock}
          />
          <KPIWidget
            label="Awaiting Decision"
            value={awaitingDecision}
            icon={FileText}
          />
          <KPIWidget
            label="Win Rate"
            value={winRate}
            icon={TrendingUp}
          />
        </CardContent>
      </Card>
    </div>
  );
}
