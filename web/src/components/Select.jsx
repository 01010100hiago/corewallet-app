import Icon from "./Icon.jsx";

// Lista de opções nativa (acessível e boa no celular), com o mesmo rótulo, erro e
// visual do Input.
export default function Select({ label, name, register, error, options, hint, ...rest }) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={name}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={`h-12 w-full rounded-xl border bg-white px-3 text-base text-ink transition hover:border-pine-700/60 focus:border-pine-700 focus:outline-2 focus:outline-offset-0 focus:outline-pine-700/30 ${
          error ? "border-negative" : "border-line"
        }`}
        {...register(name)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm text-negative [--icon-accent:currentColor]">
          <Icon name="aviso" className="size-4 shrink-0" />
          {error.message}
        </p>
      )}
    </div>
  );
}
