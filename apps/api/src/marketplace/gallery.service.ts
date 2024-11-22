import { z } from 'zod';
import { publicGalleryQuerySchema } from '@hsm/contracts';
import { PublicGalleryRepository } from './gallery.repository.js';
export class PublicGalleryService {
  constructor(private readonly repository: PublicGalleryRepository) {}
  read(branchId: string, query: unknown) {
    return this.repository.read(
      z.string().uuid().parse(branchId).toLowerCase(),
      publicGalleryQuerySchema.parse(query),
    );
  }
}
