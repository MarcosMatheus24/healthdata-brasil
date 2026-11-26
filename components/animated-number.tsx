"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Recebe um número JÁ FORMATADO em pt-BR ("1,2 mi", "12,34%", "4.445.192")
 * e anima apenas a parte numérica, preservando prefixo, sufixo e casas
 * decimais. Assim os formatadores de lib/format.ts continuam sendo a única
 * fonte de verdade do texto final.
 */
const RE = /-?[\d.]+(?:,\d+)?/;

function analisar(texto: string) {
  const m = texto.match(RE);
  if (!m || m.index === undefined) return null;
  const bruto = m[0];
  const casas = bruto.includes(",") ? bruto.split(",")[1].length : 0;
  const valor = Number(bruto.replace(/\./g, "").replace(",", "."));
  if (Number.isNaN(valor)) return null;
  return {
    antes: texto.slice(0, m.index),
    depois: texto.slice(m.index + bruto.length),
    valor,
    casas,
  };
}

export function AnimatedNumber({ value, duracao = 1400 }: { value: string; duracao?: number }) {
  const alvo = analisar(value);
  // Começa no valor real: sem JS (ou para leitores de tela) o número correto
  // aparece. O efeito zera e conta até o alvo quando o elemento entra na tela.
  const [atual, setAtual] = useState<number>(alvo?.valor ?? 0);
  const anterior = useRef(0);
  const elemento = useRef<HTMLSpanElement>(null);
  const iniciou = useRef(false);

  useEffect(() => {
    if (!alvo) return;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) {
      setAtual(alvo.valor);
      anterior.current = alvo.valor;
      return;
    }

    let quadro = 0;
    const animar = () => {
      const de = anterior.current;
      const para = alvo.valor;
      const t0 = performance.now();
      const passo = (agora: number) => {
        const t = Math.min(1, (agora - t0) / duracao);
        const suave = 1 - Math.pow(1 - t, 4); // easeOutQuart
        setAtual(de + (para - de) * suave);
        if (t < 1) quadro = requestAnimationFrame(passo);
        else anterior.current = para;
      };
      quadro = requestAnimationFrame(passo);
    };

    // Primeira vez: espera o número entrar na tela. Depois: anima a cada troca.
    if (iniciou.current) {
      animar();
      return () => cancelAnimationFrame(quadro);
    }
    setAtual(0);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          iniciou.current = true;
          animar();
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    if (elemento.current) io.observe(elemento.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(quadro);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!alvo) return <span>{value}</span>;

  const fmt = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: alvo.casas,
    maximumFractionDigits: alvo.casas,
  });

  return (
    <span ref={elemento} aria-label={value} className="tabular-nums">
      <span aria-hidden>
        {alvo.antes}
        {fmt.format(atual)}
        {alvo.depois}
      </span>
    </span>
  );
}
