import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ApiFailure, publicHostelShareUrl, publicShareQuerySchema } from '@hsm/api-client';
import { GuardianSummary } from '../../../components/guardian-summary';
import { loadPublicHostelSummary } from '../../../server/public-summary';
import { webConfig } from '../../../server/config';
export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { branchId } = await params,
    parsed = z.string().uuid().safeParse(branchId);
  if (!parsed.success) return { title: 'Hostel summary unavailable' };
  return {
    title: 'Hostel · HSM family summary',
    alternates: { canonical: publicHostelShareUrl(webConfig().WEB_ORIGIN, parsed.data) },
  };
}
export default async function SharePage({ params, searchParams }: Props) {
  const { branchId } = await params,
    identifier = z.string().uuid().safeParse(branchId),
    query = publicShareQuerySchema.safeParse(await searchParams);
  if (!identifier.success || !query.success) notFound();
  try {
    const summary = await loadPublicHostelSummary(identifier.data, query.data);
    return <GuardianSummary summary={summary} />;
  } catch (error) {
    if (error instanceof ApiFailure && error.problem.status === 404) notFound();
    return (
      <main id="main" className="space-y-4 p-6">
        <h1>Hostel summary unavailable</h1>
        <p>Current public information could not be loaded. Please retry shortly.</p>
        <a href={'/share/' + identifier.data}>Retry summary</a>
      </main>
    );
  }
}
