import Icon from "./Icon.jsx";

export default function ErrorMessage({ children, id }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-2 rounded-md bg-coral-100 p-3 text-sm text-coral-800 [--icon-accent:currentColor]">
      <Icon name="aviso" className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
