import { z } from 'zod';
import { publicListingRulesQuerySchema } from '@hsm/contracts';
import { PublicListingRulesRepository } from './listing-rules.repository.js';
export class PublicListingRulesService {
  constructor(private readonly repository: PublicListingRulesRepository) {}
  read(branchId: string, input: unknown) {
    return this.repository.read(
      z.string().uuid().parse(branchId).toLowerCase(),
      publicListingRulesQuerySchema.parse(input),
    );
  }
}
