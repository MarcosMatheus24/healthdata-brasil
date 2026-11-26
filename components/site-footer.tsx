import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="theme-night relative mt-24 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="aurora -left-24 top-10 h-72 w-72 bg-brand" style={{ opacity: 0.35 }} />
        <span className="aurora right-0 -top-24 h-80 w-80 bg-[#7c4dff]" style={{ opacity: 0.22, animationDelay: "-9s" }} />
        <div className="grid-lines absolute inset-0 opacity-60" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent" />
      </div>
      <div className="wrap relative py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]" data-reveal-stagger>
          <div>
            <p className="max-w-[20ch] font-display text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
              Dados de vigilância só valem quando a <span className="text-gradient">origem viaja junto.</span>
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
              Portal educacional desenvolvido para a AV2 do Projeto Integrador. Não substitui
              sistemas oficiais, não produz diagnóstico e não representa a situação epidemiológica
              oficial do Brasil.
            </p>
            <p className="mono mt-6 text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
              Next.js · PostgreSQL · API de Dados Abertos MS · IBGE
            </p>
          </div>

          <div>
            <p className="kicker mb-4">Navegar</p>
            <ul className="space-y-2 text-sm text-ink-soft">
              <li><Link className="link-underline" href="/dashboard">Dashboard de indicadores</Link></li>
              <li><Link className="link-underline" href="/mapa">Mapa territorial</Link></li>
              <li><Link className="link-underline" href="/integracoes">Integrações e fontes</Link></li>
              <li><Link className="link-underline" href="/metodologia">Metodologia e limitações</Link></li>
            </ul>
          </div>

          <div>
            <p className="kicker mb-4">Fontes oficiais</p>
            <ul className="space-y-2 text-sm text-ink-soft">
              <li>
                <a
                  className="link-underline"
                  href="https://apidadosabertos.saude.gov.br/v1/"
                  target="_blank"
                  rel="noreferrer"
                >
                  API de Dados Abertos — MS
                </a>
              </li>
              <li>
                <a
                  className="link-underline"
                  href="https://servicodados.ibge.gov.br/api/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  APIs do IBGE
                </a>
              </li>
              <li>
                <a
                  className="link-underline"
                  href="https://datasus.saude.gov.br/wp-content/uploads/2022/02/Manual-de-Utilizacao-da-API-e-Sus-Notifica.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Manual da API e-SUS Notifica
                </a>
              </li>
              <li>
                <a className="link-underline" href="https://senaiba.my.canva.site/av2" target="_blank" rel="noreferrer">
                  Briefing da AV2
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 grid gap-4 border-t border-line pt-6 md:grid-cols-2">
          <div>
            <p className="kicker mb-3">Código e deploy</p>
            <ul className="space-y-2 text-sm text-ink-soft">
              <li>
                <a
                  className="link-underline"
                  href="https://github.com/MarcosMatheus24/healthdata-brasil"
                  target="_blank"
                  rel="noreferrer"
                >
                  Repositório no GitHub
                </a>
              </li>
              <li>
                <a
                  className="link-underline"
                  href="https://healthdata-brasil.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                >
                  Deploy na Vercel
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="kicker mb-3">API própria</p>
            <ul className="space-y-1.5 text-sm text-ink-soft">
              {["/api/fontes/status", "/api/indicadores?ano=2025", "/api/territorios", "/api/export?ano=2025"].map((rota) => (
                <li key={rota}>
                  <a className="mono text-[0.72rem] link-underline" href={rota}>
                    {rota}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-[0.7rem] text-ink-mute md:flex-row md:items-center md:justify-between">
          <p className="mono uppercase tracking-[0.12em]">
            © {new Date().getFullYear()} HealthData Brasil · Projeto Integrador AV2
          </p>
          <p className="mono uppercase tracking-[0.12em]">
            Marcos M. R. Muniz · Yuri C. Cabral · Luis G. D. Estrela · Gabriel M. Azevedo
          </p>
        </div>
      </div>
    </footer>
  );
}
