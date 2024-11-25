'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
export interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  options?: readonly { value: string; label: string }[];
}
export function FlowForm({
  fields,
  submit,
  label,
  disabled = false,
  initialValues,
  resetAfterSubmit = true,
  extra,
}: {
  fields: readonly Field[];
  submit: (values: Record<string, string>) => Promise<string> | Promise<void>;
  label: string;
  resetAfterSubmit?: boolean;
  disabled?: boolean;
  initialValues?: Record<string, string>;
  extra?: (
    values: Record<string, string>,
    set: (name: string, value: string) => void,
    disabled: boolean,
  ) => ReactNode;
}) {
  const form = useForm<Record<string, string>>({
    ...(initialValues ? { defaultValues: initialValues } : {}),
  });
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  async function save(values: Record<string, string>) {
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await submit(values);
      if (resetAfterSubmit) form.reset();
      if (result) setNotice(result);
    } catch (failure) {
      setError(
        failure instanceof z.ZodError ? 'Check the fields and try again.' : errorMessage(failure),
      );
    }
  }
  return (
    <form
      method="post"
      action="#"
      onSubmit={form.handleSubmit(save)}
      className="space-y-5"
      noValidate
    >
      <fieldset disabled={!ready || disabled || form.formState.isSubmitting} className="space-y-5">
        {fields.map((field) => (
          <div key={field.name}>
            <label htmlFor={field.name} className="field-label">
              {field.label}
            </label>
            {field.options ? (
              <select id={field.name} className="field-input" {...form.register(field.name)}>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.name}
                className="field-input"
                type={field.type ?? 'text'}
                autoComplete={field.autoComplete}
                {...form.register(field.name)}
              />
            )}
          </div>
        ))}
      </fieldset>
      {extra?.(
        form.watch(),
        (name, value) => form.setValue(name, value, { shouldDirty: true }),
        !ready || disabled || form.formState.isSubmitting,
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-hsm-primary">
          {notice}
        </p>
      )}
      <Button
        type="submit"
        className="w-full"
        disabled={!ready || disabled || form.formState.isSubmitting}
        aria-busy={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? 'Please wait…' : label}
      </Button>
    </form>
  );
}
