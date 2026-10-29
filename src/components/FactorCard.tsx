import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, CloudSunRain, Fuel, Sprout, Wheat } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { texts } from '../content/texts';
import { formatPct, formatRub } from '../lib/format';
import type { SignalStatus, SourceRef } from '../types';
import SourceNote from './SourceNote';
import StatusTag from './StatusTag';

/** Фактор карточки: 4 фактора главного экрана (+ прочие затраты для «Почему»). */
export type FactorKind = 'price' | 'diesel' | 'yield' | 'weather' | 'otherCosts';

const ICONS: Record<FactorKind, typeof Wheat> = {
  price: Wheat,
  diesel: Fuel,
  yield: Sprout,
  weather: CloudSunRain,
  otherCosts: Sprout,
};

const L_MORE = texts.common.actions.more;
const L_NO_RUB = texts.factors.weather.noRub;

export interface FactorCardProps {
  kind: FactorKind;
  /** «Цена пшеницы», «Солярка» */
  title: string;
  status: SignalStatus;
  /** Своя подпись статуса вместо «Хуже/Норма/Лучше» */
  statusLabel?: string;
  /** Рублёвый эффект (знак: + улучшило прибыль); null — не переводится в рубли */
  effectRub: number | null;
  effectUnit?: '₽/га' | '₽';
  /** Изменение самого фактора, % (направление стрелки) */
  changePct: number | null;
  /** «за месяц», «к прошлому сезону» */
  changeCaption?: string;
  /** Текущее значение фактора: «62,4 ₽/л» */
  valueText?: string;
  /** Крупная строка вместо рублей, когда effectRub = null (погода): «Сухо 12 дней» */
  headline?: string;
  /** Пояснение одной строкой */
  detail?: ReactNode;
  /** Куда ведёт клик по карточке */
  link?: string;
  source?: SourceRef;
  className?: string;
}

/** Карточка фактора: рублёвый эффект крупно, процент мельче, стрелка + подпись + цвет статуса. */
export default function FactorCard(props: FactorCardProps) {
  const {
    kind,
    title,
    status,
    statusLabel,
    effectRub,
    effectUnit = '₽/га',
    changePct,
    changeCaption,
    valueText,
    headline,
    detail,
    link,
    source,
    className = '',
  } = props;
  const Icon = ICONS[kind];
  const Arrow = changePct == null || Math.abs(changePct) < 0.05 ? ArrowRight : changePct > 0 ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-surface-2 text-ink/75">
          <Icon size={17} strokeWidth={1.75} aria-hidden />
        </span>
        <StatusTag status={status} label={statusLabel} size="sm" />
      </div>
      <h3 className="mt-3 min-h-[2.5em] text-[15px] leading-tight">{title}</h3>

      <div className="mt-2">
        {effectRub != null ? (
          <p className="flex flex-wrap items-baseline gap-x-1 leading-none text-ink">
            <span className="num-display whitespace-nowrap text-[28px] font-semibold">
              {formatRub(effectRub, { unit: '₽', sign: true })}
            </span>
            {effectUnit !== '₽' && <span className="text-sm font-medium text-muted">{effectUnit.slice(1)}</span>}
          </p>
        ) : (
          <p className="font-display text-[19px] font-semibold leading-tight text-ink">{headline ?? L_NO_RUB}</p>
        )}
        <p className="num mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
          {changePct != null && <Arrow size={16} strokeWidth={2} className="text-ink/70" aria-hidden />}
          {changePct != null && <span className="font-semibold text-ink">{formatPct(changePct)}</span>}
          {changeCaption && <span>{changeCaption}</span>}
          {valueText && (
            <>
              <span aria-hidden className="text-line-strong">
                /
              </span>
              <span>{valueText}</span>
            </>
          )}
        </p>
      </div>

      {detail && <p className="mt-3 text-sm leading-snug text-ink/80">{detail}</p>}

      <div className="mt-auto pt-4">
        {source && <SourceNote source={source} className="border-t border-dashed border-line pt-3" />}
        {link && (
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
            {L_MORE}
            <ChevronRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </>
  );

  const cls = `group relative flex h-full flex-col rounded-card border border-line bg-surface p-card-sm sm:p-card ${className}`;
  if (link) {
    // Ссылка на всю карточку через растянутую ссылку: внутри остаются кликабельные источники.
    return (
      <article className={`${cls} transition-shadow hover:border-line-strong hover:shadow-raise`}>
        <Link to={link} className="absolute inset-0 z-0 rounded-card" aria-label={`${title}: ${L_MORE.toLowerCase()}`} />
        <div className="pointer-events-none relative z-10 flex h-full flex-col [&_a]:pointer-events-auto">{body}</div>
      </article>
    );
  }
  return <article className={cls}>{body}</article>;
}
