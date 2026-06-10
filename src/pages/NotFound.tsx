import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-7xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink-900">Page not found</h1>
      <p className="mt-2 text-ink-500 max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="mt-6">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  );
}
