'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reviewCategorySchema, type ReviewRatings } from '@hsm/contracts';
import {
  createReview,
  readBranchReviews,
  readOwnReview,
  readPublicReviews,
  readReviewEligibility,
  replyToReview,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from './use-command';
import { CommandRecovery } from './command-recovery';
export const categoryLabel: Record<keyof ReviewRatings, string> = {
  cleanliness: 'Cleanliness',
  security: 'Security',
  food: 'Food',
  staff: 'Staff behaviour',
  wifi: 'Wi-Fi',
  facilities: 'Facilities',
  location: 'Location',
  value: 'Value for money',
  overall: 'Overall',
};
const start = Object.fromEntries(
  reviewCategorySchema.options.map((key) => [key, 0]),
) as ReviewRatings;
// REV-001..004: the server decides eligibility; the form only collects 1..5 ratings.
export function StayReview({ actorId, stayId }: { actorId: string; stayId: string }) {
  const eligibilityKey = ['review-eligibility', actorId, stayId],
    ownKey = ['own-review', actorId, stayId];
  const eligibility = useQuery({
    queryKey: eligibilityKey,
    gcTime: 0,
    retry: false,
    queryFn: () => readReviewEligibility(browserClient(), stayId),
  });
  const own = useQuery({
    queryKey: ownKey,
    enabled: eligibility.data?.reason === 'already_reviewed',
    gcTime: 0,
    retry: false,
    queryFn: () => readOwnReview(browserClient(), stayId),
  });
  const [ratings, setRatings] = useState<ReviewRatings>(start),
    [body, setBody] = useState('');
  const submit = useCommand(
    'StayReview:submit',
    (input: Record<string, unknown>, key) => createReview(browserClient(), stayId, input, key),
    [eligibilityKey, ownKey],
  );
  const e = eligibility.data;
  return (
    <section aria-label="Review" className="space-y-2">
      <CommandRecovery command={submit} />
      <h4 className="font-semibold">Your review</h4>
      {submit.isError ? <p role="alert">{errorMessage(submit.error)}</p> : null}
      {e?.reason === 'not_checked_in' ? <p>Reviews open after check-in.</p> : null}
      {e?.reason === 'too_early' ? (
        <p>You can review this hostel from {e.eligibleFrom} (after 30 days of stay).</p>
      ) : null}
      {own.data ? (
        <p>
          Verified Stay review: overall {own.data.ratings.overall}/5
          {own.data.status !== 'published' ? ' · hidden by moderation' : ''}
          {own.data.reply ? ' · Hostel replied: ' + own.data.reply.body : ''}
        </p>
      ) : null}
      {e?.eligible ? (
        <div className="space-y-1">
          {reviewCategorySchema.options.map((key) => (
            <label key={key} className="field-label">
              {categoryLabel[key]}
              <select
                aria-label={'Rating for ' + categoryLabel[key]}
                className="field-input"
                value={ratings[key]}
                onChange={(event) => setRatings({ ...ratings, [key]: Number(event.target.value) })}
              >
                <option value={0}>Choose 1–5</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <textarea
            aria-label="Review text (optional)"
            className="field-input"
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button
            disabled={Object.values(ratings).some((value) => value < 1) || submit.isPending}
            onClick={() =>
              submit.mutate({ ratings, ...(body.trim() ? { body: body.trim() } : {}) })
            }
          >
            Publish review
          </Button>
        </div>
      ) : null}
    </section>
  );
}
// REV-005: staff see every review with its moderation state and may reply once (editable).
export function BranchReviews({ actorId, branchId }: { actorId: string; branchId: string }) {
  const key = ['branch-reviews', actorId, branchId];
  const list = useQuery({
    queryKey: key,
    gcTime: 0,
    retry: false,
    queryFn: () => readBranchReviews(browserClient(), branchId),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const reply = useCommand(
    'BranchReviews:reply',
    (input: { id: string; body: string }, idempotency) =>
      replyToReview(browserClient(), branchId, input.id, { body: input.body }, idempotency),
    [key],
  );
  return (
    <section aria-label="Reviews" className="space-y-2">
      <CommandRecovery command={reply} />
      <h3 className="font-semibold">Verified reviews</h3>
      {reply.isError ? <p role="alert">{errorMessage(reply.error)}</p> : null}
      {list.data?.data.length === 0 ? <p>No reviews yet.</p> : null}
      {list.data?.data.map((row) => (
        <div key={row.id} className="space-y-1">
          <p>
            {row.reviewerName} · overall {row.ratings.overall}/5 · {row.status}
            {row.body ? ' · ' + row.body : ''}
          </p>
          {row.status === 'published' ? (
            <>
              <input
                aria-label={'Reply to ' + row.reviewerName}
                className="field-input"
                maxLength={1000}
                value={drafts[row.id] ?? row.reply?.body ?? ''}
                onChange={(event) => setDrafts({ ...drafts, [row.id]: event.target.value })}
              />
              <Button
                variant="secondary"
                disabled={!(drafts[row.id] ?? '').trim() || reply.isPending}
                onClick={() => reply.mutate({ id: row.id, body: (drafts[row.id] ?? '').trim() })}
              >
                {row.reply ? 'Update public reply' : 'Post public reply'}
              </Button>
            </>
          ) : null}
        </div>
      ))}
    </section>
  );
}
// REV / BR-05: public Verified Stay reviews with category averages and hostel replies.
export function PublicReviews({ branchId }: { branchId: string }) {
  const list = useQuery({
    queryKey: ['public-reviews', branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicReviews(browserClient(), branchId),
  });
  if (list.isPending) return <p role="status">Loading reviews…</p>;
  if (list.isError) return <p>Reviews are not available right now.</p>;
  const { summary, data } = list.data;
  return (
    <section aria-label="Verified reviews" className="space-y-2">
      <h3 className="font-semibold">Verified reviews ({summary.count})</h3>
      {summary.averages ? (
        <p>
          {reviewCategorySchema.options
            .map((key) => categoryLabel[key] + ' ' + (summary.averages?.[key] ?? 0).toFixed(1))
            .join(' · ')}
        </p>
      ) : (
        <p>No verified reviews yet.</p>
      )}
      {data.map((row) => (
        <article key={row.id}>
          <p>
            {row.reviewerName} · Verified Stay · overall {row.ratings.overall}/5
          </p>
          {row.body ? <p>{row.body}</p> : null}
          {row.reply ? <p>Hostel reply: {row.reply.body}</p> : null}
        </article>
      ))}
    </section>
  );
}
