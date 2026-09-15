import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, selectReviewsByClinic } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SyntheticDataBanner } from '@/components/SyntheticDataBanner';
import { Star, Send } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/format';

function statusTone(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info' {
  switch (status) {
    case 'Requested':
      return 'info';
    case 'Received':
      return 'success';
    default:
      return 'muted';
  }
}

export default function ReviewsPage() {
  const clinics = useStore((s) => s.clinics);
  const clinicId = useStore((s) => s.session.activeClinicId) || Object.keys(clinics)[0];
  const reviews = useStore((s) => (clinicId ? selectReviewsByClinic(clinicId)(s) : []));
  const updateReview = useStore((s) => s.updateReview);

  const total = reviews.length;
  const requested = reviews.filter((r) => r.status === 'Requested');
  const received = reviews.filter((r) => r.status === 'Received');
  const avgRating = reviews.length > 0
    ? Math.round(reviews.filter((r) => r.rating != null).reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.filter((r) => r.rating != null).length * 10) / 10
    : null;

  const recordReview = (reviewId: string, rating: number) => {
    try {
      updateReview(reviewId, { status: 'Received', rating });
      toast.success('Review recorded');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to record review');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground">Review request and feedback tracking</p>
      </div>

      <SyntheticDataBanner />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Requests sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{total}</div>
            <p className="text-xs text-muted-foreground">{requested.length} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{requested.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting response</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Received</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{received.length}</div>
            <p className="text-xs text-muted-foreground">Reviews completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average rating</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{avgRating != null ? avgRating : '—'}</div>
            <p className="text-xs text-muted-foreground">From {received.length} reviews</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending requests ({requested.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {requested.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending review requests.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {requested.map((r) => (
                <ReviewRow key={r.review_id} review={r} onRecord={recordReview} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Received reviews ({received.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {received.length === 0 ? (
            <p className="text-sm text-muted-foreground">No received reviews yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {received.map((r) => (
                <ReviewRow key={r.review_id} review={r} onRecord={recordReview} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewRow({ review, onRecord }: { review: any; onRecord: (id: string, rating: number) => void }) {
  const [rating, setRating] = useState('');
  const [showRecord, setShowRecord] = useState(false);

  const appointment = review.appointment_id ? useStore.getState().appointments[review.appointment_id] : undefined;
  const lead = appointment ? useStore.getState().leads[appointment.lead_id] : undefined;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{review.review_id}</span>
          <Badge tone={statusTone(review.status)}>{review.status}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{fmtDate(review.requested_at)}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {lead?.lead_id ?? '—'} · {lead?.service_interested ?? '—'}
      </div>
      {appointment && (
        <div className="mt-1 text-xs text-muted-foreground">
          Appointment: {appointment.appointment_id} · {fmtDate(appointment.scheduled_at)}
        </div>
      )}
      <div className="mt-1 text-xs text-muted-foreground">
        Source: {review.source} · Rating: {review.rating != null ? `${review.rating}/5` : '—'}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {review.status === 'Requested' && (
          <>
            {!showRecord ? (
              <Button size="sm" variant="outline" onClick={() => setShowRecord(true)}>
                <Star className="mr-1 h-3 w-3" /> Record review
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Select value={rating} onChange={(e) => setRating(e.target.value)} className="h-8 text-xs">
                  <option value="">Rating</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}/5</option>
                  ))}
                </Select>
                <Button size="sm" onClick={() => { if (!rating) return; onRecord(review.review_id, Number(rating)); setShowRecord(false); setRating(''); }}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowRecord(false); setRating(''); }}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link to={`/clinic/leads/${lead?.lead_id}`}>Open lead</Link>
        </Button>
        {appointment && (
          <Button asChild size="sm" variant="ghost">
            <Link to="/clinic/appointments">Appointment</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
