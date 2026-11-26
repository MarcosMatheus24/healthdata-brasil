# HealthData Brasil

Portal educacional de vigilância em saúde que integra a **API de Dados Abertos do Ministério da Saúde** (SRAG 2019–2026) e as **APIs do IBGE** (localidades, malha territorial e população residente) para produzir indicadores agregados por unidade da federação — com proveniência declarada, validação de schema, estados de interface explícitos e exportação em CSV.

> **Projeto Integrador — AV2 · Vigilância em Saúde**
> Os números publicados são **estimativas amostrais** produzidas por este projeto. Não são boletins oficiais e não servem para decisão clínica.

**GitHub:** https://github.com/MarcosMatheus24/healthdata-brasil
**Deploy:** https://healthdata-brasil.vercel.app

## Integrantes

| Integrante | Função |
| --- | --- |
| Marcos Matheus Ribeiro Muniz | Front-end |
| Yuri Chaves Cabral | Back-end |
| Luis Gustavo Dantas Estrela | Banco de dados |
| Gabriel Matos Azevedo | Documentação |

## Entrega AV2 — os cinco elementos

| # | Elemento | Onde está |
| --- | --- | --- |
| 1 | **Front-end** — Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4 | `app/`, `components/` |
| 2 | **Back-end** — Node.js com rotas de servidor (Route Handlers) e camada de serviço | `app/api/`, `lib/` |
| 3 | **Banco de dados** — PostgreSQL (compatível com Supabase): schema, view, seed e leitura opcional | `db/`, `lib/data.ts` |
| 4 | **API** — consumo das APIs oficiais do Ministério da Saúde e do IBGE + API REST própria | `scripts/etl.mjs`, `app/api/` |
| 5 | **Vercel + GitHub** | links no topo do repositório e na página inicial do site |

## Páginas

- `/` — apresentação, indicadores-chave, pipeline, fontes e equipe
- `/dashboard` — filtros por ano, UF e métrica; ranking, série mensal, perfis, tabela e exportação CSV
- `/mapa` — coroplético das 27 UFs com painel lateral, qualidade territorial e hachura para "sem dados"
- `/integracoes` — estado das fontes, console de validação real (7 estados), checklist de conexão e catálogo da API
- `/metodologia` — fórmula dos indicadores, amostragem, inconsistências do arquivo, LGPD, limites, glossário e referências

## API REST própria

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/fontes/status` | Estado das fontes, sem expor segredos |
| GET | `/api/indicadores?ano=&uf=` | Agregados validados por UF e período |
| GET | `/api/territorios?uf=&codigo=` | Códigos IBGE e validação territorial |
| POST | `/api/integracoes/validar` | Ação restrita, executada no servidor (allowlist + timeout de 25 s) |
| GET | `/api/export?ano=&uf=` | CSV agregado com cabeçalho de proveniência |
| GET | `/api/saude` | Verificação de saúde do serviço |

## Como o dado é produzido

1. **Coleta** — `scripts/etl.mjs` faz amostragem sistemática de páginas na API do MS (1 página a cada 56, total de 80 páginas) e consulta as APIs do IBGE.
2. **Normalização** — datas, códigos IBGE de UF/município, categorias de classificação, evolução, UTI, sexo e faixa etária.
3. **Agregação** — por UF, ano, mês e perfil; a estimativa é `observado ÷ fração amostral`.
4. **Publicação** — snapshot JSON versionado (`data/snapshot/`) e seed SQL (`db/seed.sql`).

Recorte atual: **79.192 registros** amostrados de **4.445.192** (1,78%), 27 UFs, 0 erros de página.

### Decisão metodológica: referência temporal

No arquivo de origem, a data de notificação é **anterior** à data de primeiros sintomas em **91,58%** dos registros analisados, com forte concentração em torno de 365 dias (campo deslocado em um ano). Agrupando por `dt_notific`, o ano de 2022 praticamente desaparecia da série. Por isso a referência adotada é **`dt_sin_pri`**, com fallback para `dt_notific` — e a divergência é registrada em `meta.qualidade` de cada coleta.

## Rodando localmente

```bash
npm install
npm run dev          # http://localhost:3000
```

Sem `DATABASE_URL`, o app usa o snapshot versionado (modo declarado na interface).

### Com PostgreSQL

```bash
createdb healthdata
psql -d healthdata -f db/schema.sql
psql -d healthdata -f db/seed.sql
export DATABASE_URL="postgresql://usuario:senha@localhost:5432/healthdata"
npm run dev
```

### Testes

```bash
npm run teste                                        # contra http://localhost:3000
BASE=https://healthdata-brasil.vercel.app npm run teste   # contra produção
```

O script `scripts/testes.mjs` cobre 22 verificações: contrato das rotas, proveniência, ausência de
credenciais na resposta, allowlist anti-SSRF, 404 territorial e cabeçalho do CSV.

### Regenerar os dados oficiais

```bash
node scripts/etl.mjs   # ~50 s; reescreve data/snapshot/*.json e db/seed.sql
```

## Segurança e LGPD

- Nenhum microdado é publicado: o pipeline agrega por UF e mês antes de responder.
- Células com menos de 5 registros na amostra são **suprimidas** (taxa não é exibida).
- Credenciais apenas em variáveis de servidor; o cliente nunca recebe chave ou token.
- A rota de validação usa **allowlist** de recursos, timeout de 25 s, retry único e não devolve o corpo bruto da fonte.
- Sem cookies de analytics, pixels de terceiros ou perfil de navegação.

## Deploy

- **Vercel** — projeto conectado ao repositório; nenhuma variável é obrigatória (modo snapshot).
- **Banco** — para ativar o Postgres em produção, defina `DATABASE_URL` (Supabase: Project Settings → Database → Connection string → URI) e aplique `db/schema.sql` + `db/seed.sql`.

## Licença e créditos

Dados: Ministério da Saúde (Dados Abertos) e IBGE. Código do projeto: uso educacional.
