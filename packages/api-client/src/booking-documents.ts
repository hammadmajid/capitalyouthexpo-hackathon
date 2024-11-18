import { z } from 'zod';
import {
  bookingDocumentSubmissionSchema,
  bookingDocumentReviewSchema,
  ownBookingDocumentSchema,
  ownerBookingDocumentSchema,
  ownBookingDocumentPageSchema,
  ownerBookingDocumentPageSchema,
  downloadResponseSchema,
  managementPageSchema,
  type BookingDocumentSubmission,
  type BookingDocumentReview,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';
import { setupPageQuery } from './owner-setup-body.js';
const identifier = (value: string) => z.string().uuid().parse(value).toLowerCase();
type Page = { cursor?: string; limit?: number };
export function ownBookingDocuments(client: ApiClient, branchId: string, page: Page = {}) {
  return readApi(
    client.GET('/v1/me/booking-documents/{branchId}', {
      params: {
        path: { branchId: identifier(branchId) },
        query: setupPageQuery(managementPageSchema.parse(page)),
      },
    }),
    ownBookingDocumentPageSchema,
  );
}
export function pendingBookingDocuments(client: ApiClient, branchId: string, page: Page = {}) {
  return readApi(
    client.GET('/v1/branches/{branchId}/booking-documents', {
      params: {
        path: { branchId: identifier(branchId) },
        query: setupPageQuery(managementPageSchema.parse(page)),
      },
    }),
    ownerBookingDocumentPageSchema,
  );
}
export function submitBookingDocument(
  client: ApiClient,
  branchId: string,
  input: BookingDocumentSubmission,
  key: string,
) {
  return readApi(
    client.POST('/v1/me/booking-documents/{branchId}', {
      params: {
        path: { branchId: identifier(branchId) },
        header: { 'Idempotency-Key': identifier(key) },
      },
      body: bookingDocumentSubmissionSchema.parse(input),
    }),
    ownBookingDocumentSchema,
  );
}
export function reviewBookingDocument(
  client: ApiClient,
  branchId: string,
  documentId: string,
  input: BookingDocumentReview,
  key: string,
) {
  return readApi(
    client.POST('/v1/branches/{branchId}/booking-documents/{documentId}/review', {
      params: {
        path: { branchId: identifier(branchId), documentId: identifier(documentId) },
        header: { 'Idempotency-Key': identifier(key) },
      },
      body: bookingDocumentReviewSchema.parse(input),
    }),
    ownerBookingDocumentSchema,
  );
}
export function downloadBookingDocument(client: ApiClient, branchId: string, documentId: string) {
  return readApi(
    client.GET('/v1/branches/{branchId}/booking-documents/{documentId}/download', {
      params: { path: { branchId: identifier(branchId), documentId: identifier(documentId) } },
    }),
    downloadResponseSchema,
  );
}
