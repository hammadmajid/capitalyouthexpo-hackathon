'use client';
import { useState } from 'react';
import Image from 'next/image';
function StripPhoto({ id, label }: { id: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p>Photo unavailable: {label}</p>
  ) : (
    <Image
      unoptimized
      width={240}
      height={160}
      className="h-32 w-48 shrink-0 rounded-panel object-cover"
      src={'/api/v1/marketplace/media/' + id}
      alt={label}
      onError={() => setFailed(true)}
    />
  );
}
// ROOM-004: customers inspect the room and the specific bed photos before requesting them.
export function InventoryPhotoStrip({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div className="flex gap-2 overflow-x-auto" aria-label={label + ' photos'}>
      {ids.map((id, index) => (
        <StripPhoto key={id} id={id} label={label + ' photo ' + String(index + 1)} />
      ))}
    </div>
  );
}
