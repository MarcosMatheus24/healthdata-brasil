"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Observa elementos com `data-reveal` (o próprio elemento entra) ou
 * `data-reveal-stagger` (os filhos entram em cascata) e adiciona `.is-in`
 * quando eles chegam à área visível. As animações estão em globals.css.
 *
 * Um MutationObserver cobre conteúdo que aparece depois (troca de filtro,
 * navegação client-side), e o pathname reinicia o ciclo a cada rota.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const varrer = () => {
      document
        .querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in), [data-reveal-stagger]:not(.is-in)")
        .forEach((el) => {
          if (el.hasAttribute("data-reveal-stagger")) {
            Array.from(el.children).forEach((filho, i) =>
              (filho as HTMLElement).style.setProperty("--i", String(i)),
            );
          }
          if (reduzir) el.classList.add("is-in");
          else io.observe(el);
        });
    };

    varrer();

    let quadro = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(varrer);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(quadro);
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
