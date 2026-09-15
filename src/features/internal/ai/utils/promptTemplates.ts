export const PROMPT_TEMPLATES = {
  daily: {
    morningBrief: 'Generate a morning brief for my clinic acquisition pipeline. What needs attention today?',
    workPlanner: 'Create a work plan for today focused on clinic acquisition activities.',
    priorityClinics: 'Which clinics should I prioritize for outreach today?',
  },
  outreach: {
    draftWhatsApp: 'Draft a WhatsApp message for a clinic outreach.',
    draftEmail: 'Draft a professional email for clinic outreach.',
    callPreparation: 'Prepare talking points for a call with a dermatology clinic prospect.',
  },
  sales: {
    generateProposal: 'Help me generate a proposal structure for a new clinic client.',
    negotiationSummary: 'Summarize key negotiation points for closing a clinic partnership.',
    objectionSuggestions: 'What are common objections in clinic sales and how to handle them?',
  },
  analytics: {
    pipelineDiagnosis: 'Diagnose my current clinic acquisition pipeline. What is the bottleneck?',
    weeklyReport: 'Generate a weekly founder report for my clinic acquisition activities.',
    growthOpportunities: 'Identify growth opportunities in my clinic pipeline.',
  },
  suggestions: [
    'Who needs follow-up today?',
    'Summarize my sales pipeline.',
    'Write outreach for Dr. Kaya.',
    "Generate today's work plan.",
    'Show outreach bottlenecks.',
  ],
} as const;

export const TOOLS = [
  {
    category: 'Daily Operations',
    items: [
      { id: 'work-planner', label: "Today's Work Planner", icon: 'ListTodo', prompt: PROMPT_TEMPLATES.daily.workPlanner },
      { id: 'priority-clinics', label: 'Priority Clinics', icon: 'Star', prompt: PROMPT_TEMPLATES.daily.priorityClinics },
    ],
  },
  {
    category: 'Outreach AI',
    items: [
      { id: 'draft-whatsapp', label: 'Draft WhatsApp', icon: 'MessageSquare', prompt: PROMPT_TEMPLATES.outreach.draftWhatsApp },
      { id: 'draft-email', label: 'Draft Email', icon: 'Mail', prompt: PROMPT_TEMPLATES.outreach.draftEmail },
      { id: 'call-preparation', label: 'Call Preparation', icon: 'Phone', prompt: PROMPT_TEMPLATES.outreach.callPreparation },
    ],
  },
  {
    category: 'Sales AI',
    items: [
      { id: 'generate-proposal', label: 'Generate Proposal', icon: 'FileText', prompt: PROMPT_TEMPLATES.sales.generateProposal },
    ],
  },
  {
    category: 'Analytics AI',
    items: [
      { id: 'pipeline-diagnosis', label: 'Pipeline Diagnosis', icon: 'Activity', prompt: PROMPT_TEMPLATES.analytics.pipelineDiagnosis },
      { id: 'weekly-report', label: 'Weekly Founder Report', icon: 'BarChart2', prompt: PROMPT_TEMPLATES.analytics.weeklyReport },
      { id: 'growth-opportunities', label: 'Growth Opportunities', icon: 'TrendingUp', prompt: PROMPT_TEMPLATES.analytics.growthOpportunities },
    ],
  },
] as const;

export const WELCOME_MESSAGE = "I'm Founder AI. I can help you understand your clinic acquisition pipeline, summarize prospects, draft outreach, and analyze sales performance.";
