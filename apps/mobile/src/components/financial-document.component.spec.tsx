import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { FinancialDocument } from './financial-document';
import { financialDocumentHtml, invoiceDocument } from '../lib/financial-document';
import { nextRentLabel } from '../lib/next-rent';
import type { BillingAgreementTerms } from '@hsm/contracts';
import { captureRef } from 'react-native-view-shot';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { printToFileAsync } from 'expo-print';
import { shareAsync } from 'expo-sharing';
import { StorageAccessFramework, writeAsStringAsync } from 'expo-file-system/legacy';
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///receipt.png'),
}));
jest.mock('expo-media-library', () => ({
  Asset: { create: jest.fn(async () => ({})) },
  requestPermissionsAsync: jest.fn(),
}));
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///receipt.pdf' })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    exists = true;
    delete() {}
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(async () => 'cGRm'),
  writeAsStringAsync: jest.fn(async () => undefined),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(async () => ({
      granted: true,
      directoryUri: 'content://downloads',
    })),
    createFileAsync: jest.fn(async () => 'content://downloads/R-1.pdf'),
  },
}));
const document = {
  title: 'Payment receipt',
  number: 'R-1',
  status: 'APPROVED',
  rows: [['Amount', 'PKR 10.01']] as [string, string][],
};
const terms: BillingAgreementTerms = {
  policyVersionId: '10000000-0000-4000-8000-000000000001',
  currency: 'PKR',
  fees: [],
  catalog: [],
  rentAmountPaisa: 1900000,
  depositPaisa: 0,
  policy: {
    cycle: { kind: 'anniversary_month', dueOffsetDays: 0 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 0,
    earlyCheckout: { kind: 'full_period' },
    allowOpenEnded: true,
    customCharges: 'disabled',
  },
};
beforeEach(() => jest.clearAllMocks());
it('PAY-009: saves the complete opened document image to gallery without reading Android photos', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 34 });
  await render(<FinancialDocument document={document} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save image to gallery' }));
  expect(await screen.findByText('Image saved to gallery.')).toBeTruthy();
  expect(captureRef).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ format: 'png' }),
  );
  expect(Asset.create).toHaveBeenCalledWith('file:///receipt.png');
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
});
it('PAY-009: saves the PDF into the Android folder selected by the user', async () => {
  await render(<FinancialDocument document={document} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save PDF' }));
  expect(await screen.findByText('PDF saved.')).toBeTruthy();
  expect(StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
    'content://downloads',
    'R-1.pdf',
    'application/pdf',
  );
  expect(writeAsStringAsync).toHaveBeenCalledWith('content://downloads/R-1.pdf', 'cGRm', {
    encoding: 'base64',
  });
  expect(printToFileAsync).toHaveBeenCalledWith({ html: expect.stringContaining('PKR 10.01') });
});
it('PAY-009: cancelling the PDF folder picker writes nothing', async () => {
  jest
    .mocked(StorageAccessFramework.requestDirectoryPermissionsAsync)
    .mockResolvedValueOnce({ granted: false });
  await render(<FinancialDocument document={document} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save PDF' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save PDF' }).props.accessibilityState.disabled).toBe(
      false,
    ),
  );
  expect(writeAsStringAsync).not.toHaveBeenCalled();
  expect(screen.queryByText('PDF saved.')).toBeNull();
});
it('PAY-009: shares the generated picture through the WhatsApp-compatible system chooser', async () => {
  await render(<FinancialDocument document={document} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share / WhatsApp' }));
  await waitFor(() =>
    expect(shareAsync).toHaveBeenCalledWith(
      'file:///receipt.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    ),
  );
});
it('PAY-009 / SEC-003: escapes user text and preserves voided invoice status in exports', () => {
  expect(financialDocumentHtml({ ...document, number: '<script>&"' })).toContain(
    '&lt;script&gt;&amp;&quot;',
  );
  const bill = invoiceDocument({
    invoiceId: terms.policyVersionId,
    invoiceNumber: 'INV-1',
    currency: 'PKR',
    dueDate: '2026-11-17',
    graceDays: 0,
    totalPaisa: 0,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 0,
    outstandingPaisa: 0,
    state: 'voided',
  });
  expect(bill.status).toBe('VOIDED');
});
it('RENT-003: shows the next agreed rent date before the next invoice is issued', () => {
  expect(
    nextRentLabel({
      terms,
      moveInDate: '2026-11-17',
      expectedLeaveDate: null,
      closed: false,
      state: 'active',
      asOf: '2026-11-20',
    }),
  ).toBe('17 Dec 2026');
});
it('RENT-003 / OUT-005: distinguishes checkout and ended stays from another rent date', () => {
  const input = {
    terms,
    moveInDate: '2026-11-17',
    expectedLeaveDate: null,
    closed: false,
    state: 'checkout_pending',
    asOf: '2026-11-20',
  };
  expect(nextRentLabel(input)).toBe('On checkout');
  expect(nextRentLabel({ ...input, closed: true })).toBe('Stay ended');
  expect(nextRentLabel({ ...input, state: 'active', expectedLeaveDate: '2026-12-01' })).toBe(
    'On checkout',
  );
});
