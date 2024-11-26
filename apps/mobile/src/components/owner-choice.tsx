import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Copy } from './ui';
export function OwnerChoice({
  label,
  queryKey,
  load,
  choose,
  selectedId,
}: {
  label: string;
  queryKey: readonly unknown[];
  selectedId?: string | null | undefined;
  load: (
    cursor?: string,
  ) => Promise<{ data: { id: string; name: string }[]; nextCursor: string | null }>;
  choose: (item: { id: string; name: string }) => void;
}) {
  const [pages, setPages] = useState<string[]>([]),
    cursor = pages.at(-1);
  const query = useQuery({
    queryKey: [...queryKey, cursor],
    queryFn: () => load(cursor),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <View className="gap-3" accessibilityLabel={label}>
      <Copy>{label}</Copy>
      {query.isError ? (
        <>
          <Copy alert>Unable to load choices.</Copy>
        </>
      ) : !query.data ? (
        <Skeleton kind="list" label="Loading choices…" />
      ) : (
        <>
          {query.data.data.length ? (
            query.data.data.map((item) => (
              <Button
                key={item.id}
                label={item.name}
                secondary={selectedId !== item.id}
                onPress={() => choose(item)}
              />
            ))
          ) : (
            <Copy>No choices available.</Copy>
          )}
          {pages.length ? (
            <Button
              label={'Previous ' + label}
              secondary
              onPress={() => setPages((previous) => previous.slice(0, -1))}
            />
          ) : null}
          {query.data.nextCursor ? (
            <Button
              label={'More ' + label}
              secondary
              onPress={() => {
                const next = query.data.nextCursor;
                if (next && next !== cursor) setPages((previous) => [...previous, next]);
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
