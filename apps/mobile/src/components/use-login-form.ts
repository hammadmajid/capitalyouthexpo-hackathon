import { useEffect, useRef, useState } from 'react';
import { prepareLogin, type LoginErrors, type LoginInput } from '../lib/login-input';
import { safeMessage } from '../lib/messages';
import type { LoginMode } from './login-mode';
export function useLoginForm(submit: (values: Record<string, string>) => Promise<string>) {
  const [values, setValues] = useState<LoginInput>({ email: '', phone: '', password: '' });
  const [mode, setMode] = useState<LoginMode>('email');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [failure, setFailure] = useState<string>();
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function change(name: keyof LoginInput, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors({});
    setFailure(undefined);
  }
  function select(next: LoginMode) {
    if (busy.current || next === mode) return;
    setMode(next);
    setValues((current) => ({ ...current, email: '', phone: '' }));
    setErrors({});
    setFailure(undefined);
  }
  async function signIn() {
    // SEC-001: synchronous lock blocks two presses before the next render.
    if (busy.current) return;
    const prepared = prepareLogin(values);
    setFailure(undefined);
    if (!prepared.ok) {
      setErrors(prepared.errors);
      return;
    }
    busy.current = true;
    setErrors({});
    setLoading(true);
    try {
      await submit(prepared.values);
      if (mounted.current) setValues((current) => ({ ...current, password: '' }));
    } catch (error) {
      if (mounted.current) setFailure(safeMessage(error));
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }
  return { values, mode, errors, failure, loading, change, select, signIn };
}
