#!/usr/bin/env bash
# Põe ?v=<versão> em todos os arquivos locais que o navegador baixa
# (index.html -> main.js e base.css; cada import relativo dos .js).
# Assim, a cada publicação o navegador baixa os arquivos novos em vez de
# usar a cópia guardada (o GitHub Pages manda guardar por 10 minutos e
# misturar arquivos velhos com novos quebra o app).
# Uso: scripts/carimbar-versao.sh <pasta-do-site> <versao>
set -euo pipefail
pasta="$1"
versao="$2"

sed -i -E "s#(src=\"|href=\")(src/[^\"?]+\.(js|css))\"#\1\2?v=${versao}\"#g" "$pasta/index.html"

find "$pasta/src" -name '*.js' -print0 | xargs -0 sed -i -E \
  "s#(from[[:space:]]*['\"])(\.{1,2}/[^'\"?]+\.js)(['\"])#\1\2?v=${versao}\3#g; s#(import\([[:space:]]*['\"])(\.{1,2}/[^'\"?]+\.js)(['\"])#\1\2?v=${versao}\3#g"
