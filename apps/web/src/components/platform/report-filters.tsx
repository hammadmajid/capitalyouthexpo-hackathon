'use client';
import { useState, type MouseEvent } from 'react';
import {
  reportFilterPolicy,
  reportFilterStatusSchema,
  reportTypeSchema,
  type ReportFilters as Filters,
  type ReportNamedOption,
  type ReportType,
} from '@hsm/contracts';
import { reportDownloadPath } from '@hsm/api-client';
import { useReportOptions } from './use-report-options';
import { ReportOptionPicker } from './report-option-picker';
import { ReportBranches } from './report-branches';
export const reportLabels: Record<ReportType, string> = {
  occupancy: 'Occupancy',
  residents: 'Residents',
  bookings: 'Bookings',
  'rent-collection': 'Rent collection',
  'outstanding-dues': 'Outstanding dues',
  'payment-history': 'Payment history',
  'security-deposits': 'Security deposits',
  'checkout-history': 'Checkout history',
  complaints: 'Complaints',
  'transport-subscribers': 'Transport subscribers',
};
type Props = {
  actorId: string;
  branchId?: string;
  from: string;
  to: string;
  disabled: boolean;
  download: (event: MouseEvent<HTMLAnchorElement>) => void;
};
export function ReportFilters(props: Props) {
  const [type, setType] = useState<ReportType>('occupancy');
  const [branches, setBranches] = useState<ReportNamedOption[]>([]);
  return (
    <div className="space-y-3">
      <label className="field-label">
        Report type
        <select
          aria-label="Report type"
          className="field-input"
          value={type}
          disabled={props.disabled}
          onChange={(event) => {
            const next = reportTypeSchema.safeParse(event.target.value);
            if (next.success) setType(next.data);
          }}
        >
          {reportTypeSchema.options.map((kind) => (
            <option key={kind} value={kind}>
              {reportLabels[kind]}
            </option>
          ))}
        </select>
      </label>
      {props.branchId ? (
        <FilteredReport
          key={props.actorId + ':' + (props.branchId ?? 'owner') + ':' + type}
          {...props}
          type={type}
        />
      ) : (
        <ReportBranches
          actorId={props.actorId}
          selected={branches}
          onChange={setBranches}
          disabled={props.disabled}
        >
          {(ready) => (
            <FilteredReport
              key={
                props.actorId +
                ':' +
                branches
                  .map((row) => row.id)
                  .sort()
                  .join(',') +
                ':' +
                type
              }
              {...props}
              type={type}
              ownerBranches={branches}
              disabled={props.disabled || !ready}
            />
          )}
        </ReportBranches>
      )}
    </div>
  );
}
function FilteredReport({
  actorId,
  branchId,
  type,
  from,
  to,
  disabled,
  download,
  ownerBranches,
}: Props & { type: ReportType; ownerBranches?: ReportNamedOption[] }) {
  const [building, setBuilding] = useState<ReportNamedOption | null>(null);
  const [floor, setFloor] = useState<ReportNamedOption | null>(null);
  const [room, setRoom] = useState<ReportNamedOption | null>(null);
  const [resident, setResident] = useState<ReportNamedOption | null>(null);
  const [status, setStatus] = useState<Filters['status']>();
  const policy = reportFilterPolicy[type];
  const lookupBranch = branchId ?? (ownerBranches?.length === 1 ? ownerBranches[0]?.id : undefined);
  const buildings = useReportOptions(actorId, lookupBranch, type, 'building');
  const floors = useReportOptions(
    actorId,
    lookupBranch,
    type,
    'floor',
    building ? { buildingId: building.id } : {},
    Boolean(building),
  );
  const rooms = useReportOptions(actorId, lookupBranch, type, 'room', {
    ...(building ? { buildingId: building.id } : {}),
    ...(floor ? { floorId: floor.id } : {}),
  });
  const residents = useReportOptions(actorId, lookupBranch, type, 'resident', {}, policy.resident);
  const ready = [buildings, floors, rooms, residents].every((state) => state.ready);
  const query = {
    ...(branchId ? { branchId } : {}),
    ...(ownerBranches?.length ? { branchIds: ownerBranches.map((row) => row.id) } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(building ? { buildingId: building.id } : {}),
    ...(floor ? { floorId: floor.id } : {}),
    ...(room ? { roomId: room.id } : {}),
    ...(resident ? { residentId: resident.id } : {}),
    ...(status ? { status } : {}),
  };
  return (
    <div className="space-y-3">
      <p>Changing the report or branch clears its selections.</p>
      {lookupBranch ? (
        <>
          <ReportOptionPicker
            field="building"
            state={buildings}
            value={building}
            disabled={disabled}
            onChange={(value) => {
              setBuilding(value);
              setFloor(null);
              setRoom(null);
            }}
          />
          {building ? (
            <ReportOptionPicker
              field="floor"
              state={floors}
              value={floor}
              disabled={disabled}
              onChange={(value) => {
                setFloor(value);
                setRoom(null);
              }}
            />
          ) : null}
          <ReportOptionPicker
            field="room"
            state={rooms}
            value={room}
            onChange={setRoom}
            disabled={disabled}
          />
          {policy.resident ? (
            <ReportOptionPicker
              field="resident"
              state={residents}
              value={resident}
              onChange={setResident}
              disabled={disabled}
            />
          ) : null}
        </>
      ) : (
        <p>Select one report branch to filter its buildings, rooms or residents.</p>
      )}
      {policy.statuses.length ? (
        <label className="field-label">
          Report status
          <select
            aria-label="Report status"
            className="field-input"
            disabled={disabled}
            value={status ?? ''}
            onChange={(event) => {
              if (!event.target.value) setStatus(undefined);
              else if (policy.statuses.includes(event.target.value))
                setStatus(reportFilterStatusSchema.parse(event.target.value));
            }}
          >
            <option value="">All statuses</option>
            {policy.statuses.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {ready && !disabled ? (
        <p>
          <a href={'/api' + reportDownloadPath(type, 'csv', query)} onClick={download}>
            CSV
          </a>
          {' · '}
          <a href={'/api' + reportDownloadPath(type, 'pdf', query)} onClick={download}>
            PDF
          </a>
        </p>
      ) : (
        <p role="status">
          Report download is unavailable while its date range or filter access is being checked.
        </p>
      )}
    </div>
  );
}
