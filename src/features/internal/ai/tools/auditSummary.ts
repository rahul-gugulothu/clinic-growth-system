import type { ToolDefinition, ToolContext, AIToolResult } from '../types';

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

export const auditSummaryTool: ToolDefinition = {
  id: 'audit-summary',
  name: 'Audit Summary',
  description: 'Explain growth opportunities from an audit',
  requiresProspect: false,
  execute: (context: ToolContext): AIToolResult => {
    if (!context.auditId) {
      return {
        toolId: 'audit-summary',
        toolName: 'Audit Summary',
        resultType: 'error',
        data: { message: 'No audit specified. Please open an audit first.' },
      };
    }

    const { audits, prospects } = context.store;

    const audit = (audits as Record<string, {
      audit_id: string;
      prospect_id: string | null;
      overall_opportunity: string;
      identified_problems?: string;
      recommendations?: string;
      discovery?: string;
      google_presence?: string;
      website?: string;
      reviews?: string;
      enquiry_process?: string;
      whatsapp?: string;
      booking?: string;
      follow_up?: string;
      content?: string;
      competitors?: string;
    }>)[context.auditId];

    if (!audit) {
      return {
        toolId: 'audit-summary',
        toolName: 'Audit Summary',
        resultType: 'error',
        data: { message: `Audit not found: ${context.auditId}` },
      };
    }

    const prospect = audit.prospect_id
      ? (prospects as Record<string, { clinic_name: string }>)[audit.prospect_id]
      : undefined;

    const identifiedProblems = audit.identified_problems
      ?.split('\n')
      .filter((l) => l.trim()) || [];

    const recommendations = audit.recommendations
      ?.split('\n')
      .filter((l) => l.trim()) || [];

    const areaFields = [
      { key: 'discovery', label: 'Search / Discovery' },
      { key: 'google_presence', label: 'Google Presence' },
      { key: 'website', label: 'Website' },
      { key: 'reviews', label: 'Reviews' },
      { key: 'enquiry_process', label: 'Enquiry Process' },
      { key: 'whatsapp', label: 'WhatsApp' },
      { key: 'booking', label: 'Booking' },
      { key: 'follow_up', label: 'Follow-up' },
      { key: 'content', label: 'Content' },
      { key: 'competitors', label: 'Competitors' },
    ] as const;

    const areaFindings = areaFields
      .map((f) => ({ label: f.label, value: audit[f.key] || '' }))
      .filter((f) => f.value.trim());

    const areasReviewed = areaFindings.length;

    const nextActions: string[] = [];
    if (identifiedProblems.length > 0) {
      nextActions.push('Address identified problems');
    }
    if (recommendations.length > 0) {
      nextActions.push('Implement recommendations');
    }
    if (identifiedProblems.length === 0 && recommendations.length === 0 && areasReviewed === 0) {
      nextActions.push('Complete additional audit areas');
    }

    const insufficientData = identifiedProblems.length === 0 && recommendations.length === 0 && areasReviewed === 0;

    const result: AuditSummaryResult = {
      auditId: audit.audit_id,
      prospectName: prospect?.clinic_name || 'Unknown clinic',
      overallOpportunity: audit.overall_opportunity,
      areasReviewed,
      weaknessesCount: identifiedProblems.length,
      recommendationsCount: recommendations.length,
      identifiedProblems: identifiedProblems.slice(0, 5),
      recommendations: recommendations.slice(0, 5),
      areaFindings: areaFindings.slice(0, 6),
      nextActions,
      insufficientData,
    };

    return {
      toolId: 'audit-summary',
      toolName: 'Audit Summary',
      resultType: 'audit_summary',
      data: result,
    };
  },
};
