export default function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="separator" aria-label="ou">
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
