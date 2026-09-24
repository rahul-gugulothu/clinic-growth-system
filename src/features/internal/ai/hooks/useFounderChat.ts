import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, ConversationContext, ActivityItem, AIToolResult, MessageRole } from '../types';
import type { AiToolExecutionResult, AiExecutionStatus, FounderConversationMessage } from '../types/api';
import { WELCOME_MESSAGE } from '../utils/promptTemplates';
import { getToolForPrompt, resolveProspectFromMessage, getToolResultType, TOOL_BY_ID } from '../tools/toolRegistry';
import { executeAITool, executeAIToolStream, approveAIExecution, rejectAIExecution, ApiError } from '@/api/client';

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant' as const,
    content: WELCOME_MESSAGE,
    timestamp: new Date(),
  },
];

const mapBackendMessage = (msg: FounderConversationMessage): ChatMessage => ({
  id: msg.id,
  role: msg.role as MessageRole,
  content: msg.content,
  timestamp: new Date(msg.created_at),
});

interface UseFounderChatOptions {
  conversationId?: string;
  initialMessages?: FounderConversationMessage[];
}

export function useFounderChat(storeData: {
  prospects: Record<string, unknown>;
  audits: Record<string, unknown>;
  outreach: Record<string, unknown>;
  proposals: Record<string, unknown>;
  clinics: Record<string, unknown>;
}, options: UseFounderChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [context, setContext] = useState<ConversationContext>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    if (options.initialMessages) {
      const mapped = options.initialMessages
        .filter((m) => m.role !== 'system')
        .map(mapBackendMessage);
      setMessages(mapped.length > 0 ? mapped : initialMessages);
    }
  }, [options.conversationId, options.initialMessages]);


  const addActivity = useCallback((title: string, description: string, type: ActivityItem['type'] = 'summary') => {
    const newActivity: ActivityItem = {
      id: generateId(),
      title,
      description,
      type,
      timestamp: new Date(),
    };
    setActivities((prev) => [newActivity, ...prev].slice(0, 10));
  }, []);

  const mapBackendResult = useCallback((execution: AiToolExecutionResult): AIToolResult => {
    const resultType = getToolResultType(execution.tool_id);
    const toolDef = TOOL_BY_ID[execution.tool_id];
    return {
      toolId: execution.tool_id,
      toolName: toolDef?.name ?? execution.tool_id,
      resultType,
      data: execution.data as AIToolResult['data'],
      requiresHumanReview: execution.requires_human_review,
      executionId: execution.id,
      executionStatus: execution.status,
    };
  }, []);

  const updateMessageExecutionStatus = useCallback(
    (executionId: string, status: AiExecutionStatus) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.toolResult?.executionId === executionId
            ? { ...msg, toolResult: { ...msg.toolResult!, executionStatus: status } }
            : msg
        )
      );
    },
    []
  );

  const runTool = useCallback(
    async (toolId: string, prospectId?: string, prospectName?: string, auditId?: string) => {
      setContext((prev) => {
        if (prospectId || prospectName) {
          return {
            ...prev,
            lastProspectId: prospectId || prev.lastProspectId,
            lastProspectName: prospectName || prev.lastProspectName,
            lastAuditId: undefined,
          };
        }

        if (auditId) {
          return {
            ...prev,
            lastAuditId: auditId,
            lastProspectId: undefined,
            lastProspectName: undefined,
          };
        }

        return prev;
      });

      const loadingMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Running tool...',
        timestamp: new Date(),
        isLoading: true,
      };
      setMessages((prev) => [...prev, loadingMessage]);
      setIsLoading(true);

      const toolContext = {
        prospectId: prospectId || context.lastProspectId,
        auditId: auditId || context.lastAuditId,
      };

      try {
        const execution = await executeAITool(toolId, toolContext, options.conversationId);
        const result = mapBackendResult(execution);

        const toolMessage: ChatMessage = {
          id: generateId(),
          role: 'tool',
          content: `Tool executed: ${toolId}`,
          timestamp: new Date(),
          toolResult: result,
        };
        setMessages((prev) => [...prev.filter((m) => !m.isLoading), toolMessage]);

        const responseMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: formatToolResult(result),
          timestamp: new Date(),
          toolResult: result,
        };

        setMessages((prev) => [...prev, responseMessage]);

        if (result.resultType !== 'error') {
          addActivity(`Ran ${result.toolName}`, result.toolName, result.requiresHumanReview ? 'draft' : 'summary');
        }
      } catch (err) {
        const errorMsg =
          err instanceof ApiError ? err.message :
          err instanceof Error ? err.message : String(err);
        const errorResult: AIToolResult = {
          toolId: toolId,
          toolName: TOOL_BY_ID[toolId]?.name ?? toolId,
          resultType: 'error',
          data: { message: errorMsg },
        };
        const toolMessage: ChatMessage = {
          id: generateId(),
          role: 'tool',
          content: `Tool executed: ${toolId}`,
          timestamp: new Date(),
        };
        const errorResponse: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${errorMsg}`,
          timestamp: new Date(),
          toolResult: errorResult,
        };
        setMessages((prev) => [...prev.filter((m) => !m.isLoading), toolMessage, errorResponse]);
        addActivity(
          `Error running ${TOOL_BY_ID[toolId]?.name ?? toolId}`,
          errorMsg,
          'summary',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [context, addActivity, mapBackendResult, options.conversationId],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const prospectMatch = resolveProspectFromMessage(
        content,
        storeData.prospects as Record<string, { clinic_name: string; doctor_name: string; prospect_id: string }>,
      );

      if (prospectMatch) {
        setContext((prev) => ({
          ...prev,
          lastProspectId: prospectMatch.prospectId,
          lastProspectName: prospectMatch.prospectName,
          lastAuditId: undefined,
        }));
      }

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');

      const toolId = getToolForPrompt(content, {
        prospectId: prospectMatch?.prospectId || context.lastProspectId,
        prospectName: prospectMatch?.prospectName || context.lastProspectName,
      });

      if (toolId) {
        const loadingMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: 'Thinking...',
          timestamp: new Date(),
          isLoading: true,
        };
        setMessages((prev) => [...prev, loadingMessage]);
        setIsLoading(true);

        const toolContext = {
          prospectId: prospectMatch?.prospectId || context.lastProspectId,
          auditId: context.lastAuditId,
        };

        try {
          const execution = await executeAITool(toolId, toolContext, options.conversationId, content.trim());
          const result = mapBackendResult(execution);

          const toolMessage: ChatMessage = {
            id: generateId(),
            role: 'tool',
            content: `Tool executed: ${toolId}`,
            timestamp: new Date(),
            toolResult: result,
          };
          setMessages((prev) => [...prev.filter((m) => !m.isLoading), toolMessage]);

          const responseMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: formatToolResult(result),
            timestamp: new Date(),
            toolResult: result,
          };

          setMessages((prev) => [...prev, responseMessage]);

          if (result.resultType !== 'error' && prospectMatch) {
            setContext((prev) => ({
              ...prev,
              lastProspectId: prospectMatch.prospectId,
              lastProspectName: prospectMatch.prospectName,
            }));
          }

          if (result.resultType !== 'error') {
            addActivity(`Ran ${result.toolName}`, result.toolName, result.requiresHumanReview ? 'draft' : 'summary');
          }
        } catch (err) {
          const errorMsg =
            err instanceof ApiError ? err.message :
            err instanceof Error ? err.message : String(err);
          const errorResult: AIToolResult = {
            toolId: toolId,
            toolName: TOOL_BY_ID[toolId]?.name ?? toolId,
            resultType: 'error',
            data: { message: errorMsg },
          };
          const toolMessage: ChatMessage = {
            id: generateId(),
            role: 'tool',
            content: `Tool executed: ${toolId}`,
            timestamp: new Date(),
          };
          const errorResponse: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `Error: ${errorMsg}`,
            timestamp: new Date(),
            toolResult: errorResult,
          };
          setMessages((prev) => [...prev.filter((m) => !m.isLoading), toolMessage, errorResponse]);
          addActivity(
            `Error running ${TOOL_BY_ID[toolId]?.name ?? toolId}`,
            errorMsg,
            'summary',
          );
        } finally {
          setIsLoading(false);
        }
      } else {
        const fallbackMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: "I don't have a tool for that yet. Try asking about your pipeline, prospects, outreach, proposals, or today's priorities.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, fallbackMessage]);
      }
    },
    [storeData, context, addActivity, mapBackendResult, options.conversationId],
  );

  const approveToolExecution = useCallback(
    async (executionId: string) => {
      try {
        await approveAIExecution(executionId);
        updateMessageExecutionStatus(executionId, 'approved');
        addActivity('Approved execution', `Execution ${executionId} approved`, 'summary');
      } catch (err) {
        const errorMsg =
          err instanceof ApiError ? err.message :
          err instanceof Error ? err.message : String(err);
        addActivity('Approval failed', errorMsg, 'summary');
        throw err;
      }
    },
    [updateMessageExecutionStatus, addActivity],
  );

  const rejectToolExecution = useCallback(
    async (executionId: string, reason: string) => {
      try {
        await rejectAIExecution(executionId, reason);
        updateMessageExecutionStatus(executionId, 'rejected');
        addActivity('Rejected execution', `Execution ${executionId} rejected: ${reason}`, 'summary');
      } catch (err) {
        const errorMsg =
          err instanceof ApiError ? err.message :
          err instanceof Error ? err.message : String(err);
        addActivity('Rejection failed', errorMsg, 'summary');
        throw err;
      }
    },
    [updateMessageExecutionStatus, addActivity],
  );

  const sendMessageStream = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const prospectMatch = resolveProspectFromMessage(
        content,
        storeData.prospects as Record<string, { clinic_name: string; doctor_name: string; prospect_id: string }>,
      );

      if (prospectMatch) {
        setContext((prev) => ({
          ...prev,
          lastProspectId: prospectMatch.prospectId,
          lastProspectName: prospectMatch.prospectName,
          lastAuditId: undefined,
        }));
      }

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');

      const toolId = getToolForPrompt(content, {
        prospectId: prospectMatch?.prospectId || context.lastProspectId,
        prospectName: prospectMatch?.prospectName || context.lastProspectName,
      });

      if (!toolId) {
        const fallbackMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: "I don't have a tool for that yet. Try asking about your pipeline, prospects, outreach, proposals, or today's priorities.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, fallbackMessage]);
        return;
      }

      const toolContext = {
        prospectId: prospectMatch?.prospectId || context.lastProspectId,
        auditId: context.lastAuditId,
      };

      setContext((prev) => {
        if (prospectMatch) {
          return {
            ...prev,
            lastProspectId: prospectMatch.prospectId,
            lastProspectName: prospectMatch.prospectName,
          };
        }
        return prev;
      });

      setIsStreaming(true);
      setStreamingMessage('');

      const abortCtrl = new AbortController();
      setAbortController(abortCtrl);

      const toolMsgId = generateId();
      const assistantMsgId = generateId();

      setMessages((prev) => [
        ...prev,
        {
          id: toolMsgId,
          role: 'tool',
          content: `Executing ${toolId}...`,
          timestamp: new Date(),
        },
      ]);

      const streamingExecution = {
        id: 'streaming',
        organization_id: '',
        tool_id: toolId,
        status: 'completed' as AiExecutionStatus,
        data: null,
        requires_human_review: false,
        duration_ms: null,
        created_at: new Date().toISOString(),
        completed_at: null,
        approved_by: null,
        approved_at: null,
      } as AiToolExecutionResult;

      const executionResult = mapBackendResult(streamingExecution);

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isLoading: true,
          toolResult: executionResult,
        },
      ]);

      try {
        for await (const event of executeAIToolStream(
          toolId,
          toolContext,
          options.conversationId,
          content.trim(),
          abortCtrl.signal,
        )) {
          if (event.type === 'message_start') {
            setStreamingMessage('');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: '', isLoading: false, isStreaming: true, streamingStatus: 'streaming' }
                  : m,
              ),
            );
          } else if (event.type === 'message_chunk' && event.content) {
            setStreamingMessage((prev) => prev + event.content);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: event.accumulated ?? (m.content + event.content), isStreaming: true, streamingStatus: 'streaming' }
                  : m,
              ),
            );
          } else if (event.type === 'tool_event') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === toolMsgId
                  ? {
                      ...m,
                      content:
                        event.status === 'completed'
                          ? `Completed: ${event.tool_id}`
                          : event.status === 'failed'
                            ? `Failed: ${event.tool_id}`
                            : `Executing ${event.tool_id}...`,
                    }
                  : m,
              ),
            );
          } else if (event.type === 'message_complete') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: event.content ?? '', isLoading: false, isStreaming: false, streamingStatus: 'complete' }
                  : m,
              ),
            );
            setIsStreaming(false);
            setAbortController(null);
            if (executionResult.resultType !== 'error') {
              addActivity(`Ran ${executionResult.toolName}`, executionResult.toolName, executionResult.requiresHumanReview ? 'draft' : 'summary');
            }
          } else if (event.type === 'error') {
            const errorMsg = event.message ?? 'Unknown error';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content || `Error: ${errorMsg}`,
                      isLoading: false,
                      isStreaming: false,
                      streamingStatus: 'error',
                      toolResult: { ...executionResult, resultType: 'error', data: { message: errorMsg } },
                    }
                  : m,
              ),
            );
            setIsStreaming(false);
            setAbortController(null);
            addActivity(`Error running ${TOOL_BY_ID[toolId]?.name ?? toolId}`, errorMsg, 'summary');
          }
        }
      } catch (err) {
        const errorMsg =
          err instanceof ApiError ? err.message :
          err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `Error: ${errorMsg}`,
                  isLoading: false,
                  isStreaming: false,
                  streamingStatus: 'error',
                  toolResult: { ...executionResult, resultType: 'error', data: { message: errorMsg } },
                }
              : m,
          ),
        );
        setIsStreaming(false);
        setAbortController(null);
        addActivity(`Error running ${TOOL_BY_ID[toolId]?.name ?? toolId}`, errorMsg, 'summary');
      }
    },
    [storeData, context, addActivity, mapBackendResult, options.conversationId],
  );

  const cancelStreaming = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? { ...m, isStreaming: false, streamingStatus: 'cancelled' }
          : m,
      ),
    );
    setIsStreaming(false);
    setAbortController(null);
  }, [abortController]);

  const retryStream = useCallback((messageId: string) => {
    // Find the message to retry and the last user message before it
    setMessages((prev) => {
      const messages = [...prev];
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.role !== 'assistant') return prev;
      
      const assistantIndex = messages.findIndex((m) => m.id === messageId);
      if (assistantIndex === -1) return prev;
      
      // Find the last user message before this assistant message
      let userMessage: ChatMessage | null = null;
      for (let i = assistantIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userMessage = messages[i];
          break;
        }
      }
      
      if (userMessage) {
        // Remove the failed assistant message and any tool messages after the user message
        const newMessages = messages.filter((m, idx) => {
          if (idx > assistantIndex) return false;
          if (m.id === messageId) return false;
          return true;
        });
        
        // Trigger a new stream with the user's message content
        // We use setTimeout to avoid state update issues
        setTimeout(() => {
          sendMessageStream(userMessage!.content);
        }, 0);
        
        return newMessages;
      }
      
      return messages;
    });
  }, [sendMessageStream]);

  const clearChat = useCallback(() => {
    setMessages(initialMessages);
    setInputValue('');
    setIsLoading(false);
    setIsStreaming(false);
    setStreamingMessage('');
    setAbortController(null);
    setContext({});
  }, []);

  return {
    messages,
    inputValue,
    isLoading,
    isStreaming,
    streamingMessage,
    sendMessageStream,
    cancelStreaming,
    retryStream,
    context,
    activities,
    sendMessage,
    runTool,
    setInputValue,
    clearChat,
    approveToolExecution,
    rejectToolExecution,
  };
}

function formatToolResult(result: AIToolResult): string {
  switch (result.resultType) {
    case 'priority_clinics': {
      const data = result.data as { clinics: { clinicName: string; priority: string; currentStage: string; reason: string; nextAction: string }[] };
      if (data.clinics.length === 0) return 'No priority clinics found.';
      return data.clinics
        .map((c, i) => `${i + 1}. ${c.clinicName} (${c.priority})\n   Stage: ${c.currentStage}\n   ${c.reason}\n   Next: ${c.nextAction}`)
        .join('\n\n');
    }
    case 'prospect_summary': {
      const data = result.data as { clinic: string; doctor: string; specialty: string; area: string; priority: string; researchSummary: string; auditSummary?: string; outreachStatus?: string; proposalStatus?: string; recommendedNextAction: string };
      return [
        `**${data.clinic}**`,
        `Doctor: ${data.doctor}`,
        `${data.specialty} · ${data.area}`,
        `Priority: ${data.priority}`,
        '',
        `**Research:** ${data.researchSummary}`,
        data.auditSummary ? `\n**Audit:** ${data.auditSummary}` : '',
        data.outreachStatus ? `\n**Outreach:** ${data.outreachStatus}` : '',
        data.proposalStatus ? `\n**Proposal:** ${data.proposalStatus}` : '',
        '',
        `**Recommended:** ${data.recommendedNextAction}`,
      ].filter(Boolean).join('\n');
    }
    case 'draft_whatsapp':
    case 'draft_email': {
      const data = result.data as { channel: string; recipient: string; draftText: string; reasoning: string };
      const statusNote =
        result.executionStatus === 'approved' ? '✅ Approved — integration event created' :
        result.executionStatus === 'rejected' ? '❌ Rejected' :
        result.executionStatus === 'requires_approval' ? '⏳ Awaiting your approval' :
        '';
      return [
        `**Draft ${data.channel} for ${data.recipient}**`,
        '',
        data.draftText,
        '',
        result.requiresHumanReview ? '⚠️ Human review required before sending' : '',
        statusNote,
      ].filter(Boolean).join('\n');
    }
    case 'call_preparation': {
      const data = result.data as { objective: string; clinicContext: string; auditFindings: string[]; discussionPoints: string[]; questionsToAsk: string[]; suggestedNextStep: string };
      return [
        `**Call Objective:** ${data.objective}`,
        '',
        `**Clinic Context:** ${data.clinicContext}`,
        '',
        `**Key Audit Findings:**`,
        ...data.auditFindings.map((f) => `• ${f}`),
        '',
        `**Discussion Points:**`,
        ...data.discussionPoints.map((p) => `• ${p}`),
        '',
        `**Questions to Ask:**`,
        ...data.questionsToAsk.map((q) => `• ${q}`),
        '',
        `**Suggested Next Step:** ${data.suggestedNextStep}`,
      ].flat().join('\n');
    }
    case 'proposal_draft': {
      const data = result.data as { clinic: string; scope: string; expectedOutcomes: string; timeline: string; price?: number; assumptions: string[]; nextStep: string };
      const statusNote =
        result.executionStatus === 'approved' ? '✅ Approved' :
        result.executionStatus === 'rejected' ? '❌ Rejected' :
        result.executionStatus === 'requires_approval' ? '⏳ Awaiting your approval' :
        '';
      return [
        `**Proposal Draft for ${data.clinic}**`,
        '',
        `**Scope:** ${data.scope}`,
        '',
        `**Expected Outcomes:**`,
        data.expectedOutcomes,
        '',
        `**Timeline:** ${data.timeline}`,
        data.price ? `\n**Price:** ₹${data.price.toLocaleString('en-IN')}` : '\n**Price:** To be finalized after scope confirmation',
        '',
        `**Assumptions:**`,
        ...data.assumptions.map((a) => `• ${a}`),
        '',
        `**Next Step:** ${data.nextStep}`,
        '',
        result.requiresHumanReview ? '⚠️ Human review required before sending' : '',
        statusNote,
      ].flat().filter(Boolean).join('\n');
    }
    case 'pipeline_diagnosis': {
      const data = result.data as { stages: { name: string; count: number; pct: number }[]; bottleneck: { from: string; to: string; dropoff: number } | null; recommendation: string };
      return [
        `**Pipeline Diagnosis**`,
        '',
        `**Funnel:**`,
        ...data.stages.map((s) => `• ${s.name}: ${s.count} (${s.pct}%)`),
        data.bottleneck ? `\n**Bottleneck:** ${data.bottleneck.from} → ${data.bottleneck.to} (${data.bottleneck.dropoff} drop)` : '',
        '',
        `**Recommendation:** ${data.recommendation}`,
      ].flat().join('\n');
    }
    case 'work_planner': {
      const data = result.data as { doNow: { task: string; reason: string }[]; doToday: { task: string; reason: string }[]; optional: { task: string; reason: string }[] };
      const formatTasks = (tasks: { task: string; reason: string }[], header: string) => {
        if (tasks.length === 0) return [];
        return [header, ...tasks.map((t) => `• ${t.task} — ${t.reason}`), ''];
      };
      return [
        `**Today's Work Plan**`,
        '',
        ...formatTasks(data.doNow, '**Do Now:**'),
        ...formatTasks(data.doToday, '**Do Today:**'),
        ...formatTasks(data.optional, '**Optional:**'),
      ].flat().filter(Boolean).join('\n');
    }
    case 'weekly_report': {
      const data = result.data as { generatedAt: string; prospectsResearched: number; auditsCompleted: number; outreachRecords: number; responsesReceived: number; callsHad: number; proposalsCreated: number; wins: number; pipelineValue: number; biggestBottleneck?: string; notableWins?: string[]; recommendedFocus: string; insufficientData?: boolean };
      if (data.insufficientData) {
        return '**Weekly Report**\n\nNot enough data for weekly comparison. Add more prospects and conduct more activities to enable weekly tracking.';
      }
      return [
        `**Weekly Founder Report**`,
        `Generated: ${new Date(data.generatedAt).toLocaleDateString()}`,
        '',
        `**Activity This Week:**`,
        `• Prospects researched: ${data.prospectsResearched}`,
        `• Audits completed: ${data.auditsCompleted}`,
        `• Outreach records: ${data.outreachRecords}`,
        `• Responses received: ${data.responsesReceived}`,
        `• Calls: ${data.callsHad}`,
        `• Proposals created: ${data.proposalsCreated}`,
        `• Wins: ${data.wins}`,
        '',
        `**Pipeline Value:** ₹${data.pipelineValue.toLocaleString('en-IN')}`,
        data.biggestBottleneck ? `\n**Bottleneck:** ${data.biggestBottleneck}` : '',
        data.notableWins?.length ? `\n**Notable Wins:** ${data.notableWins.join(', ')}` : '',
        '',
        `**Recommended Focus:** ${data.recommendedFocus}`,
      ].filter(Boolean).join('\n');
    }
    case 'growth_opportunities': {
      const data = result.data as { opportunities: { opportunity: string; evidence: string; suggestedAction: string; confidence: 'high' | 'medium' | 'low' }[] };
      if (data.opportunities.length === 0) {
        return 'No specific growth opportunities identified with current data.';
      }
      return [
        `**Growth Opportunities**`,
        '',
        ...data.opportunities.map((o, i) => [
          `${i + 1}. **${o.opportunity}** [${o.confidence.toUpperCase()}]`,
          `   Evidence: ${o.evidence}`,
          `   Action: ${o.suggestedAction}`,
          '',
        ].join('\n')),
      ].flat().join('\n');
    }
    case 'audit_summary': {
      const data = result.data as { auditId: string; prospectName: string; overallOpportunity: string; areasReviewed: number; weaknessesCount: number; recommendationsCount: number; identifiedProblems: string[]; recommendations: string[]; areaFindings: { label: string; value: string }[]; nextActions: string[]; insufficientData: boolean };
      if (data.insufficientData) {
        return `**Audit Summary**\n\nThis audit does not yet contain enough verified findings to explain growth opportunities. Complete additional audit areas to enable analysis.`;
      }
      return [
        `**Audit Summary: ${data.prospectName}**`,
        `Opportunity level: ${data.overallOpportunity}`,
        `Areas reviewed: ${data.areasReviewed}`,
        '',
        `**Identified Problems (${data.weaknessesCount}):**`,
        ...data.identifiedProblems.map((p) => `• ${p}`),
        '',
        `**Recommendations (${data.recommendationsCount}):**`,
        ...data.recommendations.map((r) => `• ${r}`),
        '',
        `**Area Findings:**`,
        ...data.areaFindings.map((f) => `• ${f.label}: ${f.value}`),
        '',
        `**Next Actions:**`,
        ...data.nextActions.map((a) => `• ${a}`),
      ].flat().join('\n');
    }
    case 'error': {
      const data = result.data as { message: string };
      return `Error: ${data.message}`;
    }
    default:
      return 'Tool result received.';
  }
}
