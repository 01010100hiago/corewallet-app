import { describe, test, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "../lib/api.js";
import { renderPage, fakeAuth } from "../test/render.jsx";
import Devices from "./Devices.jsx";

const phone = { id: "b", current: false, device: { label: "Safari no iOS", kind: "phone" }, ip: "189.12.•.•", startedAt: "2026-10-26T10:00:00.000Z", lastUsedAt: "2026-10-27T09:00:00.000Z", expiresAt: "2026-11-25T10:00:00.000Z" };
const mac = { id: "a", current: true, device: { label: "Chrome no macOS", kind: "computer" }, ip: "10.0.•.•", startedAt: "2026-10-27T08:00:00.000Z", lastUsedAt: "2026-10-27T14:00:00.000Z", expiresAt: "2026-11-26T08:00:00.000Z" };

describe("Dispositivos conectados", () => {
  test("lista as sessões, marca a atual e só oferece encerrar as outras", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [mac, phone] });
    renderPage(<Devices />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Este dispositivo")).toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button")).toBeNull();
    expect(within(rows[1]).getByText(/IP 189\.12\.•\.•/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Encerrar sessão em Safari no iOS" })).toBeInTheDocument();
  });

  test("acesso do próprio computador não mostra IP mascarado sem sentido", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [{ ...mac, ip: "deste computador" }] });
    renderPage(<Devices />);
    expect(await screen.findByText(/acesso deste computador/)).toBeInTheDocument();
    expect(screen.queryByText(/IP /)).toBeNull();
  });

  test("encerrar um aparelho chama a API e tira da lista", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [mac, phone] });
    const del = vi.spyOn(api, "delete").mockResolvedValue({ status: 204 });
    renderPage(<Devices />);
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar sessão em Safari no iOS" }));
    expect(del).toHaveBeenCalledWith("/auth/sessions/b");
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Safari no iOS")).toBeNull();
  });

  test("se encerrar falhar, a sessão continua na lista e o erro aparece", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [mac, phone] });
    vi.spyOn(api, "delete").mockRejectedValue(new Error("rede"));
    renderPage(<Devices />);
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar sessão em Safari no iOS" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/conectar/);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("falha ao carregar mostra o erro e deixa tentar de novo", async () => {
    const get = vi.spyOn(api, "get").mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce({ data: [mac] });
    renderPage(<Devices />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Este dispositivo")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("sair de todos os aparelhos leva ao login", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [mac, phone] });
    const logoutAll = vi.fn().mockResolvedValue();
    renderPage(<Devices />, { auth: fakeAuth({ logoutAll }) });
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar todas as sessões" }));
    expect(logoutAll).toHaveBeenCalled();
    expect(await screen.findByText("página de login")).toBeInTheDocument();
  });

  test("se sair de todos falhar, continua na tela com o aviso", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [mac] });
    renderPage(<Devices />, { auth: fakeAuth({ logoutAll: vi.fn().mockRejectedValue(new Error("rede")) }) });
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar todas as sessões" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("página de login")).toBeNull();
  });
});
