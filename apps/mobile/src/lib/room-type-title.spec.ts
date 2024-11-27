import { describe, expect, it } from 'vitest';
import { roomTypeFacts, roomTypeTitle } from './room-type-title';

describe('roomTypeTitle', () => {
  it('drops a stale price and rent mode saved inside the name', () => {
    expect(roomTypeTitle({ name: '2-seater · Rent per bed · PKR 18,000.00', capacity: 2 })).toBe(
      '2-seater',
    );
  });
  it('keeps names the owner typed', () => {
    expect(roomTypeTitle({ name: 'Deluxe · Garden view', capacity: 3 })).toBe(
      'Deluxe · Garden view',
    );
  });
  it('falls back to the seater size when nothing is left', () => {
    expect(roomTypeTitle({ name: 'Rent whole room · Rs 9,000', capacity: 4 })).toBe('4-seater');
  });
});

describe('roomTypeFacts', () => {
  it('does not repeat the bed count the title already shows', () => {
    expect(roomTypeFacts({ name: '2-seater · Rent per bed', capacity: 2 }, 'Per bed')).toBe(
      'Per bed',
    );
  });
  it('adds the bed count for custom names', () => {
    expect(roomTypeFacts({ name: 'Deluxe', capacity: 1 }, 'Whole room')).toBe('1 bed · Whole room');
  });
});
