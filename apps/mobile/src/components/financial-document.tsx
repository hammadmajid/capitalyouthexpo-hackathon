import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import {
  financialDocumentHtml,
  type FinancialDocument as Document,
} from '../lib/financial-document';
import { residentStyles as s } from './resident-detail-ui';
import { Button, Copy } from './ui';

async function savePdf(uri: string, number: string) {
  if (Platform.OS === 'android') {
    const fs = await import('expo-file-system/legacy');
    const directory = await fs.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!directory.granted) return false;
    const bytes = await fs.readAsStringAsync(uri, { encoding: fs.EncodingType.Base64 });
    const file = await fs.StorageAccessFramework.createFileAsync(
      directory.directoryUri,
      number.replace(/[^A-Za-z0-9-]/g, '-') + '.pdf',
      'application/pdf',
    );
    await fs.writeAsStringAsync(file, bytes, { encoding: fs.EncodingType.Base64 });
  } else {
    const sharing = await import('expo-sharing');
    if (!(await sharing.isAvailableAsync()))
      throw new Error('File sharing is unavailable on this device.');
    await sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Save PDF to Files',
      UTI: 'com.adobe.pdf',
    });
  }
  return true;
}

// PAY-009: export only an explicitly opened, authorized server snapshot; no proof becomes a receipt.
export function FinancialDocument({ document }: { document: Document }) {
  const target = useRef<View>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<string>(),
    [error, setError] = useState<string>();
  async function exportDocument(kind: 'image' | 'pdf' | 'share') {
    if (busy) return;
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    let temporary: string | undefined;
    try {
      if (kind === 'pdf') {
        const print = await import('expo-print');
        const result = await print.printToFileAsync({ html: financialDocumentHtml(document) });
        temporary = result.uri;
        if (await savePdf(result.uri, document.number)) setNotice('PDF saved.');
      } else {
        const shot = await import('react-native-view-shot');
        temporary = await shot.captureRef(target, { format: 'png', quality: 1, result: 'tmpfile' });
        if (kind === 'image') {
          const media = await import('expo-media-library');
          // Android 10+ can insert our own image without reading the user's gallery.
          if (
            Platform.OS === 'ios' ||
            (Platform.OS === 'android' && Number(Platform.Version) < 29)
          ) {
            const permission = await media.requestPermissionsAsync(true, ['photo']);
            if (!permission.granted) throw new Error('Allow saving photos to save this image.');
          }
          await media.Asset.create(temporary);
          setNotice('Image saved to gallery.');
        } else {
          const sharing = await import('expo-sharing');
          if (!(await sharing.isAvailableAsync()))
            throw new Error('File sharing is unavailable on this device.');
          await sharing.shareAsync(temporary, {
            mimeType: 'image/png',
            dialogTitle: 'Share receipt — choose WhatsApp',
            UTI: 'public.png',
          });
        }
      }
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      if (temporary) {
        const fs = await import('expo-file-system');
        try {
          const file = new fs.File(temporary);
          if (file.exists) file.delete();
        } catch {
          /* Export already completed or cancelled. */
        }
      }
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <View
        ref={target}
        collapsable={false}
        accessibilityLabel="Financial document preview"
        style={{ backgroundColor: c.surface, borderRadius: 16, padding: 20, gap: 12 }}
      >
        <Text style={[s.heading, { color: c.primary, fontSize: 22 }]}>{document.title}</Text>
        <Text style={s.value}>{document.number}</Text>
        <Text style={s.value}>{document.status}</Text>
        {document.rows.map(([label, value], index) => (
          <View
            key={label + index}
            style={[
              s.row,
              {
                alignItems: 'flex-start',
                borderBottomWidth: 0.5,
                borderColor: c.border,
                paddingBottom: 7,
              },
            ]}
          >
            <Text style={[s.body, { flex: 1 }]}>{label}</Text>
            <Text style={[s.value, { flex: 1, textAlign: 'right', fontSize: 12 }]}>{value}</Text>
          </View>
        ))}
        <Text style={s.muted}>Payments go directly to the hostel · HSM</Text>
      </View>
      <Button
        secondary
        label="Save image to gallery"
        disabled={busy}
        onPress={() => void exportDocument('image')}
      />
      <Button
        secondary
        label="Save PDF"
        disabled={busy}
        onPress={() => void exportDocument('pdf')}
      />
      <Button
        label="Share / WhatsApp"
        disabled={busy}
        onPress={() => void exportDocument('share')}
      />
      {notice ? <Copy>{notice}</Copy> : null}
      {error ? <Copy alert>{error}</Copy> : null}
    </View>
  );
}
