import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold">404 — Not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you tried to reach does not exist.
        </p>
      </div>
      <Button asChild>
        <Link to="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}