/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { HostelOnboarding } from '@hsm/contracts';
import { OwnerBasicStep, yearProblem } from './owner-basic-step';
const brandId = '019a1234-1234-7123-8123-000000000001';
function hostel(
  category: NonNullable<HostelOnboarding['mainBranch']>['category'],
): HostelOnboarding {
  return {
    id: brandId,
    organizationId: '019a1234-1234-7123-8123-000000000002',
    name: 'Saved hostel',
    logoFileId: null,
    missingFields: [],
    mainBranch: {
      id: '019a1234-1234-7123-8123-000000000003',
      name: 'Main branch',
      isPrimary: true,
      category,
      propertyTier: null,
      establishmentYear: null,
      cityId: null,
      areaId: null,
      subAreaId: null,
      addressLine: null,
      location: null,
      nearbyLandmark: null,
      description: null,
      phone: null,
      showPublicContact: false,
      verificationStatus: 'draft',
    },
  };
}
it('HSM-SETUP v2.14: new input offers only Male and Female plus a separate optional tier', async () => {
  await render(<OwnerBasicStep disabled={false} change={jest.fn()} save={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Male' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Female' })).toBeTruthy();
  expect(screen.queryByText(/working/i)).toBeNull();
  for (const tier of ['Standard', 'Premium', 'Luxury', 'Not specified'])
    expect(screen.getByRole('radio', { name: tier })).toBeTruthy();
});
it('HSM-SETUP v2.14: saves name, type, tier and year as typed contract input', async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  await render(<OwnerBasicStep disabled={false} change={jest.fn()} save={save} />);
  await fireEvent.changeText(screen.getByTestId('field-hostelName'), 'Green View Hostel');
  await fireEvent.press(screen.getByRole('radio', { name: 'Female' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Premium' }));
  await fireEvent.changeText(screen.getByTestId('field-establishmentYear'), '2019');
  await fireEvent.press(screen.getByRole('button', { name: 'Save & Continue' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Green View Hostel',
        category: 'girls',
        propertyTier: 'premium',
        establishmentYear: 2019,
      }),
    ),
  );
});
it('HSM-SETUP: legacy working_male stays selected as Male and is re-sent unchanged', async () => {
  const save = jest.fn().mockResolvedValue(undefined);
  await render(
    <OwnerBasicStep
      data={hostel('working_male')}
      disabled={false}
      change={jest.fn()}
      save={save}
    />,
  );
  expect(screen.getByRole('radio', { name: 'Male' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByText(/stays unchanged unless you pick a type/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save & Continue' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ category: 'working_male' })),
  );
});
it('HSM-SETUP: contextual errors block save for missing type and invalid years', async () => {
  const save = jest.fn();
  await render(<OwnerBasicStep disabled={false} change={jest.fn()} save={save} />);
  await fireEvent.changeText(screen.getByTestId('field-hostelName'), 'Hostel');
  await fireEvent.press(screen.getByRole('button', { name: 'Save & Continue' }));
  expect(await screen.findByText('Choose whether the hostel is Male or Female.')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  expect(yearProblem('19')).toMatch(/four-digit/);
  expect(yearProblem('1700')).toMatch(/four-digit/);
  expect(yearProblem('9999')).toMatch(/future/);
  expect(yearProblem('2010')).toBeUndefined();
  expect(yearProblem('')).toBeUndefined();
});
