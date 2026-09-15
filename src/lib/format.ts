import { format, formatDistanceToNow } from 'date-fns';

export function fmtDate(iso: string | null | undefined, pattern = 'dd MMM yyyy'): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), pattern);
  } catch {
    return '—';
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd MMM yyyy, HH:mm');
  } catch {
    return '—';
  }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function fmtCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    amount,
  );
}