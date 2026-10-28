import { appendFile } from "node:fs/promises";
import nodemailer from "nodemailer";

// Envio de email. Sem configuração, `enabled` é false e nada é enviado. O modo "file" (só para
// desenvolver e testar) grava cada mensagem numa linha de um arquivo, em vez de mandar de verdade.
export function createMailer(config) {
  if (!config) {
    return {
      enabled: false,
      async send() {
        throw new Error("Envio de email não configurado");
      },
    };
  }
  if (config.transport === "file") {
    return {
      enabled: true,
      async send({ to, subject, text }) {
        await appendFile(config.file, `${JSON.stringify({ to, subject, text, at: new Date().toISOString() })}\n`);
      },
    };
  }
  const transporter = nodemailer.createTransport(config.url);
  return {
    enabled: true,
    async send({ to, subject, text, html }) {
      await transporter.sendMail({ from: config.from, to, subject, text, html });
    },
  };
}
