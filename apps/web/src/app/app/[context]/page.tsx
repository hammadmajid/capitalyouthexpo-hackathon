import { z } from 'zod';
import { notFound } from 'next/navigation';
import { contexts } from '../../../lib/capabilities';
import { Shell } from '../../../components/shell';
export default async function Space({ params }: { params: Promise<{ context: string }> }) {
  const input = z.enum(contexts).safeParse((await params).context);
  if (!input.success) notFound();
  return <Shell context={input.data} />;
}
