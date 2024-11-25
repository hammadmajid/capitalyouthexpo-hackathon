'use client';
import { enterApp } from '../../lib/enter-app';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@hsm/contracts';
import { readApi } from '@hsm/api-client';
import { z } from 'zod';
import { browserClient } from '../../lib/client';
import { webLoginSchema } from '../../lib/session';
import { authenticationPath, loginDestination } from '../../lib/return-path';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
const fields = loginSchema.pick({ identifier: true, password: true });
type Fields = z.infer<typeof fields>;
export function LoginForm({ returnPath }: { returnPath?: string | undefined }) {
  const cache = useQueryClient();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState<string>();
  const form = useForm<Fields>({
    resolver: zodResolver(fields),
    defaultValues: { identifier: '', password: '' },
  });
  async function submit(values: Fields) {
    setError(undefined);
    try {
      const profile = await readApi(
        browserClient().POST('/v1/auth/login', { body: { ...values, client: 'web' } }),
        webLoginSchema,
      );
      cache.clear();
      cache.setQueryData(['session'], { user: profile.user, capabilities: profile.capabilities });
      form.reset();
      enterApp(loginDestination(returnPath, profile));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-semibold text-hsm-primary">Welcome back</p>
        <h2 className="mt-2 text-3xl font-bold text-hsm-heading">Sign in to your space</h2>
        <p className="mt-3 text-sm text-hsm-secondary">
          Use your email or Pakistani mobile number.
        </p>
      </div>
      <form
        method="post"
        action="/login"
        onSubmit={form.handleSubmit(submit)}
        className="space-y-5"
        noValidate
      >
        <fieldset disabled={!ready} className="space-y-5">
          <div>
            <label htmlFor="identifier" className="field-label">
              Email or mobile number
            </label>
            <input
              id="identifier"
              autoComplete="username"
              className="field-input"
              {...form.register('identifier')}
              aria-invalid={Boolean(form.formState.errors.identifier)}
              aria-describedby="identifier-error"
            />
            <p id="identifier-error" className="field-error">
              {form.formState.errors.identifier && 'Enter your email or mobile number.'}
            </p>
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="field-input"
              {...form.register('password')}
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby="password-error"
            />
            <p id="password-error" className="field-error">
              {form.formState.errors.password && 'Enter your password (8–128 characters).'}
            </p>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={!ready || form.formState.isSubmitting}
          aria-busy={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link className="text-link" href="/recover">
          Forgot password?
        </Link>
        <Link className="text-link" href={authenticationPath('register', returnPath)}>
          Create an account
        </Link>
      </div>
      <p className="border-t border-hsm-border pt-5 text-sm text-hsm-secondary">
        Invited as a manager?{' '}
        <Link className="text-link" href="/activate">
          Activate your account
        </Link>
      </p>
    </div>
  );
}
