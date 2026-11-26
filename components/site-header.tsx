"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const NAV = [
  { href: "/", label: "Visão geral" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/mapa", label: "Mapa" },
  { href: "/integracoes", label: "Integrações" },
  { href: "/metodologia", label: "Metodologia" },
];

const ehAtivo = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/** Marca: um traço de eletrocardiograma que se desenha no carregamento e no hover. */
function Marca() {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br from-brand-bright via-brand to-[#1a2a8f] text-white shadow-[0_6px_16px_-6px_rgb(35_66_214/0.7),inset_0_1px_0_rgb(255_255_255/0.25)]">
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden>
        <path
          key="ecg"
          d="M3 17h6l2.5-6 4 12 3.5-9 2 3H29"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="draw-line group-hover:[animation:draw_1.1s_cubic-bezier(0.16,1,0.3,1)_both]"
        />
      </svg>
      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [rolou, setRolou] = useState(false);
  const barra = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLDivElement>(null);
  const [pilula, setPilula] = useState<{ x: number; w: number; visivel: boolean }>({ x: 0, w: 0, visivel: false });

  /* sombra + barra de progresso de leitura */
  useEffect(() => {
    let quadro = 0;
    const aoRolar = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const y = window.scrollY;
        setRolou(y > 8);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (barra.current) barra.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      });
    };
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
    };
  }, [pathname]);

  /* pílula deslizante: segue o hover/foco e volta para o item ativo */
  const ativoHref = NAV.find((i) => ehAtivo(i.href, pathname))?.href ?? null;
  const [foco, setFoco] = useState<string | null>(null);
  const alvo = foco ?? ativoHref;

  const medir = useCallback(() => {
    const el = alvo ? nav.current?.querySelector<HTMLElement>(`[data-href="${alvo}"]`) : null;
    if (!el || !nav.current) return setPilula((p) => ({ ...p, visivel: false }));
    setPilula({ x: el.offsetLeft, w: el.offsetWidth, visivel: true });
  }, [alvo]);

  useLayoutEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    // as fontes web mudam a largura dos rótulos depois do primeiro layout
    document.fonts?.ready.then(medir).catch(() => {});
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-300 ${
        rolou
          ? "border-line bg-canvas/80 shadow-[0_8px_30px_-12px_rgb(11_19_36/0.18)] backdrop-blur-xl"
          : "border-transparent bg-canvas/60 backdrop-blur-md"
      }`}
    >
      <div className="wrap flex h-16 items-center justify-between gap-6">
        <Link href="/" className="group flex items-center gap-3" aria-label="HealthData Brasil — início">
          <Marca />
          <span className="leading-none">
            <span className="block font-display text-[1.08rem] font-semibold tracking-[-0.03em]">
              HealthData<span className="text-brand"> Brasil</span>
            </span>
            <span className="kicker mt-1 block text-[0.6rem] tracking-[0.18em]">Vigilância · dados oficiais</span>
          </span>
        </Link>

        <nav aria-label="Navegação principal" className="hidden md:block">
          <div
            ref={nav}
            className="relative flex items-center gap-0.5 rounded-full border border-line bg-surface/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]"
            onMouseLeave={() => setFoco(null)}
          >
            <span
              aria-hidden
              className="absolute inset-y-1 left-0 rounded-full bg-ink shadow-[0_4px_14px_-4px_rgb(11_19_36/0.45)] transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: pilula.w,
                transform: `translateX(${pilula.x}px)`,
                opacity: pilula.visivel ? 1 : 0,
              }}
            />
            {NAV.map((item) => {
              const ativo = ehAtivo(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  data-href={item.href}
                  data-on={alvo === item.href && pilula.visivel ? "true" : "false"}
                  onMouseEnter={() => setFoco(item.href)}
                  onFocus={() => setFoco(item.href)}
                  onBlur={() => setFoco(null)}
                  className="relative z-10 rounded-full px-3.5 py-1.5 text-[0.84rem] font-medium text-ink-soft transition-colors duration-300 data-[on=true]:text-canvas"
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-ok/25 bg-ok-wash px-2.5 py-1 font-mono text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ok lg:flex">
            <span className="dot-live h-1.5 w-1.5 rounded-full bg-ok" />
            MS + IBGE
          </span>
          <Link href="/dashboard" className="btn btn-primary hidden py-2 text-[0.8rem] sm:inline-flex">
            Abrir painel
            <span className="btn-arrow" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </div>

      {/* navegação mobile */}
      <div className="border-t border-line md:hidden">
        <div className="wrap flex gap-1.5 overflow-x-auto py-2 [scrollbar-width:none]">
          {NAV.map((item) => {
            const ativo = ehAtivo(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.1em] transition-colors ${
                  ativo ? "bg-ink text-canvas" : "text-ink-mute hover:bg-surface hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* progresso de leitura */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-[2px] overflow-hidden">
        <div
          ref={barra}
          className="h-full origin-left bg-gradient-to-r from-brand via-[#9b7bff] to-accent"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </header>
  );
}
