-- ============================================================================
-- HealthData Brasil — esquema PostgreSQL para o Supabase (v3)
--
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run.
-- É idempotente: pode ser executado de novo (e sobre o schema antigo) sem perder dados.
-- Depois de criar as tabelas, envie os dados com:  npm run supabase
--
-- Modelo (o front lê exatamente estas tabelas, ver lib/data.ts):
--   agravo ............ catálogo das doenças + definição de caso
--   uf / municipio .... territórios (IBGE)
--   populacao ......... população residente por UF e ano (IBGE) → denominador das taxas
--   coleta ............ 1 linha por extração da API (proveniência, metodologia, qualidade)
--   indicador ......... notificações e óbitos por doença × UF × ano × mês (amostra e estimado)
--   perfil ............ distribuição por classificação, evolução, sexo, faixa etária…
--   municipio_amostra . municípios com mais casos na coleta
--   auditoria ......... log de ações (somente servidor)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catálogo de doenças (agravos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agravo (
  id              TEXT PRIMARY KEY CHECK (id = upper(id)),   -- SRAG | DENGUE | ZIKA | FEBREAMARELA
  nome            TEXT NOT NULL,
  nome_completo   TEXT NOT NULL,
  definicao_caso  TEXT NOT NULL,                              -- o que conta como "caso"
  sistema         TEXT NOT NULL,                              -- SIVEP-Gripe, SINAN…
  recurso         TEXT NOT NULL,                              -- rota na API do Ministério da Saúde
  metodo_coleta   TEXT NOT NULL CHECK (metodo_coleta IN ('amostragem', 'censo')),
  ano_inicial     INTEGER NOT NULL,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO agravo (id, nome, nome_completo, definicao_caso, sistema, recurso, metodo_coleta, ano_inicial) VALUES
  ('SRAG', 'SRAG', 'Síndrome respiratória aguda grave',
   $$Toda notificação de SRAG hospitalizada no SIVEP-Gripe, independentemente do agente etiológico.$$,
   'SIVEP-Gripe', '/vigilancia-e-meio-ambiente/srag-2019-2026', 'amostragem', 2019),
  ('DENGUE', 'Dengue', 'Dengue',
   $$Notificações do SINAN Dengue excluindo as descartadas (classi_fin = 5) — caso provável.$$,
   'SINAN Dengue', '/arboviroses/dengue', 'amostragem', 2019),
  ('ZIKA', 'Zika', 'Zika vírus',
   $$Notificações do SINAN Zika excluindo as descartadas (classi_fin = 2) — caso provável.$$,
   'SINAN Zika', '/arboviroses/zikavirus', 'censo', 2019),
  ('FEBREAMARELA', 'Febre amarela', 'Febre amarela (casos humanos)',
   $$Casos humanos confirmados; a UF é a do local provável de infecção (uf_lpi), não a de residência.$$,
   'Vigilância da febre amarela (SVSA)', '/arboviroses/febre-amarela-humanos-primatas-nao-humanos', 'censo', 2001)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome, nome_completo = EXCLUDED.nome_completo, definicao_caso = EXCLUDED.definicao_caso,
  sistema = EXCLUDED.sistema, recurso = EXCLUDED.recurso, metodo_coleta = EXCLUDED.metodo_coleta,
  ano_inicial = EXCLUDED.ano_inicial, atualizado_em = NOW();

-- ---------------------------------------------------------------------------
-- 2. Territórios e população (IBGE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uf (
  codigo_ibge TEXT PRIMARY KEY,
  sigla       TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  regiao      TEXT
);

CREATE TABLE IF NOT EXISTS municipio (
  codigo_ibge TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  uf_codigo   TEXT NOT NULL REFERENCES uf (codigo_ibge) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_municipio_uf ON municipio (uf_codigo);

CREATE TABLE IF NOT EXISTS populacao (
  uf_codigo     TEXT NOT NULL REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  ano           INTEGER NOT NULL,
  populacao     BIGINT NOT NULL CHECK (populacao > 0),
  fonte         TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (uf_codigo, ano)
);

-- ---------------------------------------------------------------------------
-- 3. Coletas (proveniência de cada extração da API)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coleta (
  id              SERIAL PRIMARY KEY,
  agravo          TEXT NOT NULL DEFAULT 'SRAG',
  fonte           TEXT NOT NULL,
  recurso         TEXT NOT NULL,
  parametros      JSONB NOT NULL DEFAULT '{}'::jsonb,
  http_status     INTEGER,
  iniciado_em     TIMESTAMPTZ NOT NULL,
  finalizado_em   TIMESTAMPTZ,
  registros       INTEGER,
  total_fonte     INTEGER,
  fracao_amostral NUMERIC(12, 8),
  status          TEXT NOT NULL,
  erro            TEXT,
  paginas         JSONB
);

-- colunas novas (bancos criados com a versão anterior ganham aqui)
ALTER TABLE coleta ADD COLUMN IF NOT EXISTS agravo           TEXT NOT NULL DEFAULT 'SRAG';
ALTER TABLE coleta ADD COLUMN IF NOT EXISTS origem_coleta    TEXT;    -- etl | navegador
ALTER TABLE coleta ADD COLUMN IF NOT EXISTS registros_lidos  INTEGER; -- lidos da API antes da definição de caso
ALTER TABLE coleta ADD COLUMN IF NOT EXISTS metodologia      JSONB;   -- tipo de coleta, estratos, fração amostral…
ALTER TABLE coleta ADD COLUMN IF NOT EXISTS qualidade        JSONB;   -- inconsistências encontradas na fonte
ALTER TABLE coleta ADD COLUMN IF NOT EXISTS campos_fonte     JSONB;   -- campos que a API devolveu (auditoria de schema)
ALTER TABLE coleta ADD COLUMN IF NOT EXISTS enviado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_coleta_agravo ON coleta (agravo, id DESC);

-- ---------------------------------------------------------------------------
-- 4. Indicadores: a avaliação de cada doença por UF / ano / mês
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicador (
  id             BIGSERIAL PRIMARY KEY,
  agravo         TEXT NOT NULL,
  uf_codigo      TEXT REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  ano            INTEGER,
  mes            INTEGER CHECK (mes IS NULL OR (mes BETWEEN 1 AND 12)),
  metrica        TEXT NOT NULL CHECK (metrica IN ('notificacoes', 'obitos', 'uti', 'internacoes')),
  valor_amostra  INTEGER NOT NULL CHECK (valor_amostra >= 0),
  valor_estimado INTEGER NOT NULL CHECK (valor_estimado >= 0),
  unidade        TEXT NOT NULL DEFAULT 'registros',
  coleta_id      INTEGER REFERENCES coleta (id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_indicador_busca ON indicador (agravo, uf_codigo, ano, mes, metrica);
-- impede linhas repetidas (ano/mês nulos contam como 0 só para a unicidade)
CREATE UNIQUE INDEX IF NOT EXISTS uq_indicador
  ON indicador (agravo, uf_codigo, COALESCE(ano, 0), COALESCE(mes, 0), metrica);

CREATE TABLE IF NOT EXISTS perfil (
  id         BIGSERIAL PRIMARY KEY,
  agravo     TEXT NOT NULL,
  uf_codigo  TEXT REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  dimensao   TEXT NOT NULL,           -- classificacao | evolucao | uti | sexo | faixaEtaria …
  categoria  TEXT NOT NULL,
  contagem   INTEGER NOT NULL CHECK (contagem >= 0),
  proporcao  NUMERIC(9, 6),
  coleta_id  INTEGER REFERENCES coleta (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_perfil_busca ON perfil (agravo, uf_codigo, dimensao);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfil ON perfil (agravo, uf_codigo, dimensao, categoria);

CREATE TABLE IF NOT EXISTS municipio_amostra (
  id               BIGSERIAL PRIMARY KEY,
  agravo           TEXT NOT NULL DEFAULT 'SRAG',
  uf_codigo        TEXT REFERENCES uf (codigo_ibge) ON DELETE CASCADE,
  municipio_codigo TEXT NOT NULL,
  municipio_nome   TEXT,
  amostra          INTEGER NOT NULL CHECK (amostra >= 0),
  estimado         INTEGER,
  coleta_id        INTEGER REFERENCES coleta (id) ON DELETE SET NULL
);
ALTER TABLE municipio_amostra ADD COLUMN IF NOT EXISTS agravo TEXT NOT NULL DEFAULT 'SRAG';
CREATE UNIQUE INDEX IF NOT EXISTS uq_municipio_amostra ON municipio_amostra (agravo, uf_codigo, municipio_codigo);

CREATE TABLE IF NOT EXISTS auditoria (
  id        BIGSERIAL PRIMARY KEY,
  acao      TEXT NOT NULL,
  recurso   TEXT,
  status    TEXT NOT NULL,
  detalhe   JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- liga cada tabela ao catálogo de doenças (só se a chave ainda não existir)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['coleta', 'indicador', 'perfil', 'municipio_amostra'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || t || '_agravo') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (agravo) REFERENCES agravo (id)', t, 'fk_' || t || '_agravo');
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Visões analíticas
-- ---------------------------------------------------------------------------
-- Taxa por 100 mil habitantes usando a população do mesmo ano
CREATE OR REPLACE VIEW vw_taxa_uf WITH (security_invoker = true) AS
SELECT
  i.agravo, i.uf_codigo, u.sigla, u.nome, u.regiao, i.ano, i.metrica,
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

-- Última coleta de cada doença (estado da base)
CREATE OR REPLACE VIEW vw_ultima_coleta WITH (security_invoker = true) AS
SELECT DISTINCT ON (c.agravo)
  c.agravo, a.nome, c.id AS coleta_id, c.status, c.origem_coleta, c.registros, c.total_fonte,
  c.fracao_amostral, c.finalizado_em, c.enviado_em
FROM coleta c
JOIN agravo a ON a.id = c.agravo
ORDER BY c.agravo, c.id DESC;

COMMENT ON TABLE agravo    IS 'Catálogo das doenças monitoradas e da definição de caso de cada uma.';
COMMENT ON TABLE indicador IS 'Agregados por doença × UF × ano × mês. valor_estimado = valor_amostra ÷ fração amostral da coleta (igual ao observado em coletas censitárias).';
COMMENT ON TABLE coleta    IS 'Trilha de proveniência de cada extração da API: parâmetros, HTTP, metodologia, qualidade e campos recebidos.';
COMMENT ON TABLE perfil    IS 'Distribuição de casos por dimensão (classificação, evolução, sexo, faixa etária…).';

-- ---------------------------------------------------------------------------
-- 6. Segurança (RLS) — o Supabase expõe o schema public pela chave anon
-- ---------------------------------------------------------------------------
-- Leitura pública só de agregados; ninguém escreve pela chave anon/authenticated.
-- O envio dos dados usa a conexão Postgres do servidor (DATABASE_URL), que ignora RLS.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agravo', 'uf', 'municipio', 'populacao', 'coleta', 'indicador', 'perfil', 'municipio_amostra', 'auditoria'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['agravo', 'uf', 'municipio', 'populacao', 'coleta', 'indicador', 'perfil', 'municipio_amostra'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'leitura_publica') THEN
      EXECUTE format('CREATE POLICY leitura_publica ON %I FOR SELECT USING (true)', t);
    END IF;
  END LOOP;

  -- só em Supabase (os papéis anon/authenticated não existem num Postgres comum)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON agravo, uf, municipio, populacao, coleta, indicador, perfil, municipio_amostra, auditoria FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON auditoria FROM anon, authenticated';
  END IF;
END $$;
-- auditoria: RLS ligado e nenhuma política = inacessível pela API pública.
