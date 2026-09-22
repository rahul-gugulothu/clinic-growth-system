import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Settings } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getIntegrationHealth, ApiError } from '@/api/client';
import type { IntegrationHealthResponse } from '@/features/internal/ai/types/api';

const PROVIDER_LABELS: Record<string, string> = {
  sendgrid: 'SendGrid',
};

type HealthStatus = 'healthy' | 'unhealthy' | 'unsupported' | 'not_configured';

const getHealthStatus = (entry: {
  configured: boolean;
  missing_keys: string[];
  healthy: boolean | null;
}): HealthStatus => {
  if (!entry.configured) return 'not_configured';
  if (entry.healthy === null) return 'unsupported';
  if (entry.healthy) return 'healthy';
  return 'unhealthy';
};

const STATUS_ICONS: Record<HealthStatus, React.ComponentType<{ className?: string }>> = {
  healthy: CheckCircle,
  unhealthy: XCircle,
  unsupported: AlertCircle,
  not_configured: AlertCircle,
};

const STATUS_TONES: Record<HealthStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'muted'> = {
  healthy: 'success',
  unhealthy: 'destructive',
  unsupported: 'warning',
  not_configured: 'muted',
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
  unsupported: 'No health check',
  not_configured: 'Not configured',
};

export default function IntegrationHealthPage() {
  const [health, setHealth] = useState<IntegrationHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getIntegrationHealth();
      setHealth(result);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message : 'Failed to load health status'
      );
      setHealth(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const allHealthy = health?.all_healthy ?? false;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Integration Health</h1>
          <p className="text-sm text-muted-foreground">
            Verify that your provider credentials and connections are working.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={allHealthy && health ? 'success' : isLoading ? 'info' : 'warning'}>
            {isLoading ? 'Checking...' : allHealthy ? 'All healthy' : 'Issues found'}
          </Badge>
          <Button variant="outline" size="sm" onClick={loadHealth} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            <span className="ml-1">Check health</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {isLoading && !health && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      )}

      {health && (
        <div className="space-y-4">
          {Object.entries(health.integrations).map(([provider, entry]) => {
            const status = getHealthStatus(entry);
            const Icon = STATUS_ICONS[status];
            const providerLabel = PROVIDER_LABELS[provider] ?? provider;

            return (
              <div
                key={provider}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{providerLabel}</span>
                    <Badge tone={STATUS_TONES[status]}>
                      {STATUS_LABELS[status]}
                    </Badge>
                  </div>

                  {entry.configured && entry.missing_keys.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      All required keys configured
                    </div>
                  )}

                  {entry.missing_keys.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Missing: {entry.missing_keys.join(', ')}
                    </div>
                  )}

                  {entry.checked_at && (
                    <div className="text-xs text-muted-foreground">
                      Last checked: {new Date(entry.checked_at).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Icon className={cn('h-5 w-5', {
                    'text-success': status === 'healthy',
                    'text-destructive': status === 'unhealthy',
                    'text-warning': status === 'unsupported' || status === 'not_configured',
                  })} />
                  <span className="text-muted-foreground">
                    {entry.healthy === null ? '—' : entry.healthy ? 'OK' : 'Failed'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!health && !isLoading && !error && (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No integration providers configured.
        </div>
      )}
    </div>
  );
}
