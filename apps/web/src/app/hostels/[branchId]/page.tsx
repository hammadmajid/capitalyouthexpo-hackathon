import { z } from 'zod';
import { notFound } from 'next/navigation';
import { MarketplaceDetails } from '../../../components/marketplace-details';
export default async function HostelPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const identifier = z.string().uuid().safeParse(branchId);
  if (!identifier.success) notFound();
  return <MarketplaceDetails branchId={identifier.data.toLowerCase()} />;
}
