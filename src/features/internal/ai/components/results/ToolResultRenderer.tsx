import type { AIToolResult } from '../../types';
import { PipelineDiagnosisCard } from './PipelineDiagnosisCard';
import { PriorityClinicsCard } from './PriorityClinicsCard';
import { WorkPlannerCard } from './WorkPlannerCard';
import { WeeklyReportCard } from './WeeklyReportCard';
import { GrowthOpportunitiesCard } from './GrowthOpportunitiesCard';
import { ProspectSummaryCard } from './ProspectSummaryCard';
import { CallPrepCard } from './CallPrepCard';
import { AuditSummaryCard } from './AuditSummaryCard';
import { DraftCard } from './DraftCard';
import { ProposalDraftCard } from './ProposalDraftCard';
import { ErrorCard } from './ErrorCard';
import { DefaultCard } from './DefaultCard';

interface ToolResultRendererProps {
  result: AIToolResult;
}

export function ToolResultRenderer({ result }: ToolResultRendererProps) {
  const data = result.data as unknown as Record<string, unknown>;

  switch (result.resultType) {
    case 'pipeline_diagnosis':
      return <PipelineDiagnosisCard data={data as unknown as Parameters<typeof PipelineDiagnosisCard>[0]['data']} />;
    case 'priority_clinics':
      return <PriorityClinicsCard data={data as unknown as Parameters<typeof PriorityClinicsCard>[0]['data']} />;
    case 'work_planner':
      return <WorkPlannerCard data={data as unknown as Parameters<typeof WorkPlannerCard>[0]['data']} />;
    case 'weekly_report':
      return <WeeklyReportCard data={data as unknown as Parameters<typeof WeeklyReportCard>[0]['data']} />;
    case 'growth_opportunities':
      return <GrowthOpportunitiesCard data={data as unknown as Parameters<typeof GrowthOpportunitiesCard>[0]['data']} />;
    case 'prospect_summary':
      return <ProspectSummaryCard data={data as unknown as Parameters<typeof ProspectSummaryCard>[0]['data']} />;
    case 'call_preparation':
      return <CallPrepCard data={data as unknown as Parameters<typeof CallPrepCard>[0]['data']} />;
    case 'audit_summary':
      return <AuditSummaryCard data={data as unknown as Parameters<typeof AuditSummaryCard>[0]['data']} />;
    case 'draft_whatsapp':
    case 'draft_email':
      return <DraftCard data={data as unknown as Parameters<typeof DraftCard>[0]['data']} channel={result.resultType === 'draft_whatsapp' ? 'WhatsApp' : 'Email'} />;
    case 'proposal_draft':
      return <ProposalDraftCard data={data as unknown as Parameters<typeof ProposalDraftCard>[0]['data']} />;
    case 'error':
      return <ErrorCard message={(data as { message: string }).message} />;
    default:
      return <DefaultCard content={(data as { message: string }).message} />;
  }
}
