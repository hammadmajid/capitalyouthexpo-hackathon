import { SetupRoomController } from './setup-room.controller.js';
import { InventoryLifecycleController } from './lifecycle.controller.js';
import { InventoryController } from './controller.js';
import { InventoryPagesController } from './pages.controller.js';
import { InventoryPricingController } from './pricing.controller.js';
import { BedPricingController } from './bed-pricing.controller.js';
import { PropertyRenameController } from './property-rename.controller.js';
export const inventoryControllers = [
  SetupRoomController,
  InventoryLifecycleController,
  InventoryController,
  InventoryPagesController,
  InventoryPricingController,
  BedPricingController,
  PropertyRenameController,
];
