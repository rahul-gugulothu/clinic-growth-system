import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFounderChat } from './useFounderChat';
import { executeAITool, approveAIExecution, rejectAIExecution, ApiError } from '@/api/client';
import type { AiToolExecutionResult } from '@/features/internal/ai/types/api';

vi.mock('@/api/client', () => ({
  executeAITool: vi.fn(),
  approveAIExecution: vi.fn(),
  rejectAIExecution: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const mockStoreData = {
  prospects: {
    'prospect-1': {
      prospect_id: 'prospect-1',
      clinic_name: 'Kaya Skin Clinic',
      doctor_name: 'Dr. Anaya Kaya',
      specialty: 'Aesthetic Dermatology',
      area: 'Bandra West',
      priority: 'High',
    },
  },
  audits: {},
  outreach: {},
  proposals: {},
  clinics: {},
};

const mockExecutionCompleted: AiToolExecutionResult = {
  id: 'exec-completed-1',
  organization_id: 'org-1',
  tool_id: 'priority-clinics',
  status: 'completed',
  data: { clinics: [{ prospectId: 'prospect-1', clinicName: 'Kaya Skin Clinic', priority: 'High', currentStage: 'Not contacted', reason: 'High priority', nextAction: 'Initiate outreach' }] },
  requires_human_review: false,
  duration_ms: 50,
  created_at: '2024-01-01T10:00:00Z',
  completed_at: '2024-01-01T10:00:00.050Z',
  approved_by: null,
  approved_at: null,
};

const mockExecutionPending: AiToolExecutionResult = {
  id: 'exec-pending-1',
  organization_id: 'org-1',
  tool_id: 'draft-email',
  status: 'requires_approval',
  data: { channel: 'Email', recipient: 'Dr. Anaya Kaya - Kaya Skin Clinic', draftText: 'Subject: Hello\n\nTest body', reasoning: 'Generated draft' },
  requires_human_review: true,
  duration_ms: 80,
  created_at: '2024-01-01T10:00:00Z',
  completed_at: '2024-01-01T10:00:00.080Z',
  approved_by: null,
  approved_at: null,
};

const mockExecutionApproved: AiToolExecutionResult = {
  ...mockExecutionPending,
  id: 'exec-approved-1',
  status: 'approved',
  approved_by: 'user-1',
  approved_at: '2024-01-01T10:01:00Z',
};

describe('useFounderChat', () => {
  let apiMocks: {
    executeAITool: Mock;
    approveAIExecution: Mock;
    rejectAIExecution: Mock;
  };

  beforeEach(() => {
    apiMocks = {
      executeAITool: vi.mocked(executeAITool),
      approveAIExecution: vi.mocked(approveAIExecution),
      rejectAIExecution: vi.mocked(rejectAIExecution),
    };
    apiMocks.executeAITool.mockClear();
    apiMocks.approveAIExecution.mockClear();
    apiMocks.rejectAIExecution.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts with welcome message', () => {
      const { result } = renderHook(() => useFounderChat(mockStoreData));

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('assistant');
      expect(result.current.inputValue).toBe('');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.context).toEqual({});
    });
  });

  describe('runTool', () => {
    it('calls executeAITool with correct tool ID and context', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('priority-clinics');
      });

      expect(apiMocks.executeAITool).toHaveBeenCalledWith('priority-clinics', {
        prospectId: undefined,
        auditId: undefined,
      });
    });

    it('passes prospectId from argument to API context', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('priority-clinics', 'prospect-1', 'Kaya Skin Clinic');
      });

      expect(apiMocks.executeAITool).toHaveBeenCalledWith('priority-clinics', {
        prospectId: 'prospect-1',
        auditId: undefined,
      });
    });

    it('passes auditId from argument to API context', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('audit-summary', undefined, undefined, 'audit-1');
      });

      expect(apiMocks.executeAITool).toHaveBeenCalledWith('audit-summary', {
        prospectId: undefined,
        auditId: 'audit-1',
      });
    });

    it('maps backend result to AIToolResult with executionId and status', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('priority-clinics');
      });

      const messages = result.current.messages;
      const resultMsg = messages.find((m) => m.toolResult);
      expect(resultMsg).toBeDefined();
      expect(resultMsg!.toolResult!.toolId).toBe('priority-clinics');
      expect(resultMsg!.toolResult!.toolName).toBe('Priority Clinics');
      expect(resultMsg!.toolResult!.resultType).toBe('priority_clinics');
      expect(resultMsg!.toolResult!.executionId).toBe('exec-completed-1');
      expect(resultMsg!.toolResult!.executionStatus).toBe('completed');
      expect(resultMsg!.toolResult!.requiresHumanReview).toBe(false);
    });

    it('maps approved result with correct status', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionApproved);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('draft-email', 'prospect-1');
      });

      const resultMsg = result.current.messages.find((m) => m.toolResult);
      expect(resultMsg!.toolResult!.executionStatus).toBe('approved');
      expect(resultMsg!.toolResult!.requiresHumanReview).toBe(true);
    });

    it('handles API error gracefully', async () => {
      apiMocks.executeAITool.mockRejectedValue(new ApiError('prospectId is required', 400));

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('prospect-summary');
      });

      const messages = result.current.messages;
      const resultMsg = messages.find((m) => m.toolResult);
      expect(resultMsg).toBeDefined();
      expect(resultMsg!.toolResult!.resultType).toBe('error');
      expect(resultMsg!.toolResult!.data).toEqual({ message: 'prospectId is required' });
    });
  });

  describe('sendMessage', () => {
    it('calls executeAITool when tool is matched', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.sendMessage('Which prospects should I prioritize?');
      });

      expect(apiMocks.executeAITool).toHaveBeenCalledWith('priority-clinics', {
        prospectId: undefined,
        auditId: undefined,
      });
    });

    it('adds user message and assistant response to messages', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.sendMessage('Which prospects should I prioritize?');
      });

      const assistantMsgs = result.current.messages.filter((m) => m.role === 'assistant');
      const userMsgs = result.current.messages.filter((m) => m.role === 'user');
      expect(userMsgs).toHaveLength(1);
      expect(userMsgs[0].content).toBe('Which prospects should I prioritize?');
      const finalMsg = assistantMsgs[assistantMsgs.length - 1];
      expect(finalMsg.isLoading).toBeUndefined();
      expect(finalMsg.toolResult).toBeDefined();
    });

    it('shows fallback when no tool matches', async () => {
      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.sendMessage('Tell me a joke');
      });

      expect(apiMocks.executeAITool).not.toHaveBeenCalled();
      const assistantMsgs = result.current.messages.filter((m) => m.role === 'assistant');
      expect(assistantMsgs[assistantMsgs.length - 1].content).toContain("don't have a tool for that");
    });

    it('resolves prospect from message and passes prospectId to API', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.sendMessage('summarize kaya clinic');
      });

      expect(apiMocks.executeAITool).toHaveBeenCalledWith(
        'prospect-summary',
        { prospectId: 'prospect-1', auditId: undefined },
      );
      expect(result.current.context.lastProspectId).toBe('prospect-1');
      expect(result.current.context.lastProspectName).toBe('Kaya Skin Clinic');
    });
  });

  describe('approveToolExecution', () => {
    it('calls approveAIExecution with execution ID', async () => {
      apiMocks.approveAIExecution.mockResolvedValue({} as never);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.approveToolExecution('exec-pending-1');
      });

      expect(apiMocks.approveAIExecution).toHaveBeenCalledWith('exec-pending-1');
    });

    it('updates message executionStatus to approved after success', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionPending);
      apiMocks.approveAIExecution.mockResolvedValue({} as never);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('draft-email', 'prospect-1');
      });

      expect(result.current.messages.find((m) => m.toolResult)?.toolResult?.executionStatus).toBe('requires_approval');

      await act(async () => {
        await result.current.approveToolExecution('exec-pending-1');
      });

      expect(result.current.messages.find((m) => m.toolResult?.executionId === 'exec-pending-1')?.toolResult?.executionStatus).toBe('approved');
    });

    it('propagates error when approveAIExecution fails', async () => {
      apiMocks.approveAIExecution.mockRejectedValue(new ApiError('Forbidden', 403));

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await expect(
        act(async () => {
          await result.current.approveToolExecution('exec-pending-1');
        })
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('rejectToolExecution', () => {
    it('calls rejectAIExecution with ID and reason', async () => {
      apiMocks.rejectAIExecution.mockResolvedValue({} as never);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.rejectToolExecution('exec-pending-1', 'Not needed');
      });

      expect(apiMocks.rejectAIExecution).toHaveBeenCalledWith('exec-pending-1', 'Not needed');
    });

    it('updates message executionStatus to rejected after success', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionPending);
      apiMocks.rejectAIExecution.mockResolvedValue({} as never);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.runTool('draft-email', 'prospect-1');
      });

      await act(async () => {
        await result.current.rejectToolExecution('exec-pending-1', 'Not relevant');
      });

      expect(result.current.messages.find((m) => m.toolResult?.executionId === 'exec-pending-1')?.toolResult?.executionStatus).toBe('rejected');
    });
  });

  describe('clearChat', () => {
    it('resets messages to initial state', async () => {
      apiMocks.executeAITool.mockResolvedValue(mockExecutionCompleted);

      const { result } = renderHook(() => useFounderChat(mockStoreData));

      await act(async () => {
        await result.current.sendMessage('Which clinics should I prioritize?');
      });

      expect(result.current.messages.length).toBeGreaterThan(1);

      act(() => {
        result.current.clearChat();
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('assistant');
      expect(result.current.context).toEqual({});
    });
  });
});
