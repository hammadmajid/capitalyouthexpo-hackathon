'use client';
import { useEffect, useState } from 'react';
import { usePropertyPages } from './use-property-pages';
import { PropertyPageControls } from './property-page-controls';
import { PropertyEditor, type PropertyEdit } from './property-editor';
import { propertyScopeDenied, usePropertyCommand } from './property-command';
import { useInventoryNavigationLock } from './inventory-navigation';
import { CommandRecovery } from './services/command-recovery';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function PropertyManagement({
  actorId,
  branchId,
  disabled = false,
}: {
  actorId: string;
  branchId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return open ? (
    <PropertyPanel
      key={actorId + ':' + branchId}
      actorId={actorId}
      branchId={branchId}
      close={() => setOpen(false)}
    />
  ) : (
    <Button type="button" variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
      Manage buildings and floors
    </Button>
  );
}
function PropertyPanel({
  actorId,
  branchId,
  close,
}: {
  actorId: string;
  branchId: string;
  close: () => void;
}) {
  const state = usePropertyPages(actorId, branchId);
  const command = usePropertyCommand(actorId, branchId);
  const [edit, setEdit] = useState<PropertyEdit>();
  const [saved, setSaved] = useState(false);
  const denied = [state.buildings.error, state.floors.error, command.error].find(
    propertyScopeDenied,
  );
  const locked = Boolean(edit) || command.isPending || command.unresolved;
  useInventoryNavigationLock(!denied && (locked || state.ready));
  const unavailable = !state.canEdit || command.isPending || command.unresolved;
  const changedTarget =
    edit?.kind === 'archive-building'
      ? state.building
      : edit?.kind === 'archive-floor'
        ? state.floor
        : undefined;
  const stale = Boolean(
    edit && 'version' in edit && changedTarget && changedTarget.version !== edit.version,
  );
  useEffect(() => {
    if (command.isSuccess) {
      setEdit(undefined);
      setSaved(true);
    }
  }, [command.isSuccess]);
  return (
    <section aria-label="Property metadata" className="space-y-3">
      <h3 className="font-semibold">Buildings and floors</h3>
      <p>
        These names classify rooms for reports. Archiving metadata retains existing rooms and
        availability.
      </p>
      {denied ? (
        <p role="alert">{errorMessage(denied)}</p>
      ) : (
        <>
          <PropertyPageControls state={state} disabled={locked} />
          {saved && state.ready ? <p role="status">Property metadata saved.</p> : null}
          {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
          <CommandRecovery
            command={{ ...command, isPending: command.isPending || !state.canEdit }}
          />
          {stale ? (
            <div>
              <p role="alert">
                Property metadata changed. Keep your reason and load the current version before
                archiving.
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={unavailable}
                onClick={() => {
                  if (edit && 'version' in edit && changedTarget) {
                    setEdit({ ...edit, version: changedTarget.version });
                    command.reset();
                  }
                }}
              >
                Use current property version
              </Button>
            </div>
          ) : null}
          {edit ? (
            <PropertyEditor
              edit={edit}
              disabled={unavailable || stale}
              cancel={() => {
                setEdit(undefined);
                command.reset();
              }}
              save={(body) =>
                command.mutate(body, {
                  onSuccess: () => {
                    setEdit(undefined);
                    setSaved(true);
                  },
                })
              }
            />
          ) : null}
          {!edit && state.canEdit ? (
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                disabled={unavailable}
                onClick={() => {
                  setEdit({ kind: 'building' });
                  setSaved(false);
                  command.reset();
                }}
              >
                Add building
              </Button>
              {state.building && !state.building.archivedAt ? (
                <>
                  <Button
                    type="button"
                    disabled={unavailable}
                    onClick={() => {
                      if (state.building) {
                        setEdit({
                          kind: 'floor',
                          buildingId: state.building.id,
                          name: state.building.name,
                        });
                        setSaved(false);
                        command.reset();
                      }
                    }}
                  >
                    Add floor
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={unavailable}
                    onClick={() => {
                      if (state.building) {
                        setEdit({
                          kind: 'archive-building',
                          id: state.building.id,
                          name: state.building.name,
                          version: state.building.version,
                        });
                        command.reset();
                      }
                    }}
                  >
                    Archive selected building
                  </Button>
                </>
              ) : null}
              {state.floor && !state.floor.archivedAt ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={unavailable}
                  onClick={() => {
                    if (state.floor) {
                      setEdit({
                        kind: 'archive-floor',
                        id: state.floor.id,
                        name: state.floor.label,
                        version: state.floor.version,
                      });
                      command.reset();
                    }
                  }}
                >
                  Archive selected floor
                </Button>
              ) : null}
            </div>
          ) : null}
          {state.ready && !state.canEdit ? (
            <p>Editing property metadata requires an inventory grant.</p>
          ) : null}
        </>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={command.isPending || (!denied && command.unresolved)}
        onClick={close}
      >
        Close property metadata
      </Button>
    </section>
  );
}
