import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, codeAt, generateSecret, otpauthUri, STEP_SECONDS, stepOf, verifyTotp } from "../src/lib/totp.js";
import { createSecretBox } from "../src/lib/secretBox.js";

// Segredo de teste do RFC 6238 ("12345678901234567890" em ASCII).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  test("base32 vai e volta, com ou sem espaços e traços", () => {
    const bytes = Buffer.from("segredo-aleatorio-123");
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
    assert.deepEqual(base32Decode("jbsw y3dp-ehpk 3pxp"), base32Decode("JBSWY3DPEHPK3PXP"));
    assert.throws(() => base32Decode("1!"), /Base32/);
  });

  test("bate com os valores oficiais do RFC 6238 (SHA-1, 6 dígitos = últimos 6 de cada valor de 8)", () => {
    // Valores do Apêndice B do RFC: tempo (s) -> código de 8 dígitos; os de 6 são os 6 últimos.
    const vectors = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [seconds, eight] of vectors) assert.equal(codeAt(RFC_SECRET, seconds * 1000), eight.slice(2), `t=${seconds}`);
  });

  test("gera segredos aleatórios de 160 bits (32 caracteres base32)", () => {
    const a = generateSecret();
    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.notEqual(a, generateSecret());
  });

  test("aceita o passo anterior e o seguinte, e recusa os mais distantes", () => {
    const t = 1_700_000_000_000;
    const at = (delta) => codeAt(RFC_SECRET, t + delta * STEP_SECONDS * 1000);
    assert.equal(verifyTotp(RFC_SECRET, at(0), { nowMs: t }), stepOf(t));
    assert.equal(verifyTotp(RFC_SECRET, at(-1), { nowMs: t }), stepOf(t) - 1);
    assert.equal(verifyTotp(RFC_SECRET, at(1), { nowMs: t }), stepOf(t) + 1);
    assert.equal(verifyTotp(RFC_SECRET, at(-2), { nowMs: t }), null);
    assert.equal(verifyTotp(RFC_SECRET, at(2), { nowMs: t }), null);
  });

  test("recusa o que não são exatamente 6 dígitos", () => {
    const t = 1_700_000_000_000;
    const good = codeAt(RFC_SECRET, t);
    for (const bad of [undefined, null, 123456, "", " " + good, good + " ", "12345", "1234567", "abcdef", "١٢٣٤٥٦", { toString: () => good }]) {
      assert.equal(verifyTotp(RFC_SECRET, bad, { nowMs: t }), null, String(bad));
    }
  });

  test("o link otpauth traz segredo, emissor e parâmetros que os aplicativos esperam", () => {
    const uri = new URL(otpauthUri({ secret: RFC_SECRET, account: "ana@exemplo.com", issuer: "CoreWallet" }));
    assert.equal(uri.protocol, "otpauth:");
    assert.equal(uri.host, "totp");
    assert.equal(decodeURIComponent(uri.pathname), "/CoreWallet:ana@exemplo.com");
    assert.equal(uri.searchParams.get("secret"), RFC_SECRET);
    assert.equal(uri.searchParams.get("issuer"), "CoreWallet");
    assert.equal(uri.searchParams.get("digits"), "6");
    assert.equal(uri.searchParams.get("period"), "30");
    assert.equal(uri.searchParams.get("algorithm"), "SHA1");
  });
});

describe("caixa de segredo (AES-256-GCM)", () => {
  const box = createSecretBox("segredo-de-teste-com-mais-de-32-caracteres!!");

  test("cifra e decifra, com IV novo a cada vez e sem o texto às claras", () => {
    const a = box.seal("JBSWY3DPEHPK3PXP");
    const b = box.seal("JBSWY3DPEHPK3PXP");
    assert.notEqual(a, b);
    assert.ok(!a.includes("JBSWY3DPEHPK3PXP"));
    assert.equal(box.open(a), "JBSWY3DPEHPK3PXP");
    assert.equal(box.open(b), "JBSWY3DPEHPK3PXP");
  });

  test("valor adulterado, de outra chave ou malformado não abre (null, nunca lixo)", () => {
    const sealed = box.seal("segredo");
    const [v, iv, tag, data] = sealed.split(".");
    const flip = (text) => (text[0] === "A" ? "B" : "A") + text.slice(1);
    assert.equal(box.open([v, iv, tag, flip(data)].join(".")), null);
    assert.equal(box.open([v, iv, flip(tag), data].join(".")), null);
    assert.equal(box.open([v, flip(iv), tag, data].join(".")), null);
    assert.equal(createSecretBox("outra-chave-com-mais-de-32-caracteres-aaaa").open(sealed), null);
    for (const bad of ["", "abc", "v2.a.b.c", null, undefined, 5]) assert.equal(box.open(bad), null);
  });
});
