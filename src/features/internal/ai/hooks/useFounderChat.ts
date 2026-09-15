import { useState, useCallback } from 'react';
import type { ChatMessage, ConversationContext, ActivityItem, AIToolResult } from '../types';
import { WELCOME_MESSAGE } from '../utils/promptTemplates';
import { executeTool, getToolForPrompt, resolveProspectFromMessage } from '../tools/toolRegistry';

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: WELCOME_MESSAGE,
    timestamp: new Date(),
  },
];

export function useFounderChat(storeData: {
  prospects: Record<string, unknown>;
  audits: Record<string, unknown>;
  outreach: Record<string, unknown>;
  proposals: Record<string, unknown>;
  clinics: Record<string, unknown>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<ConversationContext>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);

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

  const runTool = useCallback((toolId: string, prospectId?: string, prospectName?: string, auditId?: string) => {
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

    setTimeout(() => {
      const toolContext = {
        prospectId: prospectId || context.lastProspectId,
        prospectName: prospectName || context.lastProspectName,
        auditId: auditId || context.lastAuditId,
        store: storeData,
      };

      const result = executeTool(toolId, toolContext);

      const responseMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: formatToolResult(result),
        timestamp: new Date(),
        toolResult: result,
      };

      setMessages((prev) =>
        prev.map((msg) => (msg.isLoading ? responseMessage : msg)),
      );

      if (result.resultType !== 'error') {
        addActivity(`Ran ${result.toolName}`, result.toolName, result.requiresHumanReview ? 'draft' : 'summary');
      }

      setIsLoading(false);
    }, 300);
  }, [context, storeData, addActivity]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    const prospectMatch = resolveProspectFromMessage(content, storeData.prospects as Record<string, { clinic_name: string; doctor_name: string; prospect_id: string }>);

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

      setTimeout(() => {
        const toolContext = {
          prospectId: prospectMatch?.prospectId || context.lastProspectId,
          prospectName: prospectMatch?.prospectName || context.lastProspectName,
          auditId: context.lastAuditId,
          store: storeData,
        };

        const result = executeTool(toolId, toolContext);

        const responseMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: formatToolResult(result),
          timestamp: new Date(),
          toolResult: result,
        };

        setMessages((prev) =>
          prev.map((msg) => (msg.isLoading ? responseMessage : msg)),
        );

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

        setIsLoading(false);
      }, 500);
    } else {
      const fallbackMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: "I don't have a tool for that yet. Try asking about your pipeline, prospects, outreach, proposals, or today's priorities.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    }
  }, [storeData, context, addActivity]);

  const clearChat = useCallback(() => {
    setMessages(initialMessages);
    setInputValue('');
    setIsLoading(false);
    setContext({});
  }, []);

  return {
    messages,
    inputValue,
    isLoading,
    context,
    activities,
    sendMessage,
    runTool,
    setInputValue,
    clearChat,
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
      return [
        `**Draft ${data.channel} for ${data.recipient}**`,
        '',
        data.draftText,
        '',
        result.requiresHumanReview ? '⚠️ Human review required before sending' : '',
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
