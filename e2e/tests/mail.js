import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@playwright/test";

// A API dos testes grava os emails neste arquivo (MAIL_OUTBOX_FILE) em vez de enviar.
export const OUTBOX = join(tmpdir(), "corewallet-e2e-emails.jsonl");

export const readMails = () => (existsSync(OUTBOX) ? readFileSync(OUTBOX, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);

// Espera o email para `email` chegar e devolve o link de confirmação (o último, se houver vários).
export async function confirmationLink(email) {
  let mail;
  await expect
    .poll(() => (mail = readMails().filter((m) => m.to === email).at(-1)), { message: `email para ${email}` })
    .toBeTruthy();
  return /(https?:\/\/[^\s]+\/verify-email\?token=[\w-]+)/.exec(mail.text)[1];
}
