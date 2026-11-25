#!/usr/bin/env bash
# Roda as migrações e os testes de acesso num Postgres vazio (local ou CI).
# Uso: DATABASE_URL=postgres://usuario:senha@localhost:5432/banco supabase/tests/rodar-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?Defina DATABASE_URL apontando para um banco Postgres VAZIO de teste}"
psql_() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
psql_ -f tests/simular-supabase.sql
for arquivo in migrations/*.sql; do
  echo "Aplicando $arquivo"
  psql_ -f "$arquivo"
  psql_ -f "$arquivo"   # segunda vez: a migração precisa poder rodar de novo
done
for teste in tests/rls.sql tests/catalogos.sql tests/tarefas.sql; do
  echo "Rodando $teste"
  psql_ -f "$teste"
done
