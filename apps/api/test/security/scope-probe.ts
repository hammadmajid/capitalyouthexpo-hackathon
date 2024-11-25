import { Controller, Get } from '@nestjs/common';
import { Admin, BranchScope, Customer, ObjectScope, Owner, Self, Stay } from '../../src/access.js';
@Controller('scope-probe')
export class ScopeProbe {
  @Self() @Get('self') self() {
    return { allowed: true };
  }
  @Customer() @Get('customer') customer() {
    return { allowed: true };
  }
  @Owner() @Get('owner') owner() {
    return { allowed: true };
  }
  @Owner('orgId') @Get('organizations/:orgId') organization() {
    return { allowed: true };
  }
  @BranchScope() @Get('branches/:branchId') branch() {
    return { allowed: true };
  }
  @BranchScope('branchId', true) @Get('owner-branches/:branchId') ownerBranch() {
    return { allowed: true };
  }
  @ObjectScope() @Get('objects/:assignmentId') object() {
    return { allowed: true };
  }
  @ObjectScope('assignmentId', 'branchId')
  @Get('branches/:branchId/objects/:assignmentId')
  nested() {
    return { allowed: true };
  }
  @Admin(['verification']) @Get('admin/verification') verification() {
    return { allowed: true };
  }
  @Admin(['support']) @Get('admin/support') support() {
    return { allowed: true };
  }
  @Admin(['content_moderator']) @Get('admin/content') content() {
    return { allowed: true };
  }
  @Admin(['billing']) @Get('admin/billing') billing() {
    return { allowed: true };
  }
  @Admin(['support'], true) @Get('admin/root') root() {
    return { allowed: true };
  }
  @Stay() @Get('stay') stay() {
    return { allowed: true };
  }
}
