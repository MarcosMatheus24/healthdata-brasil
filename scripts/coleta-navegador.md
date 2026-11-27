# Coleta pelo navegador

Use quando a máquina que roda o ETL **não alcança** `apidadosabertos.saude.gov.br`
(rede corporativa, sandbox, proxy). O navegador de quem acessa o site alcança, e o
código de coleta é o mesmo do ETL (`scripts/coleta-nucleo.mjs`).

Foi assim que os dados de **Zika** e **Febre amarela** deste repositório foram coletados
em 27/11/2026.

## Passo a passo

1. Abra no navegador `https://apidadosabertos.saude.gov.br/arboviroses/zikavirus?limit=1`
   (a página precisa estar nessa origem para o `fetch` não esbarrar em CORS).
2. Abra o console (F12) e cole o conteúdo de `scripts/coleta-nucleo.mjs` **sem** as palavras
   `export` (ou use um bundler para gerar um script único).
3. Rode a coleta e copie o resultado:

```js
const B = location.origin;
const saida = {};
// Zika: um estrato por ano, censo
{
  const c = new Contagem(); const estratos = [];
  for (let ano = 2019; ano <= new Date().getFullYear(); ano++) {
    const r = await coletarEstrato({ base: B, rota: "/arboviroses/zikavirus", qs: `nu_ano=${ano}`, censoAte: 80, concorrencia: 3, normalizar: normalizarZika });
    for (const n of r.registros) c.add(n, r.peso);
    estratos.push({ rotulo: `nu_ano=${ano}`, universo: r.universo, coletados: r.coletados, paginas: r.paginas.length, totalPaginas: r.totalPaginas, erros: r.erros, peso: r.peso, censo: r.censo, modoOffset: r.modoOffset });
  }
  const compacto = c.compactar();
  saida.zika = { estratos, compacto, soma: somaVerificacao(compacto) };
}
// Febre amarela: rota inteira, censo
{
  const c = new Contagem({ anoMinimo: 1990 });
  const r = await coletarEstrato({ base: B, rota: "/arboviroses/febre-amarela-humanos-primatas-nao-humanos", censoAte: 500, normalizar: normalizarFebreAmarela });
  for (const n of r.registros) c.add(n, r.peso);
  const compacto = c.compactar();
  saida.febreamarela = { estratos: [{ rotulo: "rota inteira", universo: r.universo, coletados: r.coletados, paginas: r.paginas.length, totalPaginas: r.totalPaginas, erros: r.erros, peso: r.peso, censo: r.censo, modoOffset: r.modoOffset }], compacto, soma: somaVerificacao(compacto) };
}
copy(JSON.stringify(saida)); // copia para a área de transferência
```

4. Salve o conteúdo copiado como `coleta.json` e importe:

```bash
npm run etl -- --importar=coleta.json
```

O ETL recalcula a soma de verificação de cada agravo; se ela não bater com a do navegador,
nada é gravado.

## O que foi descoberto sobre a API (27/11/2026)

- `offset` é o **índice do registro inicial**, não o número da página (a documentação diz
  página). O núcleo detecta o modo a cada coleta.
- `campos=` faz o servidor estourar o tempo (502) — não use.
- Zika e Dengue não informam `total_registros`; o universo é medido por busca binária.
- Dengue: `nu_ano` devolve 502 e offsets profundos passam de 60 s → 2019+ inalcançável.
