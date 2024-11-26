import type { ComponentType, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { FlowInput, type FlowInputProps } from './flow-input';
export interface Field {
  name: string;
  label: string;
  secret?: boolean;
  numberFormat?: 'grouped' | 'plain';
  readOnly?: boolean;
  keyboard?: 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  options?: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  optionAliases?: Readonly<Record<string, readonly string[]>>;
  multiline?: boolean;
  maxLength?: number;
  hint?: string;
  // Shown inside the empty box instead of a separate hint line.
  placeholder?: string;
}
function DraftExtra({
  control,
  render,
  getValues,
  set,
  disabled,
}: {
  control: ReturnType<typeof useForm<Record<string, string>>>['control'];
  render: NonNullable<Parameters<typeof FlowForm>[0]['extra']>;
  getValues: () => Record<string, string>;
  set: (name: string, value: string) => void;
  disabled: boolean;
}) {
  useWatch({ control });
  return render(getValues(), set, disabled);
}
export type ChoiceProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
};
export function FlowForm({
  fields,
  label,
  submit,
  disabled = false,
  initialValues,
  resetAfterSubmit = true,
  extra,
  Action = Button,
  Choice,
  Label = Copy,
  onDraftChange,
  Input = FlowInput,
  formatError,
  onSubmittingChange,
  wrapFields,
}: {
  Input?: ComponentType<FlowInputProps>;
  formatError?: (failure: unknown) => string;
  onSubmittingChange?: (busy: boolean) => void;
  wrapFields?: (children: ReactNode) => ReactNode;
  Choice?: ComponentType<ChoiceProps> | undefined;
  Label?: ComponentType<{ children: ReactNode }> | undefined;
  onDraftChange?: ((values: Record<string, string>) => void) | undefined;
  Action?: typeof Button;
  disabled?: boolean;
  resetAfterSubmit?: boolean;
  initialValues?: Record<string, string>;
  extra?: (
    values: Record<string, string>,
    set: (name: string, value: string) => void,
    disabled: boolean,
  ) => ReactNode;
  fields: readonly Field[];
  label: string;
  submit: (values: Record<string, string>) => Promise<string> | Promise<void>;
}) {
  const form = useForm<Record<string, string>>({
    defaultValues: {
      ...Object.fromEntries(fields.map((field) => [field.name, ''])),
      ...initialValues,
    },
  });
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    if (!onDraftChange) return;
    const subscription = form.watch((values) =>
      onDraftChange(
        Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value ?? ''])),
      ),
    );
    return () => subscription.unsubscribe();
  }, [form, onDraftChange]);
  useEffect(() => {
    onSubmittingChange?.(form.formState.isSubmitting);
  }, [form.formState.isSubmitting, onSubmittingChange]);
  async function save(values: Record<string, string>) {
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await submit(values);
      if (resetAfterSubmit) form.reset();
      if (result) setNotice(result);
    } catch (failure) {
      setError(formatError ? formatError(failure) : safeMessage(failure));
    }
  }
  const inputs = (
    <>
      {fields.map((field) => (
        <View key={field.name} className="gap-2">
          <Label>{field.label}</Label>
          {field.hint ? <Copy>{field.hint}</Copy> : null}
          <Controller
            control={form.control}
            name={field.name}
            render={({ field: input }) =>
              field.options ? (
                <View className="flex-row flex-wrap gap-2">
                  {field.options.map((option) => {
                    const label = field.optionLabels?.[option] ?? option.replaceAll('_', ' '),
                      selected =
                        input.value === option ||
                        Boolean(field.optionAliases?.[option]?.includes(input.value)),
                      busy = disabled || form.formState.isSubmitting || Boolean(field.readOnly);
                    return Choice ? (
                      <Choice
                        key={option}
                        label={label}
                        selected={selected}
                        onPress={() => input.onChange(option)}
                        disabled={busy}
                      />
                    ) : (
                      <Action
                        key={option}
                        label={label}
                        secondary={!selected}
                        onPress={() => input.onChange(option)}
                        disabled={busy}
                      />
                    );
                  })}
                </View>
              ) : (
                <Input
                  field={field}
                  value={input.value}
                  change={input.onChange}
                  blur={input.onBlur}
                  disabled={disabled || form.formState.isSubmitting}
                />
              )
            }
          />
        </View>
      ))}
      {extra ? (
        <DraftExtra
          control={form.control}
          render={extra}
          getValues={form.getValues}
          set={(name, value) => form.setValue(name, value, { shouldDirty: true })}
          disabled={disabled || form.formState.isSubmitting}
        />
      ) : null}
    </>
  );
  return (
    <View className="gap-5">
      {wrapFields ? wrapFields(<View className="gap-5">{inputs}</View>) : inputs}
      {error ? <Copy alert>{error}</Copy> : null}
      {notice ? <Copy>{notice}</Copy> : null}
      <Action
        label={form.formState.isSubmitting ? 'Please wait…' : label}
        disabled={disabled || form.formState.isSubmitting}
        onPress={() => {
          void form.handleSubmit(save)();
        }}
      />
    </View>
  );
}
