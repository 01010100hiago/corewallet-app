import { describe, test, expect } from "vitest";
import { inBrasilia } from "./brasilia.js";
import { dayLabel } from "./days.js";
import { centsToInput } from "./money.js";

describe("horário de Brasília", () => {
  test("converte para UTC-3 independente do fuso do aparelho", () => {
    expect(inBrasilia("2026-11-01T01:30:00Z").format("DD/MM/YYYY HH:mm")).toBe("31/10/2026 22:30");
    expect(inBrasilia("2026-11-01T03:00:00Z").format("DD/MM/YYYY HH:mm")).toBe("01/11/2026 00:00");
    expect(inBrasilia(new Date("2026-03-10T14:05:00Z")).format("HH:mm")).toBe("11:05");
  });

  test("dayLabel agrupa pelo dia de Brasília: 01:30 UTC ainda é o dia anterior", () => {
    const today = new Date("2026-10-31T20:00:00Z"); // 17:00 de 31/10 em Brasília
    expect(dayLabel("2026-11-01T01:30:00Z", today)).toBe("Hoje"); // 22:30 de 31/10
    expect(dayLabel("2026-10-31T15:00:00Z", today)).toBe("Hoje");
    expect(dayLabel("2026-10-30T15:00:00Z", today)).toBe("Ontem");
    expect(dayLabel("2026-10-29T15:00:00Z", today)).toBe("29/10/2026");
    // Já é dia 1º em Brasília, mesmo sendo 02:59 UTC do dia 1º "ainda" ser dia 31 lá:
    expect(dayLabel("2026-11-01T02:59:00Z", new Date("2026-11-01T03:00:00Z"))).toBe("Ontem");
  });
});

describe("centsToInput", () => {
  test("centavos viram o texto do campo, sempre com 2 casas e vírgula", () => {
    expect(centsToInput(4590)).toBe("45,90");
    expect(centsToInput(5)).toBe("0,05");
    expect(centsToInput(1)).toBe("0,01");
    expect(centsToInput(100)).toBe("1,00");
    expect(centsToInput(123456)).toBe("1234,56");
    expect(centsToInput(10000000000)).toBe("100000000,00");
  });
});
