import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'text';
export type ButtonSize = 'md' | 'sm';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Иконка lucide справа (например, ArrowRight) */
  iconRight?: ReactNode;
  iconLeft?: ReactNode;
  /** Разрешить перенос длинной подписи (на телефоне): кнопка растёт в высоту */
  wrap?: boolean;
  className?: string;
  children: ReactNode;
}

type AsLink = CommonProps & { to: string; href?: never } & Omit<ButtonHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'>;
type AsAnchor = CommonProps & { href: string; to?: never; target?: string; rel?: string };
type AsButton = CommonProps & { to?: never; href?: never } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export type ButtonProps = AsLink | AsAnchor | AsButton;

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium [&>svg]:shrink-0 transition-colors disabled:pointer-events-none disabled:opacity-50 select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'rounded-control bg-accent text-accent-ink shadow-lift hover:bg-accent-strong active:translate-y-px',
  secondary: 'rounded-control border border-line-strong bg-surface text-ink hover:border-accent hover:text-accent',
  text: 'rounded-tag text-accent underline decoration-accent/35 underline-offset-4 hover:decoration-accent',
};

const sizes: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: 'h-11 px-5 text-[15px]', sm: 'h-9 px-3.5 text-sm' },
  secondary: { md: 'h-11 px-5 text-[15px]', sm: 'h-9 px-3.5 text-sm' },
  text: { md: 'h-11 px-0.5 text-[15px]', sm: 'h-8 px-0.5 text-sm' },
};

/** Кнопка: основная / второстепенная / текстовая. to → ссылка роутера, href → внешняя ссылка. */
export default function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', iconLeft, iconRight, wrap = false, className = '', children } = props;
  const sizeCls = wrap ? sizes[variant][size].replace(/\bh-(\d+)/, 'min-h-$1 py-2') : sizes[variant][size];
  const cls = `${base} ${variants[variant]} ${sizeCls} ${wrap ? '!whitespace-normal text-center' : ''} ${className}`;
  const inner = (
    <>
      {iconLeft}
      <span>{children}</span>
      {iconRight}
    </>
  );

  if ('to' in props && props.to !== undefined) {
    const { to, variant: _v, size: _s, iconLeft: _l, iconRight: _r, wrap: _w, className: _c, children: _ch, ...rest } = props;
    return (
      <Link to={to} className={cls} {...rest}>
        {inner}
      </Link>
    );
  }
  if ('href' in props && props.href !== undefined) {
    return (
      <a href={props.href} target={props.target} rel={props.rel} className={cls}>
        {inner}
      </a>
    );
  }
  const { variant: _v, size: _s, iconLeft: _l, iconRight: _r, wrap: _w, className: _c, children: _ch, to: _t, href: _h, ...rest } =
    props as AsButton;
  return (
    <button type="button" className={cls} {...rest}>
      {inner}
    </button>
  );
}
