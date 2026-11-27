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

## v2.1 — multiagravo (nov/2026)
- Catálogo em `lib/agravos.ts` (srag, dengue, zika, febreamarela) com definição de caso explícita.
- Snapshots por doença em `data/snapshot/agravos/*.json` (estado: coletado | pendente | erro).
  SRAG continua em `meta.json` + `srag.json` (formato original preservado).
- Núcleo de coleta sem dependências de Node em `scripts/coleta-nucleo.mjs` (roda no ETL e no navegador).

### Comportamento da API do MS verificado em 27/11/2026
- **`offset` é índice de REGISTRO, não de página** (contrário à documentação): `offset=1&limit=1000`
  repete 999 registros de `offset=0`. Quando o SRAG deste projeto foi coletado, a rota se
  comportava como página (o snapshot mostra anos espalhados nos mesmos offsets). O ETL agora
  detecta o modo a cada coleta (`detectarModoOffset`).
- `campos=` faz o servidor estourar o tempo (502 Proxy Error) em várias rotas: não usar.
- Zika e Dengue não informam `total_registros`: universo medido por busca binária com `limit=1`.
- Zika aceita `nu_ano` (rápido). Dengue devolve 502 com `nu_ano`.
- Latência cresce com o offset (~7 s por milhão de registros); o proxy corta em 60 s.
  Dengue começa em 2000: os registros de 2019+ ficam fora do alcance por offset.
- Febre amarela (humanos): 2.913 registros, 1994–mai/2026, território = local provável de infecção.
- Campos vazios do SINAN chegam como o texto "nan".
- Duplicatas idênticas na fonte: ~0,1–0,2% por ano no Zika (registradas em `estratos[].duplicados`).
