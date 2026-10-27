import { test, expect } from "@playwright/test";
import { newUser, register, addTransaction } from "./helpers.js";

test("jornada completa: cadastro, lançamentos, categoria, gráfico, edição, exclusão e mês", async ({ page }) => {
  const user = newUser("Maria");
  await register(page, user);

  await expect(page.getByRole("heading", { name: `Olá, ${user.name}` })).toBeVisible();
  await expect(page.getByTestId("balance")).toContainText("0,00");
  await expect(page.getByText(/Nenhum lançamento em/)).toBeVisible();

  await addTransaction(page, { type: "input", value: "3500", description: "Salário do mês", category: "salario" });
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  await addTransaction(page, { type: "output", value: "120,50", description: "Feira da semana", category: "mercado" });

  await expect(page.getByTestId("balance")).toContainText("3.379,50");
  const month = page.getByRole("region", { name: "Mês" });
  await expect(month.getByText("Receitas do mês").locator("..")).toContainText("3.500,00");
  await expect(month.getByText("Despesas do mês").locator("..")).toContainText("120,50");

  // Despesas por categoria: só saídas, 100% numa categoria.
  const chart = page.getByRole("region", { name: "Despesas por categoria" });
  await expect(chart).toContainText("Supermercado");
  await expect(chart).toContainText("100%");
  await expect(chart).not.toContainText("Salário");

  // Editar a saída: valor e categoria mudam, o saldo acompanha.
  await page.getByRole("link", { name: "Editar Feira da semana" }).click();
  await expect(page.getByRole("heading", { name: "Editar despesa" })).toBeVisible();
  await expect(page.getByLabel("Valor (R$)")).toHaveValue("120,50");
  await page.getByLabel("Valor (R$)").fill("100");
  await page.getByLabel("Categoria", { exact: true }).selectOption("lazer");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Lançamento atualizado.")).toBeVisible();
  await expect(page.getByTestId("balance")).toContainText("3.400,00");
  await expect(chart).toContainText("Lazer");
  await expect(chart).not.toContainText("Supermercado");

  // O aviso não volta ao recarregar a página.
  await page.reload();
  await expect(page.getByTestId("balance")).toContainText("3.400,00");
  await expect(page.getByText("Lançamento atualizado.")).toHaveCount(0);

  // Excluir pede confirmação; cancelar não apaga; confirmar apaga e o saldo acompanha.
  await page.getByRole("button", { name: "Excluir Salário do mês" }).click();
  const confirm = page.getByRole("group", { name: "Excluir Salário do mês" });
  await expect(confirm).toBeFocused();
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Salário do mês", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Excluir Salário do mês" }).click();
  await page.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.getByText("Lançamento excluído.")).toBeVisible();
  await expect(page.getByText(/Ele continua no histórico/)).toBeVisible();
  await expect(page.getByText("Salário do mês", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("balance")).toContainText("100,00");

  // Desfazer devolve o lançamento e o saldo; excluir de novo deixa tudo como antes.
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Lançamento restaurado.")).toBeVisible();
  await expect(page.getByText("Salário do mês", { exact: true })).toBeVisible();
  await expect(page.getByTestId("balance")).toContainText("3.400,00");
  await page.getByRole("button", { name: "Excluir Salário do mês" }).click();
  await page.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.getByText("Salário do mês", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("balance")).toContainText("100,00");

  // O histórico guarda tudo: criado, editado, excluído, restaurado, e a exclusão vigente pode ser restaurada.
  await page.getByRole("button", { name: /Sessão protegida/ }).click();
  await page.getByRole("link", { name: "Histórico" }).click();
  const changes = page.getByRole("region", { name: "Alterações" });
  await expect(changes.getByText("Editado")).toBeVisible();
  await expect(changes.getByText("Valor: R$ 120,50 → R$ 100,00")).toBeVisible();
  await expect(changes.getByText("Categoria: Supermercado → Lazer")).toBeVisible();
  await expect(changes.getByText("Restaurado")).toBeVisible();
  await expect(changes.getByText("Excluído")).toHaveCount(2);
  // O que está excluído aparece em "Excluídos", com Restaurar; o registro de alterações só informa.
  const deleted = page.getByRole("region", { name: "Excluídos" });
  await expect(deleted.getByRole("listitem")).toHaveCount(1);
  await expect(deleted).toContainText("Salário do mês");
  await expect(changes.getByRole("button", { name: /Restaurar/ })).toHaveCount(0);
  await deleted.getByRole("button", { name: "Restaurar Salário do mês" }).click();
  await expect(page.getByText(/voltou para a lista e para o saldo/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Excluídos" })).toHaveCount(0);
  await page.getByRole("link", { name: "Voltar" }).click();
  await expect(page.getByTestId("balance")).toContainText("3.400,00");

  // Mês anterior está vazio, mas o saldo é o geral; o próximo mês não existe.
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByText(/Nenhum lançamento em/)).toBeVisible();
  await expect(page).toHaveURL(/\?mes=\d{4}-\d{2}$/);
  await expect(page.getByTestId("balance")).toContainText("3.400,00");
  await expect(page.getByRole("button", { name: "Próximo mês" })).toBeEnabled();
  await page.getByRole("button", { name: "Ir para o mês atual" }).click();
  await expect(page.getByText("Feira da semana", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Próximo mês" })).toBeDisabled();
});

test("categoria criada na hora do lançamento aparece na lista, no gráfico e no histórico", async ({ page }) => {
  await register(page, newUser());
  await page.getByRole("link", { name: /Nova despesa/ }).click();
  await page.getByLabel("Valor (R$)").fill("80");
  await page.getByLabel("Descrição").fill("Ração do Thor");
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "+ Nova categoria…" });
  await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled();
  const group = page.getByRole("group", { name: "Nova categoria" });
  await group.getByLabel("Nome da nova categoria").fill("a");
  await group.getByRole("button", { name: "Criar categoria" }).click();
  await expect(group.getByRole("alert")).toContainText("mínimo 2");
  await group.getByLabel("Nome da nova categoria").fill("Pets");
  await group.getByRole("button", { name: "Criar categoria" }).click();
  await expect(group).toHaveCount(0);
  await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue(/^[0-9a-f]{24}$/);
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText(/Pets ·/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Despesas por categoria" })).toContainText("Pets");

  // Uma segunda saída reaproveita a categoria (mesmo nome, outra grafia) em vez de duplicar.
  await page.getByRole("link", { name: /Nova despesa/ }).click();
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "+ Nova categoria…" });
  await page.getByLabel("Nome da nova categoria").fill("pets");
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(page.getByLabel("Categoria", { exact: true }).locator("option", { hasText: "Pets" })).toHaveCount(1);

  // O histórico do lançamento mostra o nome da categoria, não o código.
  await page.getByRole("link", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Histórico de Ração do Thor" }).click();
  await expect(page.getByText("Criado")).toBeVisible();
  await expect(page.getByText(/R\$\s80,00 · Pets/)).toBeVisible();
});

test("o saldo e a barra do topo formam uma faixa verde só, com cantos discretos", async ({ page }) => {
  await register(page, newUser());
  const look = await page.evaluate(() => {
    const header = document.querySelector("header");
    const band = header.parentElement;
    const balance = document.querySelector("[data-testid=balance]");
    const css = (el) => getComputedStyle(el);
    return {
      headerBg: css(header).backgroundColor,
      bandBg: css(band).backgroundColor,
      bandRadius: parseFloat(css(band).borderBottomLeftRadius),
      bandContainsBalance: band.contains(balance),
    };
  });
  expect(look.headerBg).toBe("rgba(0, 0, 0, 0)"); // a barra não tem fundo próprio
  expect(look.bandBg).toBe("rgb(14, 77, 60)"); // verde do saldo, também atrás da barra
  expect(look.bandContainsBalance).toBe(true);
  // Cantos discretos: a base da faixa e os cartões são pouco arredondados.
  expect(look.bandRadius).toBeGreaterThanOrEqual(8);
  expect(look.bandRadius).toBeLessThanOrEqual(16);
  const cardRadius = await page.getByRole("region", { name: "Mês" }).evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(cardRadius).toBeGreaterThanOrEqual(4);
  expect(cardRadius).toBeLessThanOrEqual(10);
  // O painel branco da sessão não herda o anel de foco claro da faixa verde: o foco precisa aparecer.
  await page.getByRole("button", { name: /Sessão protegida/ }).click();
  await page.keyboard.press("Tab"); // primeiro item do painel: o link Análise financeira
  const link = page.getByRole("link", { name: "Análise financeira", exact: true });
  await expect(link).toBeFocused();
  // O anel aparece com uma transição de ~150 ms: espera a cor assentar antes de comparar.
  await expect
    .poll(() =>
      link.evaluate((el) => {
        const css = getComputedStyle(el);
        return { style: css.outlineStyle, color: css.outlineColor };
      })
    )
    .toEqual({ style: "solid", color: "rgb(31, 122, 93)" });
  await page.keyboard.press("Escape");
  // A barra é a MESMA em todas as telas: abrir "Nova despesa" ou "Minha conta" não a troca.
  const barOf = (p) =>
    p.evaluate(() => {
      const header = document.querySelector("header");
      const r = header.getBoundingClientRect();
      const eye = header.querySelector("button[aria-pressed]").getBoundingClientRect();
      const logo = header.querySelector("a").getBoundingClientRect();
      return { top: r.top, height: Math.round(r.height), eyeX: Math.round(eye.x), logoX: Math.round(logo.x), bg: getComputedStyle(header.parentElement).backgroundColor };
    });
  const onHome = await barOf(page);
  await page.getByRole("link", { name: /Nova despesa/ }).click();
  await expect(page.getByRole("heading", { name: "Nova despesa" })).toBeVisible();
  const onForm = await barOf(page);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
  const onAccount = await barOf(page);
  expect(onForm).toEqual(onHome);
  expect(onAccount).toEqual(onHome);
  expect(onHome.bg).toBe("rgb(14, 77, 60)");
});

test("arquivar tira da lista mas o saldo e os totais continuam; desarquivar traz de volta", async ({ page }) => {
  await register(page, newUser());
  await addTransaction(page, { type: "input", value: "1000", description: "Receita de teste", category: "salario" });
  await addTransaction(page, { type: "output", value: "300", description: "Aluguel antigo", category: "moradia" });
  await expect(page.getByTestId("balance")).toContainText("700,00");

  await page.getByRole("button", { name: "Arquivar Aluguel antigo" }).click();
  await expect(page.getByText("Lançamento arquivado.")).toBeVisible();
  await expect(page.getByText(/continua contando no saldo/)).toBeVisible();
  await expect(page.getByText("Aluguel antigo", { exact: true })).toHaveCount(0);
  // O saldo, o resumo do mês e as despesas por categoria não mudam.
  await expect(page.getByTestId("balance")).toContainText("700,00");
  const month = page.getByRole("region", { name: "Mês" });
  await expect(month.getByText("Despesas do mês").locator("..")).toContainText("300,00");
  await expect(page.getByRole("region", { name: "Despesas por categoria" })).toContainText("Moradia");
  await expect(month).toContainText("Os totais incluem 1 lançamento arquivado");

  // Aparece em Arquivados, no Histórico.
  await month.getByRole("link", { name: "Ver arquivados" }).click();
  const archived = page.getByRole("region", { name: "Arquivados" });
  await expect(archived).toContainText("Aluguel antigo");
  await expect(archived).toContainText("R$");
  await expect(page.getByRole("region", { name: "Alterações" }).getByText("Arquivado")).toBeVisible();
  await archived.getByRole("button", { name: "Desarquivar Aluguel antigo" }).click();
  await expect(page.getByText(/voltou para a lista/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Arquivados" })).toHaveCount(0);

  await page.getByRole("link", { name: "Voltar" }).click();
  await expect(page.getByTestId("balance")).toContainText("700,00"); // só a Home tem o saldo
  await expect(page.getByText("Aluguel antigo", { exact: true })).toBeVisible();
  await expect(page.getByText(/Os totais incluem/)).toHaveCount(0);

  // Arquivar e usar "Desfazer" também devolve à lista.
  await page.getByRole("button", { name: "Arquivar Aluguel antigo" }).click();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Lançamento desarquivado.")).toBeVisible();
  await expect(page.getByText("Aluguel antigo", { exact: true })).toBeVisible();
});

test("validações do formulário aparecem antes de enviar", async ({ page }) => {
  await register(page, newUser());
  await page.getByRole("link", { name: /Nova despesa/ }).click();
  await page.getByLabel("Valor (R$)").fill("abc");
  await page.getByLabel("Descrição").fill("ab");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(/Valor inválido/)).toBeVisible();
  await expect(page.getByText(/no mínimo 3 caracteres/)).toBeVisible();
  await expect(page).toHaveURL(/\/transaction\/output$/);
});

test("no celular, nenhum valor em dinheiro aparece cortado", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "pt-BR", isMobile: true });
  const page = await context.newPage();
  await register(page, newUser());
  const csrf = (await context.cookies()).find((c) => c.name === "cw_csrf").value;
  // Valores grandes de propósito (entrada de R$ 99.999.999,99, o máximo permitido): fontes mais largas, como as do
  // Linux do CI, não podem cortar nem estourar nada.
  for (const [type, value, description] of [["input", "99999999,99", "Entrada grande"], ["output", "1234567,89", "Saída grande"]]) {
    const res = await context.request.post("/api/transactions", { data: { type, value, description, category: "outros" }, headers: { "X-CSRF-Token": csrf } });
    expect(res.status()).toBe(201);
  }
  await page.reload();
  await expect(page.getByText("Saída grande", { exact: true })).toBeVisible();

  // Nenhum texto com valor pode estar escondido por overflow, e a página não rola para os lados.
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll("dd, [data-testid=balance], li")]
      .filter((el) => /R\$/.test(el.textContent))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim().slice(0, 40))
  );
  expect(cut).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText("Total de receitas").locator("..")).toContainText("99.999.999,99");

  // O total no meio do anel cabe dentro dele (o buraco do anel tem ~60% da largura do desenho).
  const total = await page.getByTestId("chart-total").boundingBox();
  const ring = await page.getByRole("region", { name: "Despesas por categoria" }).locator("svg").first().boundingBox();
  expect(total.width).toBeLessThanOrEqual(ring.width * 0.62);
  await context.close();
});

test("análise financeira: indicadores, gráficos, tabelas e período", async ({ page }) => {
  await register(page, newUser());
  await addTransaction(page, { type: "input", value: "5000", description: "Salário de teste", category: "salario" });
  await addTransaction(page, { type: "output", value: "1200", description: "Aluguel de teste", category: "moradia" });
  await addTransaction(page, { type: "output", value: "300", description: "Compras de teste", category: "mercado" });
  // Arquivado continua valendo na análise.
  await page.getByRole("button", { name: "Arquivar Compras de teste" }).click();
  await expect(page.getByText("Lançamento arquivado.")).toBeVisible();

  await page.getByRole("link", { name: "Ver análise financeira" }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(page.getByRole("heading", { name: "Análise financeira" })).toBeVisible();

  const kpis = page.getByRole("region", { name: "Indicadores do período" });
  const kpi = (label) => kpis.getByText(label, { exact: true }).locator("..");
  await expect(kpi("Receitas")).toContainText("5.000,00");
  await expect(kpi("Despesas")).toContainText("1.500,00");
  await expect(kpi("Resultado")).toContainText("3.500,00");
  await expect(kpi("Taxa de poupança")).toContainText("70,0%");
  await expect(kpi("Despesa média por mês")).toContainText("250,00");
  await expect(kpi("Receitas")).toContainText("sem base de comparação");

  await expect(page.getByRole("img", { name: /Gráfico de barras/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Gráfico de linha do saldo/ })).toBeVisible();

  // Tabelas com os valores exatos (dentro de "Ver valores em tabela").
  const bars = page.getByRole("region", { name: "Receitas e despesas por mês" });
  await bars.getByText("Ver valores em tabela").click();
  await expect(bars.getByRole("row")).toHaveCount(7);
  await expect(bars.getByRole("row").last()).toContainText("5.000,00");
  await expect(bars.getByRole("row").last()).toContainText("3.500,00");

  const expenses = page.getByRole("region", { name: "Despesas por categoria" });
  await expect(expenses.getByRole("row").nth(1)).toContainText("Moradia");
  await expect(expenses.getByRole("row").nth(1)).toContainText("80,0%");
  await expect(expenses.getByRole("row").nth(2)).toContainText("Supermercado");
  await expect(expenses.getByRole("row").nth(2)).toContainText("novo no período");
  await expect(page.getByRole("region", { name: "Receitas por categoria" })).toContainText("Salário");
  const top = page.getByRole("region", { name: "Maiores despesas do período" });
  await expect(top.getByRole("row").nth(1)).toContainText("Aluguel de teste");

  // Período: 12 meses mostra 12 linhas e vai para a URL.
  await page.getByRole("button", { name: "12 meses" }).click();
  await expect(page).toHaveURL(/periodo=12/);
  await expect(page.getByText(/últimos 12 meses/)).toBeVisible();
  const bars12 = page.getByRole("region", { name: "Receitas e despesas por mês" });
  await bars12.getByText("Ver valores em tabela").click();
  await expect(bars12.getByRole("row")).toHaveCount(13);
  await expect(page.getByRole("button", { name: "12 meses" })).toHaveAttribute("aria-pressed", "true");

  // O menu da sessão também leva à análise.
  await page.goto("/");
  await page.getByRole("button", { name: /Sessão protegida/ }).click();
  await page.getByRole("link", { name: "Análise financeira", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis$/);
});

test("análise financeira no celular: nada estoura a largura nem corta valores", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "pt-BR", isMobile: true });
  const page = await context.newPage();
  await register(page, newUser());
  const csrf = (await context.cookies()).find((c) => c.name === "cw_csrf").value;
  for (const [type, value, description, category] of [["input", "99999999,99", "Receita enorme", "salario"], ["output", "12345678,90", "Despesa enorme", "moradia"], ["output", "1,50", "Café", "outros"]]) {
    const res = await context.request.post("/api/transactions", { data: { type, value, description, category }, headers: { "X-CSRF-Token": csrf } });
    expect(res.status()).toBe(201);
  }
  await page.goto("/analysis");
  await expect(page.getByRole("region", { name: "Indicadores do período" })).toBeVisible();

  const cut = await page.evaluate(() =>
    [...document.querySelectorAll("dd")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim().slice(0, 30))
  );
  expect(cut).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Os gráficos cabem na tela.
  for (const svg of await page.locator("svg[role=img]").all()) {
    const box = await svg.boundingBox();
    expect(box.width).toBeLessThanOrEqual(360);
  }
  await expect(page.getByRole("region", { name: "Indicadores do período" })).toContainText("99.999.999,99");
  await context.close();
});
