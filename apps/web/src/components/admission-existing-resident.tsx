'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readStaffStays } from '@hsm/api-client';
import type { ManualStayInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import {
  AdmissionResidentSearch,
  AdmissionResidentOptions,
  AdmissionResidentPages,
} from './admission-resident-options';
type Props = {
  actorId: string;
  branchId: string;
  disabled: boolean;
  onChoose: (resident: ManualStayInput['resident'], label: string) => void;
};
export function AdmissionExistingResident(props: Props) {
  const [search, setSearch] = useState(''),
    [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ['admission-residents', props.actorId, props.branchId, search, cursor],
    gcTime: 0,
    retry: false,
    enabled: !props.disabled,
    queryFn: () =>
      readStaffStays(browserClient(), props.branchId, {
        limit: 20,
        ...(search ? { q: search } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  });
  const loading = query.isPending || query.isFetching,
    ready = !props.disabled && !loading && !query.error;
  return (
    <section aria-label="Existing branch resident" className="space-y-3">
      <p>
        Choose a named relationship from this branch's Stay history. Contact details do not link or
        merge accounts.
      </p>
      <AdmissionResidentSearch
        disabled={props.disabled || query.isFetching}
        onSearch={(value) => {
          setSearch(value);
          setCursor(undefined);
        }}
      />
      <AdmissionResidentOptions
        rows={query.data?.data}
        loading={loading}
        disabled={props.disabled || query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onChoose={props.onChoose}
      />
      <AdmissionResidentPages
        cursor={cursor}
        nextCursor={query.data?.nextCursor}
        disabled={!ready}
        onFirst={() => setCursor(undefined)}
        onNext={setCursor}
      />
    </section>
  );
}
