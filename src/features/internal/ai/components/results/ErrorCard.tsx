import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface ErrorCardProps {
  message: string;
}

export function ErrorCard({ message }: ErrorCardProps) {
  return (
    <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
      <CardContent className="flex items-center gap-2 py-4 text-sm text-red-700">
        <AlertTriangle className="h-4 w-4" />
        <span>{message}</span>
      </CardContent>
    </Card>
  );
}
