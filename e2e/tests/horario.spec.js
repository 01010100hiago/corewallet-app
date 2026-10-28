import { test, expect } from "@playwright/test";
import { monthKeyOf, monthLabel } from "@corewallet/shared";
import { newUser, register, addTransaction } from "./helpers.js";

// Hora de Brasília "HH:mm" e "DD/MM/AAAA às HH:mm:ss" de um instante, calculada fora do app (Intl do Node).
const brasilia = (iso, opts) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false, ...opts }).format(new Date(iso));
const hhmm = (iso) => brasilia(iso, { hour: "2-digit", minute: "2-digit" });
const full = (iso) => `${brasilia(iso, { day: "2-digit", month: "2-digit", year: "numeric" })} às ${brasilia(iso, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

for (const [nome, relogio, fuso] of [
  ["adiantado em anos, fuso do Japão", "2031-03-05T22:00:00Z", "Asia/Tokyo"],
  ["atrasado em anos, fuso de Los Angeles", "2019-01-02T04:00:00Z", "America/Los_Angeles"],
  ["um mês à frente, fuso de Lisboa", new Date(Date.now() + 32 * 86_400_000).toISOString(), "Europe/Lisbon"],
]) {
  test(`aparelho com relógio ${nome}: vale sempre a hora do servidor`, async ({ browser }) => {
    const context = await browser.newContext({ locale: "pt-BR", timezoneId: fuso });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(relogio));
    // Prova de que o aparelho está mesmo errado.
    const device = await page.evaluate(() => ({ iso: new Date().toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    expect(device.iso.slice(0, 13)).toBe(new Date(relogio).toISOString().slice(0, 13));
    expect(device.tz).toBe(fuso);

    await register(page, newUser());
    const realNow = Date.now();
    // O mês aberto é o do servidor, não o do relógio do aparelho.
    const month = monthKeyOf(new Date());
    await expect(page.getByRole("region", { name: "Mês" }).getByRole("heading", { level: 2 })).toHaveText(monthLabel(month), { ignoreCase: true });
    await addTransaction(page, { type: "input", value: "10", description: "Hora certa", category: "salario" });

    // "Hoje" vem do servidor.
    await expect(page.getByRole("heading", { name: "Hoje", level: 3 })).toBeVisible();

    // A hora gravada é a do servidor: perto da hora real, nunca perto da do aparelho.
    const list = await (await context.request.get(`/api/transactions?month=${month}`)).json();
    const created = list.transactions.find((t) => t.description === "Hora certa").createdAt;
    expect(Math.abs(new Date(created).getTime() - realNow)).toBeLessThan(120_000);
    expect(new Date(created).getFullYear()).toBe(new Date().getFullYear());

    // E a tela mostra essa hora, em Brasília, com segundos na dica.
    const row = page.getByText("Hora certa", { exact: true }).locator("xpath=ancestor::li[1]");
    const time = row.locator("time");
    await expect(time).toHaveText(hhmm(created));
    await expect(time).toHaveAttribute("title", `Registrado em ${full(created)} (horário de Brasília)`);
    await context.close();
  });
}
