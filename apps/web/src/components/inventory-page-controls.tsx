import { Button } from './ui/button';
export function InventoryPageControls({
  label,
  current,
  next,
  disabled,
  onFirst,
  onNext,
}: {
  label: string;
  current: boolean;
  next: boolean;
  disabled: boolean;
  onFirst: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {current ? (
        <Button variant="secondary" disabled={disabled} onClick={onFirst}>
          First {label} page
        </Button>
      ) : null}
      {next ? (
        <Button variant="secondary" disabled={disabled} onClick={onNext}>
          Next {label} page
        </Button>
      ) : null}
    </div>
  );
}
