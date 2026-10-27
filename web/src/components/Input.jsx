import Icon from "./Icon.jsx";

// Campo de formulário com rótulo visível, ícone opcional, dica e erro ligados
// ao campo por aria-describedby, e integração com o React Hook Form.
export default function Input({ label, name, register, error, type = "text", hint, prefix, right, describedBy: extraDescribedBy, ...rest }) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [error && errorId, hint && hintId, extraDescribedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-muted">{prefix}</span>}
        <input
          id={name}
          type={type}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-xl border bg-white text-base text-ink transition placeholder:text-muted hover:border-pine-700/60 focus:border-pine-700 focus:outline-2 focus:outline-offset-0 focus:outline-pine-700/30 ${
            prefix ? "pl-11" : "pl-3.5"
          } ${right ? "pr-12" : "pr-3.5"} ${error ? "border-negative" : "border-line"}`}
          {...register(name)}
          {...rest}
        />
        {right && <div className="absolute inset-y-0 right-1.5 grid place-items-center">{right}</div>}
      </div>
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
