import { useEffect, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

// Keep only our own cache copy while uploading/scanning; never modify the picker source.
export function useOwnerPhotoPreview() {
  const file = useRef<File | undefined>(undefined);
  const retained = useRef(false);
  const [uri, setUri] = useState<string>();
  function release() {
    if (file.current?.exists) file.current.delete();
    file.current = undefined;
  }
  useEffect(
    () => () => {
      if (!retained.current) release();
    },
    [],
  );
  function retain(source: string) {
    const preview = new File(Paths.cache, 'owner-photo-' + randomUUID() + '.img');
    new File(source).copy(preview);
    release();
    file.current = preview;
    retained.current = false;
    setUri(preview.uri);
  }
  function restore(source: string | undefined) {
    if (!source) return;
    const selected = new URL(source);
    if (
      selected.protocol !== 'file:' ||
      !selected.href.startsWith(Paths.cache.uri + 'owner-photo-')
    )
      return;
    const cached = new File(selected.href);
    if (cached.exists) {
      file.current = cached;
      retained.current = true;
      setUri(source);
    }
  }
  function preserve() {
    retained.current = true;
    return file.current?.uri;
  }
  function clear() {
    retained.current = false;
    release();
    setUri(undefined);
  }
  return { uri, retain, clear, restore, preserve };
}
