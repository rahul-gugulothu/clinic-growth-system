export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type StreamingStatus = 'streaming' | 'complete' | 'cancelled' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  isStreaming?: boolean;
  streamingStatus?: StreamingStatus;
  toolResult?: AIToolResult;
}

export interface SuggestionChip {
  id: string;
  label: string;
  prompt: string;
}

export interface QuickTool {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  category: 'daily' | 'outreach' | 'sales' | 'analytics';
}

export interface MorningBriefSection {
  id: string;
  title: string;
  icon: string;
}

export interface ActivityItem {
  id: string;
  type: 'summary' | 'draft' | 'report';
  title: string;
  description: string;
  timestamp: Date;
}

export interface ConversationContext {
  lastProspectId?: string;
  lastProspectName?: string;
  lastAuditId?: string;
}

export type ToolResultType = 'priority_clinics' | 'prospect_summary' | 'draft_whatsapp' | 'draft_email' | 'call_preparation' | 'proposal_draft' | 'pipeline_diagnosis' | 'work_planner' | 'weekly_report' | 'growth_opportunities' | 'audit_summary' | 'error' | 'text';

export interface AIToolResult {
  toolId: string;
  toolName: string;
  resultType: ToolResultType;
  data: PriorityClinicsResult | ProspectSummaryResult | DraftMessageResult | CallPrepResult | ProposalDraftResult | PipelineDiagnosisResult | WorkPlannerResult | WeeklyReportResult | GrowthOpportunitiesResult | AuditSummaryResult | ErrorResult | TextResult;
  requiresHumanReview?: boolean;
  executionId?: string;
  executionStatus?: import('./types/api').AiExecutionStatus;
}

export interface PriorityClinicsResult {
  clinics: {
    prospectId: string;
    clinicName: string;
    priority: string;
    currentStage: string;
    reason: string;
    nextAction: string;
  }[];
}

export interface ProspectSummaryResult {
  prospectId: string;
  clinic: string;
  doctor: string;
  specialty: string;
  area: string;
  priority: string;
  researchSummary: string;
  auditSummary?: string;
  outreachStatus?: string;
  proposalStatus?: string;
  recommendedNextAction: string;
}

export interface DraftMessageResult {
  channel: string;
  recipient: string;
  draftText: string;
  reasoning: string;
}

export interface CallPrepResult {
  objective: string;
  clinicContext: string;
  auditFindings: string[];
  discussionPoints: string[];
  questionsToAsk: string[];
  suggestedNextStep: string;
}

export interface ProposalDraftResult {
  clinic: string;
  scope: string;
  expectedOutcomes: string;
  timeline: string;
  price?: number;
  assumptions: string[];
  nextStep: string;
}

export interface PipelineDiagnosisResult {
  stages: { name: string; count: number; pct: number }[];
  bottleneck: { from: string; to: string; dropoff: number } | null;
  recommendation: string;
}

export interface WorkPlannerResult {
  doNow: { task: string; reason: string }[];
  doToday: { task: string; reason: string }[];
  optional: { task: string; reason: string }[];
}

export interface WeeklyReportResult {
  generatedAt: string;
  prospectsResearched: number;
  auditsCompleted: number;
  outreachRecords: number;
  responsesReceived: number;
  callsHad: number;
  proposalsCreated: number;
  wins: number;
  pipelineValue: number;
  biggestBottleneck?: string;
  notableWins?: string[];
  recommendedFocus: string;
  insufficientData?: boolean;
}

export interface GrowthOpportunitiesResult {
  opportunities: {
    opportunity: string;
    evidence: string;
    suggestedAction: string;
    confidence: 'high' | 'medium' | 'low';
  }[];
}

export interface AuditSummaryResult {
  auditId: string;
  prospectName: string;
  overallOpportunity: string;
  areasReviewed: number;
  weaknessesCount: number;
  recommendationsCount: number;
  identifiedProblems: string[];
  recommendations: string[];
  areaFindings: { label: string; value: string }[];
  nextActions: string[];
  insufficientData: boolean;
}

export interface ErrorResult {
  message: string;
}

export interface TextResult {
  message: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  requiresProspect?: boolean;
  execute: (context: ToolContext) => AIToolResult;
}

export interface ToolContext {
  prospectId?: string;
  prospectName?: string;
  auditId?: string;
  store: {
    prospects: Record<string, unknown>;
    audits: Record<string, unknown>;
    outreach: Record<string, unknown>;
    proposals: Record<string, unknown>;
    clinics: Record<string, unknown>;
  };
}

export interface FounderAINavigationState {
  prospectId?: string;
  auditId?: string;
  tool?: string;
  returnTo?: {
    pathname: string;
    state?: Record<string, string | number | boolean | null>;
  };
}
