import { Card, CardContent } from '@/components/ui/card';

interface DefaultCardProps {
  content: string;
}

export function DefaultCard({ content }: DefaultCardProps) {
  return (
    <Card>
      <CardContent className="py-4 text-sm text-muted-foreground">
        {content}
      </CardContent>
    </Card>
  );
}
