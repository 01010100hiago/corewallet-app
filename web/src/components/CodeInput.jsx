import Icon from "./Icon.jsx";

// Campo do código da verificação em duas etapas: 6 dígitos do aplicativo ou, no modo
// "recuperação", um dos códigos guardados na ativação (XXXXX-XXXXX).
export default function CodeInput({ id, label, value, onChange, recovery = false, error, autoFocus = false, describedBy, inputRef }) {
  const errorId = `${id}-error`;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        value={value}
        // Sem maxLength: colar "123 456" (com espaço) chega inteiro e é limpo aqui, em vez de ser cortado antes.
        onChange={(e) => onChange(recovery ? e.target.value.toUpperCase().slice(0, 20) : e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode={recovery ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoCapitalize={recovery ? "characters" : undefined}
        spellCheck={false}
        placeholder={recovery ? "XXXXX-XXXXX" : "000000"}
        autoFocus={autoFocus}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={[error && errorId, describedBy].filter(Boolean).join(" ") || undefined}
        className={`tabular h-12 w-full rounded-md border bg-white px-3.5 text-center text-xl font-semibold tracking-[0.3em] text-ink transition placeholder:text-muted/60 placeholder:tracking-[0.3em] hover:border-pine-700/60 focus:border-pine-700 focus:outline-2 focus:outline-offset-0 focus:outline-pine-700/30 ${
          error ? "border-negative" : "border-line"
        }`}
      />
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm text-negative [--icon-accent:currentColor]">
          <Icon name="aviso" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
