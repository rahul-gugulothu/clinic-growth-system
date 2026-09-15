import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';

interface EmptyCardProps {
  message: string;
}

export function EmptyCard({ message }: EmptyCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
