import {
  Sunrise,
  ListTodo,
  Star,
  MessageSquare,
  Mail,
  Phone,
  FileText,
  Handshake,
  HelpCircle,
  Activity,
  BarChart2,
  TrendingUp,
} from 'lucide-react';
import { TOOLS } from '../utils/promptTemplates';
import { TOOL_BY_ID } from '../tools/toolRegistry';
import { cn } from '@/utils/cn';

const ICON_MAP: Record<string, React.ElementType> = {
  Sunrise,
  ListTodo,
  Star,
  MessageSquare,
  Mail,
  Phone,
  FileText,
  Handshake,
  HelpCircle,
  Activity,
  BarChart2,
  TrendingUp,
};

interface QuickToolsPanelProps {
  onSelectTool: (toolId: string) => void;
  selectedProspectId?: string;
}

export function QuickToolsPanel({ onSelectTool, selectedProspectId }: QuickToolsPanelProps) {
  return (
    <div className="flex flex-col gap-6 w-60 shrink-0 overflow-y-auto">
      {TOOLS.map((category) => (
        <div key={category.category} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {category.category}
          </h3>
          <div className="flex flex-col gap-1">
            {category.items.map((tool) => {
              const toolDef = TOOL_BY_ID[tool.id];
              const requiresProspect = toolDef?.requiresProspect;
              const isDisabled = requiresProspect && !selectedProspectId;
              const Icon = ICON_MAP[tool.icon] || FileText;
              return (
                <button
                  key={tool.id}
                  onClick={() => !isDisabled && onSelectTool(tool.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                    isDisabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'text-muted-foreground transition-colors hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/30 dark:hover:text-purple-300'
                  )}
                  title={isDisabled ? 'Select a prospect first' : undefined}
                >
                  <Icon className="h-4 w-4 text-purple-500" />
                  <span>{tool.label}</span>
                  {isDisabled && <span className="ml-auto text-xs text-muted-foreground">(needs prospect)</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
