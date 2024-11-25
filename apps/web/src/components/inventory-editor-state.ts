export type InventoryEditor =
  | { mode: 'type'; id?: string }
  | { mode: 'room' }
  | { mode: 'seat'; roomId: string }
  | {
      mode: 'lifecycle';
      resource: 'room_type' | 'room' | 'seat';
      id: string;
      label: string;
      archive: boolean;
    };
