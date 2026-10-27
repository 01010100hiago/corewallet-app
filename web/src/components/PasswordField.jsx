import { useState } from "react";
import Icon from "./Icon.jsx";
import Input from "./Input.jsx";

// Campo de senha com botão de mostrar e ocultar.
export default function PasswordField({ noun = "senha", ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...props}
      type={shown ? "text" : "password"}
      prefix={<Icon name="cadeado" className="size-5" />}
      right={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={`${shown ? "Ocultar" : "Mostrar"} ${noun}`}
          className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-mint-100 hover:text-pine-900"
        >
          <Icon name={shown ? "ocultar" : "mostrar"} className="size-5" />
        </button>
      }
    />
  );
}
