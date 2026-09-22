import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, User, Save, Trash2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label, Input } from '@/components/ui/input';
import {
  setIntegrationConfig,
  getIntegrationConfigStatus,
  deleteIntegrationConfig,
  ApiError,
} from '@/api/client';

const PROVIDER = 'sendgrid';
const CONFIG_KEYS: { key: string; label: string; type: 'password' | 'email' | 'text'; required: boolean; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'api_key', label: 'API Key', type: 'password', required: true, icon: Lock },
  { key: 'from_email', label: 'From Email', type: 'email', required: true, icon: Mail },
  { key: 'from_name', label: 'From Name', type: 'text', required: false, icon: User },
];

export default function IntegrationConfigPage() {
  const navigate = useNavigate();

  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');

  const [configStatus, setConfigStatus] = useState<Record<string, boolean>>({});


  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const loadConfigStatus = useCallback(async () => {
    setIsLoading(true);
    setSaveError(null);
    try {
      const statusMap: Record<string, boolean> = {};
      for (const field of CONFIG_KEYS) {
        const status = await getIntegrationConfigStatus({ provider: PROVIDER, configKey: field.key });
        statusMap[field.key] = status.configured;
      }
      setConfigStatus(statusMap);


    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      const msg = err instanceof Error ? err.message : 'Failed to load configuration status';
      setSaveError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const statusMap: Record<string, boolean> = {};
      for (const field of CONFIG_KEYS) {
        const status = await getIntegrationConfigStatus({ provider: PROVIDER, configKey: field.key });
        statusMap[field.key] = status.configured;
      }
      setConfigStatus(statusMap);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
    }
  }, []);

  useEffect(() => {
    void loadConfigStatus();
  }, [loadConfigStatus]);

  const isConfigured = (key: string): boolean => !!configStatus[key];

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(null);

    const errors: string[] = [];
    if (!fromEmail) errors.push('From Email is required');
    if (!isConfigured('api_key') && !apiKey) {
      errors.push('API Key is required when not yet configured');
    }

    if (errors.length > 0) {
      setSaveError(errors.join('; '));
      return;
    }

    setIsSaving(true);
    try {
      if (apiKey) {
        await setIntegrationConfig({ provider: PROVIDER, configKey: 'api_key', value: apiKey });
      }
      await setIntegrationConfig({ provider: PROVIDER, configKey: 'from_email', value: fromEmail });
      if (fromName) {
        await setIntegrationConfig({ provider: PROVIDER, configKey: 'from_name', value: fromName });
      }

      setApiKey('');
      await refreshStatus();
      setSaveSuccess('Configuration saved successfully');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      for (const field of CONFIG_KEYS) {
        if (isConfigured(field.key)) {
          await deleteIntegrationConfig({ provider: PROVIDER, configKey: field.key });
        }
      }
      setConfigStatus({ api_key: false, from_email: false, from_name: false });
      setApiKey('');
      setFromEmail('');
      setFromName('');
      setSaveSuccess('Configuration deleted');
      setTimeout(() => setSaveSuccess(null), 3000);


    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setSaveError(err instanceof Error ? err.message : 'Failed to delete configuration');
    } finally {
      setIsDeleting(false);
    }
  };

  const hasAnyConfig = Object.values(configStatus).some(Boolean);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Integration Configuration</h1>
          <Button variant="outline" size="sm" onClick={() => navigate('/internal/integrations')}>
            Back to Health
          </Button>
        </div>
        <div className="space-y-4">
          <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Integration Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Configure SendGrid credentials for outgoing email.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/internal/integrations')}>
            Back to Health
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span>{saveError}</span>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4">
          <div className="flex items-center gap-2 text-sm text-success">
            <span>{saveSuccess}</span>
          </div>
        </div>
      )}

      <div className="space-y-6 rounded-lg border p-6">
        <div>
          <h2 className="text-lg font-medium">SendGrid Credentials</h2>
          <p className="text-sm text-muted-foreground">
            API keys are encrypted at rest and never displayed after saving.
          </p>
        </div>

        <div className="space-y-6">
          {CONFIG_KEYS.map((field) => {
            const Icon = field.icon;
            const configured = isConfigured(field.key);
            let value: string;
            let onChange: (v: string) => void;
            if (field.key === 'api_key') {
              value = apiKey;
              onChange = setApiKey;
            } else if (field.key === 'from_email') {
              value = fromEmail;
              onChange = setFromEmail;
            } else {
              value = fromName;
              onChange = setFromName;
            }

            return (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={field.key} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {field.label}
                  </Label>
                  {configured && (
                    <Badge tone="success" className="text-xs">
                      Configured
                    </Badge>
                  )}
                </div>

                <Input
                  id={field.key}
                  type={field.type}
                  placeholder={
                    field.key === 'api_key'
                      ? 'Enter new API key (leave blank to keep current)'
                      : `Enter ${field.label.toLowerCase()}`
                  }
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  autoComplete="off"
                  data-sensitive={field.key === 'api_key' ? 'true' : undefined}
                />

                {field.key === 'api_key' && (
                  <p className="text-xs text-muted-foreground">
                    {configured
                      ? 'API key is configured. Enter a new key only to replace it.'
                      : 'Enter your SendGrid API key. It will be encrypted and stored securely.'}
                  </p>
                )}
                {field.key === 'from_email' && (
                  <p className="text-xs text-muted-foreground">
                    The verified sender email address for SendGrid.
                  </p>
                )}
                {field.key === 'from_name' && (
                  <p className="text-xs text-muted-foreground">
                    Optional. The name shown as the sender.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isSaving || isDeleting}>
          {isSaving ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Configuration
            </>
          )}
        </Button>

        <Button
          variant="destructive"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isSaving || isDeleting || !hasAnyConfig}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete All
        </Button>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete Configuration?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently remove all SendGrid credentials. You will need to reconfigure to send emails again.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Configuration'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
