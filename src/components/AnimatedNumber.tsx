// Единственная анимация сайта (раздел 8): плавный пересчёт числа при движении слайдеров «Что если».
// При prefers-reduced-motion число меняется сразу.
import { useEffect, useRef, useState } from 'react';

const DURATION = 280;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export interface AnimatedNumberProps {
  value: number;
  /** Форматирование: formatRub / formatNumber из src/lib/format.ts */
  format: (v: number) => string;
  className?: string;
}

export default function AnimatedNumber({ value, format, className = '' }: AnimatedNumberProps) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (value - from) * eased;
      fromRef.current = v;
      setShown(v);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return (
    <span className={className}>
      {/* Для чтения с экрана — итоговое значение, без промежуточных кадров */}
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
