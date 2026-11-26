-- ============================================================================
-- HealthData Brasil — esquema PostgreSQL (compatível com Supabase)
-- Executar em: Supabase SQL Editor  |  psql "$DATABASE_URL" -f db/schema.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS uf (
  codigo_ibge TEXT PRIMARY KEY,
  sigla       TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  regiao      TEXT
);

CREATE TABLE IF NOT EXISTS populacao (
  uf_codigo     TEXT NOT NULL REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  ano           INTEGER NOT NULL,
  populacao     BIGINT NOT NULL CHECK (populacao > 0),
  fonte         TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (uf_codigo, ano)
);

CREATE TABLE IF NOT EXISTS coleta (
  id             SERIAL PRIMARY KEY,
  fonte          TEXT NOT NULL,
  recurso        TEXT NOT NULL,
  parametros     JSONB NOT NULL DEFAULT '{}'::jsonb,
  http_status    INTEGER,
  iniciado_em    TIMESTAMPTZ NOT NULL,
  finalizado_em  TIMESTAMPTZ,
  registros      INTEGER,
  total_fonte    INTEGER,
  fracao_amostral NUMERIC(12, 8),
  status         TEXT NOT NULL,
  erro           TEXT,
  paginas        JSONB
);

CREATE TABLE IF NOT EXISTS indicador (
  id             BIGSERIAL PRIMARY KEY,
  agravo         TEXT NOT NULL,
  uf_codigo      TEXT REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  ano            INTEGER,
  mes            INTEGER CHECK (mes IS NULL OR (mes BETWEEN 1 AND 12)),
  metrica        TEXT NOT NULL, -- notificacoes | obitos | uti | internacoes
  valor_amostra  INTEGER NOT NULL,
  valor_estimado INTEGER NOT NULL,
  unidade        TEXT NOT NULL DEFAULT 'registros',
  coleta_id      INTEGER REFERENCES coleta (id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicador_busca
  ON indicador (agravo, uf_codigo, ano, mes, metrica);

CREATE TABLE IF NOT EXISTS perfil (
  id         BIGSERIAL PRIMARY KEY,
  agravo     TEXT NOT NULL,
  uf_codigo  TEXT REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  dimensao   TEXT NOT NULL, -- classificacao | evolucao | uti | sexo | faixaEtaria ...
  categoria  TEXT NOT NULL,
  contagem   INTEGER NOT NULL,
  proporcao  NUMERIC(9, 6),
  coleta_id  INTEGER REFERENCES coleta (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_perfil_busca ON perfil (agravo, uf_codigo, dimensao);

CREATE TABLE IF NOT EXISTS municipio_amostra (
  id               BIGSERIAL PRIMARY KEY,
  uf_codigo        TEXT REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  municipio_codigo TEXT NOT NULL,
  municipio_nome   TEXT,
  amostra          INTEGER NOT NULL,
  estimado         INTEGER,
  coleta_id        INTEGER REFERENCES coleta (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id        BIGSERIAL PRIMARY KEY,
  acao      TEXT NOT NULL,
  recurso   TEXT,
  status    TEXT NOT NULL,
  detalhe   JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Visão analítica: taxa por 100 mil habitantes usando a população do mesmo ano
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_taxa_uf AS
SELECT
  i.agravo,
  i.uf_codigo,
  u.sigla,
  u.nome,
  u.regiao,
  i.ano,
  i.metrica,
  SUM(i.valor_amostra)  AS valor_amostra,
  SUM(i.valor_estimado) AS valor_estimado,
  p.populacao,
  CASE
    WHEN p.populacao IS NULL OR p.populacao = 0 THEN NULL
    ELSE ROUND(SUM(i.valor_estimado)::numeric * 100000 / p.populacao, 2)
  END AS taxa_100mil
FROM indicador i
JOIN uf u ON u.codigo_ibge = i.uf_codigo
LEFT JOIN populacao p ON p.uf_codigo = i.uf_codigo AND p.ano = i.ano
WHERE i.mes IS NULL
GROUP BY i.agravo, i.uf_codigo, u.sigla, u.nome, u.regiao, i.ano, i.metrica, p.populacao;

COMMENT ON TABLE indicador IS 'Agregados normalizados por UF/ano/mês. valor_estimado = valor_amostra / fração amostral da coleta.';
COMMENT ON TABLE coleta IS 'Trilha de auditoria de cada extração: parâmetros, HTTP, páginas, fração amostral.';
