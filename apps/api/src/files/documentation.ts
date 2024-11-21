import { ApiBody, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { fileMimeSchema, fileStatusSchema, uploadPurposeSchema } from '@hsm/contracts';
const identifier: SchemaObject = { type: 'string', format: 'uuid' };
const uri: SchemaObject = { type: 'string', format: 'uri' };
const instant: SchemaObject = { type: 'string', format: 'date-time' };
export const fileStatusDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['fileId', 'scanStatus', 'mimeType', 'sizeBytes'],
  properties: {
    fileId: identifier,
    scanStatus: { type: 'string', enum: fileStatusSchema.options },
    mimeType: { type: 'string', enum: fileMimeSchema.options },
    sizeBytes: { type: 'integer', minimum: 1, maximum: 10000000 },
  },
};
export const FileUploadInput = () =>
  ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['purpose', 'fileName', 'mimeType', 'sizeBytes'],
      properties: {
        purpose: { type: 'string', enum: uploadPurposeSchema.options },
        fileName: { type: 'string', minLength: 1, maxLength: 180 },
        mimeType: { type: 'string', enum: fileMimeSchema.options },
        sizeBytes: {
          type: 'integer',
          minimum: 1,
          maximum: 10000000,
          description:
            'SEC-003: images 8 MB; imports 5 MB; private attachments 10 MB. Purpose and actual content are checked.',
        },
      },
    },
  });
export const FileUploadResponse = () =>
  ApiResponse({
    status: 201,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fileId', 'uploadUrl', 'headers', 'expiresAt'],
      properties: {
        fileId: identifier,
        uploadUrl: uri,
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        expiresAt: instant,
      },
    },
  });
export const FileDownloadResponse = () =>
  ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['url', 'expiresAt'],
      properties: { url: uri, expiresAt: instant },
    },
  });
