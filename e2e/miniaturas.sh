#!/bin/sh
# Gera as miniaturas de docs/img/mini a partir das capturas (precisa do cwebp: brew install webp).
# Cada miniatura é o topo da tela, em proporção fixa, para a grade do README ficar alinhada.
# Uso: e2e/miniaturas.sh   (depois de E2E_SCREENSHOTS=1 npm run test:e2e -- tests/capturas.spec.js)
set -e
cd "$(dirname "$0")/../docs/img"
mkdir -p mini
for nome in inicio analise historico alteracoes categorias conta nova-saida entrar; do
  cwebp -quiet -q 82 -crop 0 0 2200 1375 -resize 600 0 "$nome.png" -o "mini/$nome.webp"
done
cwebp -quiet -q 82 -crop 0 0 780 1688 -resize 280 0 inicio-celular.png -o mini/inicio-celular.webp
# Login com o Turnstile (gerado por e2e/captura-turnstile.mjs, a 1280x800).
cwebp -quiet -q 82 -crop 0 0 1280 800 -resize 600 0 entrar-cloudflare.png -o mini/entrar-cloudflare.webp
ls -l mini
