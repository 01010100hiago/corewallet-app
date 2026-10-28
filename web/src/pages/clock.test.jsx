import { describe, test, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { monthKeyOf, shiftMonth } from "@corewallet/shared";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import Home from "./Home.jsx";
import { dayLabel } from "../lib/days.js";

// O servidor diz que agora são 27/10/2026 10:40 (Brasília). O aparelho está com o relógio muito errado.
const SERVER_NOW = new Date("2026-10-27T13:40:00.000Z").getTime();
const serverAuth = () => fakeAuth({ now: () => SERVER_NOW });
const body = (over = {}) => ({
  balance: 0,
  totalIn: 0,
  totalOut: 0,
  truncated: false,
  categories: [],
  transactions: [],
  month: { key: "2026-10", totalIn: 0, totalOut: 0, count: 0, archivedCount: 0, categories: [] },
  ...over,
});
const tx = (id, createdAt, description) => ({ id, type: "input", value: 100, description, category: "outros", createdAt });

afterEach(() => vi.useRealTimers());

describe("o horário é o do servidor, nunca o do aparelho", () => {
  for (const [nome, deviceClock] of [
    ["adiantado anos", "2031-03-05T10:00:00.000Z"],
    ["atrasado anos", "2019-01-02T10:00:00.000Z"],
    ["um mês à frente", "2026-11-27T13:40:00.000Z"],
    ["um dia à frente", "2026-10-28T13:40:00.000Z"],
  ]) {
    test(`relógio ${nome}: abre o mês do servidor e agrupa em "Hoje" e "Ontem" pelo servidor`, async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(deviceClock));
      vi.spyOn(api, "get").mockResolvedValue({
        data: body({
          transactions: [tx("1", "2026-10-27T13:30:00.000Z", "Feito agora"), tx("2", "2026-10-26T13:30:00.000Z", "Feito ontem"), tx("3", "2026-10-20T13:30:00.000Z", "Faz uma semana")],
        }),
      });
      renderPage(<Home />, { auth: serverAuth() });
      await screen.findByText("Feito agora");
      expect(api.get).toHaveBeenCalledWith("/transactions", { params: { month: "2026-10" } });
      expect(screen.getByRole("heading", { name: "Hoje", level: 3 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Ontem", level: 3 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "20/10/2026", level: 3 })).toBeInTheDocument();
      // O mês aberto é o de hoje: não dá para ir "para a frente".
      expect(screen.getByRole("button", { name: "Próximo mês" })).toBeDisabled();
    });
  }

  test("a hora mostrada em cada lançamento é a do lançamento, em Brasília, não a do aparelho", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-03-05T23:59:00.000Z"));
    vi.spyOn(api, "get").mockResolvedValue({ data: body({ transactions: [tx("1", "2026-10-27T13:07:42.000Z", "Café")] }) });
    renderPage(<Home />, { auth: serverAuth() });
    const row = (await screen.findByText("Café")).closest("li");
    const time = within(row).getByText("10:07");
    expect(time).toHaveAttribute("dateTime", "2026-10-27T13:07:42.000Z");
    // Segundos e fuso no texto de apoio.
    expect(time.getAttribute("title")).toBe("Registrado em 27/10/2026 às 10:07:42 (horário de Brasília)");
  });

  test("virada do dia em Brasília: 01:30 UTC ainda é o dia anterior, mesmo com o aparelho em outro dia", async () => {
    const serverLate = new Date("2026-11-01T01:30:00.000Z").getTime(); // 31/10 22:30 em Brasília
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T12:00:00.000Z"));
    vi.spyOn(api, "get").mockResolvedValue({
      data: body({ month: { key: "2026-10", totalIn: 0, totalOut: 0, count: 1, archivedCount: 0, categories: [] }, transactions: [tx("1", "2026-11-01T01:10:00.000Z", "Quase meia-noite")] }),
    });
    renderPage(<Home />, { auth: fakeAuth({ now: () => serverLate }) });
    await screen.findByText("Quase meia-noite");
    expect(api.get).toHaveBeenCalledWith("/transactions", { params: { month: "2026-10" } });
    expect(screen.getByRole("heading", { name: "Hoje", level: 3 })).toBeInTheDocument();
  });

  test("o mês anterior sai do mês do servidor, não do aparelho", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-03-05T10:00:00.000Z"));
    vi.spyOn(api, "get").mockResolvedValue({ data: body() });
    renderPage(<Home />, { auth: serverAuth() });
    await userEvent.click(await screen.findByRole("button", { name: "Mês anterior" }));
    await vi.waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/transactions", { params: { month: shiftMonth("2026-10", -1) } }));
  });
});

describe("dayLabel", () => {
  test("usa o 'hoje' recebido (hora do servidor) para decidir Hoje e Ontem", () => {
    const today = new Date("2026-10-27T13:40:00.000Z");
    expect(dayLabel("2026-10-27T03:00:00.000Z", today)).toBe("Hoje"); // 00:00 em Brasília
    expect(dayLabel("2026-10-27T02:59:00.000Z", today)).toBe("Ontem"); // 23:59 do dia 26
    expect(dayLabel(new Date("2026-10-27T13:40:00.000Z"), today.getTime())).toBe("Hoje"); // aceita número
    expect(dayLabel("2026-10-25T13:40:00.000Z", today)).toBe("25/10/2026");
  });
  test("o mês atual do servidor, na virada, em Brasília", () => {
    expect(monthKeyOf(new Date("2026-11-01T02:59:59.000Z"))).toBe("2026-10");
    expect(monthKeyOf(new Date("2026-11-01T03:00:00.000Z"))).toBe("2026-11");
  });
});
