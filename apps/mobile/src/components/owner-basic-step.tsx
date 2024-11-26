import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';
import {
  AlignLeft,
  Building2,
  CalendarDays,
  Phone,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileColors } from '@hsm/ui';
import { useState } from 'react';
import type { HostelBasicsInput, HostelOnboarding } from '@hsm/contracts';
import { ownerBasicsForm } from '@hsm/api-client';
import { FlowForm } from './flow-form';
import {
  ChoiceTile,
  FieldLabel,
  InfoRow,
  SetupButton,
  SetupCard,
  SetupText,
} from './owner-wizard-ui';
import { hostelTypeLabels } from './owner-status';
// HSM-SETUP (SRS v2.14): new input offers only Male/Female; stored legacy working_* values
// stay selected and are re-sent unchanged unless the Owner explicitly picks a new type.
const ownerHostelTypes = ['boys', 'girls'] as const;
const ownerHostelTypeLabels = { boys: 'Male', girls: 'Female' } as const;
const ownerHostelTypeAliases = {
  boys: ['working_male'],
  girls: ['working_female'],
} as const;
const tiers = ['', 'standard', 'premium', 'luxury'] as const;
const tierLabels = {
  '': 'Not specified',
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
};
function karachiYear() {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', year: 'numeric' }).format(
      new Date(),
    ),
  );
}
// Field label with a matching icon; the text stays the accessible name.
const labelIcons: [string, LucideIcon][] = [
  ['Name', Building2],
  ['For', Users],
  ['About', AlignLeft],
  ['Category', Star],
  ['Since', CalendarDays],
  ['Phone', Phone],
];
function IconLabel({ children }: { children: ReactNode }) {
  const text = typeof children === 'string' ? children : '';
  const Icon = labelIcons.find(([prefix]) => text.startsWith(prefix))?.[1];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {Icon ? <Icon size={18} color={mobileColors.primary} /> : null}
      <FieldLabel>{children}</FieldLabel>
    </View>
  );
}
function CompactChoice(props: ComponentProps<typeof ChoiceTile>) {
  return <ChoiceTile {...props} compact />;
}
export function yearProblem(value: string | undefined) {
  const text = value?.trim() ?? '';
  if (!text) return undefined;
  const year = Number(text);
  if (!/^\d{4}$/.test(text) || year < 1800) return 'Enter a four-digit year from 1800 onwards.';
  if (year > karachiYear()) return 'Establishment year cannot be in the future.';
  return undefined;
}
export function OwnerBasicStep({
  data,
  fixedName,
  draft,
  disabled,
  save,
  change,
}: {
  data?: HostelOnboarding | undefined;
  // BRN-001: a branch of an existing hostel keeps that hostel's name; it is not edited here.
  fixedName?: string | undefined;
  draft?: Record<string, string> | undefined;
  disabled: boolean;
  save: (input: HostelBasicsInput) => Promise<void>;
  change: (values: Record<string, string>) => void;
}) {
  const [problem, setProblem] = useState<string>();
  const stored = data?.mainBranch?.category;
  return (
    <SetupCard>
      {fixedName ? <InfoRow label="Hostel" value={fixedName} /> : null}
      <FlowForm
        Action={SetupButton}
        Choice={CompactChoice}
        Label={IconLabel}
        label="Save & Continue"
        resetAfterSubmit={false}
        disabled={disabled}
        onDraftChange={change}
        initialValues={
          draft ?? {
            hostelName: data?.name ?? '',
            hostelCategory: stored ?? '',
            hostelDescription: data?.mainBranch?.description ?? '',
            hostelPhone: data?.mainBranch?.phone ?? '',
            propertyTier: data?.mainBranch?.propertyTier ?? '',
            establishmentYear: data?.mainBranch?.establishmentYear?.toString() ?? '',
          }
        }
        fields={[
          ...(fixedName ? [] : [{ name: 'hostelName', label: 'Name *', maxLength: 150 }]),
          {
            name: 'hostelCategory',
            label: 'For *',
            options: ownerHostelTypes,
            optionLabels: ownerHostelTypeLabels,
            optionAliases: ownerHostelTypeAliases,
            ...(stored?.startsWith('working_')
              ? {
                  hint:
                    'Saved as ' +
                    (hostelTypeLabels[stored] ?? stored) +
                    '. It stays unchanged unless you pick a type.',
                }
              : {}),
          },
          {
            name: 'hostelDescription',
            label: 'About (optional)',
            multiline: true,
            maxLength: 5000,
          },
          {
            name: 'propertyTier',
            label: 'Category (optional)',
            options: tiers,
            optionLabels: tierLabels,
            // Disclosure kept short: the tier is the owner's own claim.
            hint: 'Your choice · not verified by HSM',
          },
          {
            name: 'establishmentYear',
            numberFormat: 'plain',
            label: 'Since (year, optional)',
            keyboard: 'number-pad',
            maxLength: 4,
          },
          { name: 'hostelPhone', label: 'Phone (optional)', keyboard: 'phone-pad' },
        ]}
        submit={async (entered) => {
          setProblem(undefined);
          const values = fixedName ? { ...entered, hostelName: fixedName } : entered;
          const year = yearProblem(values.establishmentYear);
          if ((values.hostelName ?? '').trim().length < 2)
            return setProblem('Enter the hostel name (at least two characters).');
          if (!values.hostelCategory)
            return setProblem('Choose whether the hostel is Male or Female.');
          if (year) return setProblem(year);
          await save(ownerBasicsForm(values, data?.logoFileId ?? undefined));
        }}
      />
      {problem ? <SetupText alert>{problem}</SetupText> : null}
      <SetupText muted>Private draft</SetupText>
    </SetupCard>
  );
}
