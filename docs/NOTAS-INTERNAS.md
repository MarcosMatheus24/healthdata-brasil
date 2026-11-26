# Notas internas do desenvolvimento (contexto)

## Enunciado (AV2)
Link: https://senaiba.my.canva.site/av2 (Canva, conteúdo em iframe `canvcode.com`).
Entrega: 1 Front (Bootstrap/React/Next) · 2 Back (NodeJS/express/mysql2) · 3 Banco (PostgreSQL/Supabase)
· 4 API (Google, Meteo, etc.) · 5 Vercel + GitHub (links) · nomes dos integrantes.

Briefing "HealthData Brasil": portal educacional de vigilância em saúde; fluxo
Front-end → API REST própria → serviço servidor → fonte oficial → normalização → banco/cache →
indicadores → dashboard/mapa; 20 RF e 15 RNF; 7 estados de interface (não configurada, carregando,
conectado, não autorizado, sem dados, erro de rede, resposta inválida); checklist de conexão de 10
itens; endpoints próprios sugeridos: GET /api/fontes/status, GET /api/indicadores,
GET /api/territorios, POST /api/integracoes/validar; exportação CSV com proveniência; LGPD.

## Integrantes
- Marcos Matheus Ribeiro Muniz — Front-end
- Yuri Chaves Cabral — Back-end
- Luis Gustavo Dantas Estrela — Banco de dados
- Gabriel Matos Azevedo — Documentação

## APIs oficiais (testadas)
- MS Dados Abertos: base `https://apidadosabertos.saude.gov.br` (SEM prefixo /v1 nos recursos;
  o Swagger fica em /v1/ mas os endpoints são na raiz).
  - `GET /vigilancia-e-meio-ambiente/srag-2019-2026?limit=1000&offset=PAGINA` → `{total_registros, srag_2019_2026[]}`
  - `offset` = ÍNDICE DE PÁGINA (não de registro). Filtros `anomes_notific`, `dt_notific` retornam vazio;
    `sg_uf_not` e `co_mun_not` funcionam.
  - `GET /arboviroses/dengue` (filtro nu_ano quebrado → 502), `/arboviroses/chikungunya?nu_ano=` (lento),
    `/assistencia-a-saude/cnes-leitos`, `/assistencia-a-saude/hospitais-e-leitos?uf=`.
- IBGE: `https://servicodados.ibge.gov.br/api/v1/localidades/estados`,
  `/api/v1/localidades/municipios?view=nivelado`, `/api/v3/agregados/6579/periodos/{ano}/variaveis/9324?localidades=N3[all]`,
  malha `/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=UF`.
- e-SUS Notifica: restrito (autorização, IP liberado). Manual:
  https://datasus.saude.gov.br/wp-content/uploads/2022/02/Manual-de-Utilizacao-da-API-e-Sus-Notifica.pdf

## Achados de qualidade
- O arquivo SRAG traz `dt_notific` anterior a `dt_sin_pri` em ~90% dos registros (divergência
  sobretudo de ~1 ano). Por isso a referência temporal adotada é `dt_sin_pri`.
- Com `dt_notific` o ano de 2022 desaparecia da série; com `dt_sin_pri` a série fica plausível
  (pico 2020–2021, queda 2022–2025).

## ETL
`scripts/etl.mjs` — amostragem sistemática de 80 páginas de 1.000 registros (passo ≈56) sobre
4.445.192 registros → 79.192 coletados (1,78%). Gera `data/snapshot/*.json` e `db/seed.sql`.

## Estado do build
- Stack: Next.js 15 + React 19 + Tailwind v4 + TypeScript; Postgres (pg) opcional via DATABASE_URL.
- Páginas: /, /dashboard, /mapa, /integracoes, /metodologia.
- API: /api/fontes/status, /api/indicadores, /api/territorios, /api/integracoes/validar, /api/export, /api/saude.
- GitHub: conta `MarcosMatheus24` (gh autenticado). Vercel: time `marcosmatheus24s-projects` (hobby),
  MCP disponível (create_git_project).
