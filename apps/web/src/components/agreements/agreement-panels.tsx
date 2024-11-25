'use client';
import { useState } from 'react';
import type { StayRecord } from '@hsm/contracts';
import { Button } from '../ui/button';
import { AgreementAcknowledgement } from './agreement-acknowledgement';
import { AgreementDocuments } from './agreement-documents';
type Props = {
  actorId: string;
  stayId: string;
  branchId?: string;
  agreement: StayRecord['agreements'][number];
};
// One sub-panel at a time per agreement: its scans or its rules, as on mobile.
export function AgreementPanels({ actorId, stayId, branchId, agreement }: Props) {
  const [panel, setPanel] = useState<'files' | 'rules'>();
  const toggle = (next: 'files' | 'rules') => setPanel(panel === next ? undefined : next);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => toggle('files')}>
          {panel === 'files' ? 'Hide agreement documents' : 'Agreement documents'}
        </Button>
        <Button variant="secondary" onClick={() => toggle('rules')}>
          {panel === 'rules' ? 'Hide agreement policy' : 'Review agreement policy'}
        </Button>
      </div>
      {panel === 'files' ? (
        <AgreementDocuments
          actorId={actorId}
          target={{ stayId, agreementId: agreement.id, ...(branchId ? { branchId } : {}) }}
          templateFileId={agreement.terms.policy.agreementTemplate?.fileId}
        />
      ) : null}
      {panel === 'rules' ? (
        <AgreementAcknowledgement
          actorId={actorId}
          stayId={stayId}
          agreement={agreement}
          own={branchId === undefined}
        />
      ) : null}
    </>
  );
}
