import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  Check,
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Textarea } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import {
  listAIExecutions,
  getAIExecution,
  approveAIExecution,
  rejectAIExecution,
  ApiError,
  type ListExecutionsParams,
} from '@/api/client';
import type {
  AiExecutionWithDeliveryStatus,
  AiExecutionWithIntegration,
  IntegrationDeliveryEvent,
  AiExecutionStatus,
  IntegrationEventStatus,
  Pagination,
} from '@/features/internal/ai/types/api';

const STATUS_ICONS: Record<AiExecutionStatus, React.ComponentType<{ className?: string }>> = {
  requested: Clock,
  running: RefreshCw,
  completed: CheckCircle,
  failed: XCircle,
  requires_approval: AlertCircle,
  approved: CheckCircle,
  rejected: XCircle,
};

const STATUS_BADE_TONES: Record<AiExecutionStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  requested: 'info',
  running: 'info',
  completed: 'success',
  failed: 'destructive',
  requires_approval: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

const STATUS_LABEL: Record<AiExecutionStatus, string> = {
  requested: 'Requested',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  requires_approval: 'Requires Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

const INTEGRATION_STATUS_TONE: Record<IntegrationEventStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  pending: 'info',
  sent: 'success',
  retry: 'warning',
  failed: 'destructive',
};

const INTEGRATION_STATUS_LABEL: Record<IntegrationEventStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  retry: 'Retrying',
  failed: 'Failed',
};

interface RejectDialogData {
  executionId: string;
  open: boolean;
}

const safeStatus = (status: string): AiExecutionStatus => {
  const valid: AiExecutionStatus[] = [
    'requested', 'running', 'completed', 'failed',
    'requires_approval', 'approved', 'rejected',
  ];
  return valid.includes(status as AiExecutionStatus) ? (status as AiExecutionStatus) : 'requested';
};

const safeIntegrationStatus = (status: string): IntegrationEventStatus => {
  const valid: IntegrationEventStatus[] = ['pending', 'sent', 'retry', 'failed'];
  return valid.includes(status as IntegrationEventStatus)
    ? (status as IntegrationEventStatus)
    : 'pending';
};

export default function AIExecutionsPage() {
  const navigate = useNavigate();
  const [executions, setExecutions] = useState<AiExecutionWithDeliveryStatus[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] =
    useState<AiExecutionWithIntegration | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<RejectDialogData>({
    executionId: '',
    open: false,
  });
  const [rejectReason, setRejectReason] = useState('');
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const loadList = useCallback(
    async (params?: ListExecutionsParams) => {
      setIsLoadingList(true);
      setError(null);
      try {
        const result = await listAIExecutions(params);
        setExecutions(result.executions);
        setPagination(result.pagination);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof Error ? e.message : 'Failed to load executions');
      } finally {
        setIsLoadingList(false);
      }
    },
    [],
  );

  const loadDetail = useCallback(async (id: string) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      const exec = await getAIExecution(id);
      setSelectedExecution(exec);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : 'Failed to load execution');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (executions.length > 0 && !selectedId) {
      setSelectedId(executions[0].id);
    }
  }, [executions, selectedId]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
  }, [selectedId, loadDetail]);

  const handleRefresh = () => {
    loadList();
    if (selectedId) {
      loadDetail(selectedId);
    }
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    setIsActionLoading(selectedId);
    try {
      await approveAIExecution(selectedId);
      if (selectedId) {
        loadDetail(selectedId);
        loadList();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : 'Failed to approve execution');
    } finally {
      setIsActionLoading(null);
    }
  };

  const openRejectDialog = (id: string) => {
    setRejectDialog({ executionId: id, open: true });
    setRejectReason('');
  };

  const handleReject = async () => {
    const id = rejectDialog.executionId;
    setIsActionLoading(id);
    try {
      await rejectAIExecution(id, rejectReason);
      setRejectDialog({ executionId: '', open: false });
      if (selectedId === id) {
        loadDetail(selectedId);
        loadList();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : 'Failed to reject execution');
    } finally {
      setIsActionLoading(null);
    }
  };

  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const canApprove = (status: AiExecutionStatus): boolean =>
    status === 'requires_approval';

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center justify-between border-b bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Execution History
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/internal/ai')}
          >
            Back to Founder AI
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoadingList || isLoadingDetail}
        >
          <RefreshCw
            className={cn(
              'mr-2 h-4 w-4',
              (isLoadingList || isLoadingDetail) && 'animate-spin',
            )}
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Execution List */}
        <div className="w-1/2 min-w-[480px] border-r bg-muted/20 overflow-y-auto">
          <div className="border-b bg-background px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Executions ({pagination.total})
            </h2>
            <div className="flex gap-1">
              {pagination.page > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    loadList({
                      offset: (pagination.page - 2) * pagination.limit,
                      limit: pagination.limit,
                    })
                  }
                >
                  Previous
                </Button>
              )}
              {pagination.hasMore && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    loadList({
                      offset: pagination.page * pagination.limit,
                      limit: pagination.limit,
                    })
                  }
                >
                  Next
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 text-sm text-destructive">{error}</div>
          )}

          {isLoadingList && executions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading executions...
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Tool</TH>
                  <TH>Status</TH>
                  <TH>Integration</TH>
                  <TH>Created</TH>
                  <TH>Approval</TH>
                </TR>
              </THead>
              <TBody>
                {executions.map((exec) => {
                  const status = safeStatus(exec.status);
                  const Icon = STATUS_ICONS[status];
                  const isSelected = selectedId === exec.id;
                  return (
                    <TR
                      key={exec.id}
                      className={cn(
                        'cursor-pointer',
                        isSelected && 'bg-primary/5',
                      )}
                      onClick={() => setSelectedId(exec.id)}
                    >
                      <TD>
                        <div className="font-mono text-xs">
                          {exec.tool_id}
                        </div>
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            STATUS_BADE_TONES[status] ?? 'default'
                          }
                        >
                          <Icon className="mr-1 h-3 w-3" />
                          {STATUS_LABEL[status]}
                        </Badge>
                      </TD>
                      <TD>
                        {exec.has_integration_events &&
                        exec.latest_integration_status ? (
                          <Badge
                            tone={
                              INTEGRATION_STATUS_TONE[
                                safeIntegrationStatus(
                                  exec.latest_integration_status,
                                )
                              ]
                            }
                          >
                            {
                              INTEGRATION_STATUS_LABEL[
                                safeIntegrationStatus(
                                  exec.latest_integration_status,
                                )
                              ]
                            }
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No events
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(exec.created_at)}
                        </span>
                      </TD>
                      <TD>
                        {exec.requires_human_review &&
                        status === 'requires_approval' ? (
                          <Badge tone="warning">Review needed</Badge>
                        ) : exec.approved_at ? (
                          <Badge tone="success">Approved</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>

        {/* RIGHT — Detail Panel */}
        <div className="flex-1 overflow-y-auto bg-background">
          {isLoadingDetail ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading execution...
            </div>
          ) : !selectedExecution ? (
            <div className="p-8 text-center text-muted-foreground">
              Select an execution to view details
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {selectedExecution.tool_id}
                </h2>
                <Badge
                  tone={
                    STATUS_BADE_TONES[safeStatus(selectedExecution.status)] ??
                    'default'
                  }
                >
                  {STATUS_LABEL[safeStatus(selectedExecution.status)]}
                </Badge>
              </div>

              {/* Approval actions */}
              {canApprove(safeStatus(selectedExecution.status)) && (
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleApprove}
                    disabled={
                      isActionLoading === selectedExecution.id
                    }
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openRejectDialog(selectedExecution.id)
                    }
                    disabled={
                      isActionLoading === selectedExecution.id
                    }
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}

              {selectedExecution.approved_at && (
                <div className="text-sm text-muted-foreground">
                  Approved by user{' '}
                  <span className="font-mono">
                    {selectedExecution.approved_by}
                  </span>{' '}
                  at {formatDate(selectedExecution.approved_at)}
                </div>
              )}

              {/* Execution metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">
                    Organization ID
                  </span>
                  <div className="font-mono text-xs break-all">
                    {selectedExecution.organization_id}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Created at
                  </span>
                  <div>{formatDate(selectedExecution.created_at)}</div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Started at
                  </span>
                  <div>
                    {formatDate(selectedExecution.started_at)}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Completed at
                  </span>
                  <div>
                    {formatDate(selectedExecution.completed_at)}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Duration
                  </span>
                  <div>
                    {selectedExecution.duration_ms != null
                      ? `${selectedExecution.duration_ms} ms`
                      : '—'}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Requires Human Review
                  </span>
                  <div>
                    {selectedExecution.requires_human_review
                      ? 'Yes'
                      : 'No'}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Success
                  </span>
                  <div>
                    {selectedExecution.success ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>

              {/* Result output */}
              {selectedExecution.result_output && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Result Output
                  </h3>
                  <pre className="mt-2 max-h-60 w-full overflow-auto rounded-md bg-muted/30 p-3 text-xs">
                    {JSON.stringify(
                      selectedExecution.result_output,
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}

              {/* Error */}
              {selectedExecution.error && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground text-destructive">
                    Error
                  </h3>
                  <p className="mt-1 text-sm text-destructive">
                    {selectedExecution.error}
                  </p>
                </div>
              )}

              {/* Integration Events Timeline */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Integration Events
                </h3>
                {selectedExecution.integration_events.length ===
                  0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No integration events for this execution.
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {selectedExecution.integration_events.map(
                      (event: IntegrationDeliveryEvent, idx: number) => (
                        <div
                          key={idx}
                          className="border-l-2 border-muted pl-4 pb-2"
                        >
                          <div className="flex items-start gap-2">
                            <Badge
                              tone={
                                INTEGRATION_STATUS_TONE[
                                  safeIntegrationStatus(event.status)
                                ]
                              }
                            >
                              {
                                INTEGRATION_STATUS_LABEL[
                                  safeIntegrationStatus(event.status)
                                ]
                              }
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              #{idx + 1}
                            </span>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Provider
                              </span>
                              <div className="font-mono text-xs">
                                {event.provider}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Event Type
                              </span>
                              <div className="text-xs">
                                {event.event_type}
                              </div>
                            </div>
                            {event.error_message && (
                              <div className="col-span-2">
                                <span className="font-medium text-muted-foreground">
                                  Error
                                </span>
                                <div className="text-sm text-destructive">
                                  {event.error_message}
                                </div>
                              </div>
                            )}
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Retry Count
                              </span>
                              <div>{event.retry_count}</div>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Sent At
                              </span>
                              <div>
                                {formatDate(event.sent_at)}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Next Retry
                              </span>
                              <div>
                                {formatDate(event.next_retry_at)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 text-xs text-muted-foreground">
                Execution ID:{' '}
                <span className="font-mono break-all">
                  {selectedExecution.id}
                </span>
                {selectedExecution.user_id && (
                  <>
                    {' '}
                    · User:
                    <span className="font-mono">
                      {' '}
                      {selectedExecution.user_id}
                    </span>
                  </>
                )}
                {selectedExecution.clinic_id && (
                  <>
                    {' '}
                    · Clinic:
                    <span className="font-mono">
                      {' '}
                      {selectedExecution.clinic_id}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) =>
          setRejectDialog({ executionId: rejectDialog.executionId, open })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Execution</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label htmlFor="reject-reason">Rejection Reason</Label>
            <Textarea
              id="reject-reason"
              placeholder="Explain why this execution is being rejected..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRejectDialog({ executionId: '', open: false })
              }
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={
                isActionLoading === rejectDialog.executionId ||
                !rejectReason.trim()
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
