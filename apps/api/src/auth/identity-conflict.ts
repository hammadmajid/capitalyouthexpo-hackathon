export function identityUniqueFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    ('code' in error && error.code === '23505') ||
    (error.cause instanceof Error && 'code' in error.cause && error.cause.code === '23505')
  );
}
// AUTH-C/OWN-001: name only the caller's own conflicting input, never the other account.
export function identityConflictField(error: unknown): 'phone' | 'cnic' | undefined {
  const source = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const constraint =
    typeof source === 'object' && source !== null && 'constraint_name' in source
      ? String(source.constraint_name)
      : '';
  return constraint.includes('phone') ? 'phone' : constraint.includes('cnic') ? 'cnic' : undefined;
}
