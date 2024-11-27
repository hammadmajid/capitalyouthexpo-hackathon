import { Skeleton, type SkeletonKind } from '../loading/skeleton';
import type { AdminSearchConfig } from './navigation-header';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { mobileColors as colors, radii, spacing } from '@hsm/ui';
import { AdminError, AdminPage } from './ui';
import { Button, Copy } from '../ui';
export function StaffPage({
  title,
  children,
  search,
  onBack,
  backDisabled,
}: {
  title: string;
  children: ReactNode;
  search?: AdminSearchConfig;
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  return (
    <AdminPage
      title={title}
      {...(search ? { search } : {})}
      {...(onBack ? { onBack } : {})}
      {...(backDisabled !== undefined ? { backDisabled } : {})}
    >
      {children}
    </AdminPage>
  );
}
export function Choices<T extends string>({
  label,
  values,
  value,
  onChange,
  disabled = false,
  labels,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={{ gap: spacing.sm }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {values.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={(item === value ? 'Selected: ' : '') + item.replaceAll('_', ' ')}
            accessibilityHint={labels?.[item]}
            accessibilityState={{ selected: item === value, disabled }}
            disabled={disabled}
            onPress={() => onChange(item)}
            android_ripple={{ color: colors.aqua }}
            style={{
              minHeight: 40,
              paddingHorizontal: spacing.md,
              justifyContent: 'center',
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: item === value ? colors.deep : colors.surface,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              className="font-heading text-sm"
              style={{ color: item === value ? colors.surface : colors.primary }}
            >
              {labels?.[item] ?? sentence(item)}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
export function sentence(value: string) {
  const text = value.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
type Query = {
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  data?: unknown;
  refreshMasked?: boolean;
  loadingKind?: SkeletonKind;
  error: unknown;
  refetch: () => unknown;
};
export function ReadState({ query, empty = false }: { query: Query; empty?: boolean }) {
  if (
    !query.isError &&
    (query.isPending || query.refreshMasked || (query.isFetching && !query.data))
  )
    return <Skeleton kind={query.loadingKind ?? 'list'} label="Loading current server data…" />;
  if (query.isError)
    return (
      <AdminError
        error={query.error}
        retry={() => {
          query.refetch();
        }}
      />
    );
  return empty ? <Copy>No matching records.</Copy> : null;
}
export function Continuation({
  query,
}: {
  query: Query & {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
}) {
  return (
    <>
      {query.hasNextPage ? (
        <Button
          secondary
          label={query.isFetchingNextPage ? 'Loading more…' : 'Load more'}
          disabled={query.isFetching}
          onPress={() => {
            query.fetchNextPage();
          }}
        />
      ) : null}
    </>
  );
}
