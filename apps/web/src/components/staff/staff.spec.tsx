import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createStaff,
  listStaff,
  readStaff,
  readStaffDashboard,
  recordStaffPayment,
  reverseStaffPayment,
} from '@hsm/api-client';
import type { StaffDetail, StaffMember, StaffSalary } from '@hsm/contracts';
import { StaffWorkspace } from './staff-workspace';
import { staffBody } from './staff-form';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  createStaff: vi.fn(),
  listStaff: vi.fn(),
  readStaff: vi.fn(),
  readStaffDashboard: vi.fn(),
  recordStaffPayment: vi.fn(),
  reverseStaffPayment: vi.fn(),
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  staffId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  salaryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  paymentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const salary: StaffSalary = {
  id: salaryId,
  staffId,
  month: '2026-11-01',
  amountPaisa: 3_000_000,
  paidPaisa: 1_000_000,
  outstandingPaisa: 2_000_000,
  dueOn: '2026-11-05',
  timing: 'overdue',
  partial: true,
};
const member = (withSalary: boolean): StaffMember => ({
  id: staffId,
  branchId,
  fullName: 'Asad Khan',
  phone: '+923001234567',
  jobTitle: 'cook',
  customTitle: null,
  startsOn: '2026-01-10',
  endsOn: null,
  status: 'active',
  version: 3,
  salary: withSalary ? salary : null,
});
function detail(payroll: boolean): StaffDetail {
  return {
    staff: member(payroll),
    payroll,
    terms: payroll
      ? [
          {
            id: salaryId,
            version: 1,
            amountPaisa: 3_000_000,
            dueDay: 5,
            effectiveFrom: '2026-01-01',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]
      : [],
    salaries: payroll ? [salary] : [],
    payments: payroll
      ? [
          {
            id: paymentId,
            salaryId,
            kind: 'payment',
            amountPaisa: 1_000_000,
            paidOn: '2026-11-06',
            method: 'cash',
            reference: null,
            note: null,
            reversesPaymentId: null,
            reversed: false,
            recordedAt: '2026-11-06T00:00:00.000Z',
          },
        ]
      : [],
    agreements: [],
  };
}
function serve(payroll: boolean) {
  vi.mocked(readStaffDashboard).mockResolvedValue({
    branchId,
    month: '2026-11-01',
    today: '2026-11-22',
    activeStaff: 1,
    payroll: payroll
      ? {
          paid: 0,
          unpaid: 0,
          due: 0,
          overdue: 1,
          partial: 1,
          needsAmount: 0,
          expectedPaisa: 3_000_000,
          paidPaisa: 1_000_000,
          outstandingPaisa: 2_000_000,
          recentPayments: [],
        }
      : null,
  });
  vi.mocked(listStaff).mockResolvedValue({ data: [member(payroll)], nextCursor: null, payroll });
  vi.mocked(readStaff).mockResolvedValue(detail(payroll));
}
