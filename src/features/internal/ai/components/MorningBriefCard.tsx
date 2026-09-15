import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MorningBriefCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

export function MorningBriefCard({ title, icon: Icon, children }: MorningBriefCardProps) {
  return (
    <Card className="flex-1 min-w-[200px]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}
