'use client';

import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  id?: string;
}

/** Apple-style toggle — semantic tokens only. */
export default function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
  id,
}: SwitchProps) {
  const switchId = id || (label ? `switch-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[28px] w-[46px] shrink-0 rounded-full',
        'transition-[background] duration-normal ease-apple',
        'focus-visible:outline-none focus-visible:shadow-focus',
        checked ? 'bg-accent' : 'bg-surface-hover ring-1 ring-border',
        disabled && 'cursor-not-allowed opacity-40'
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full bg-white',
          'shadow-[0_1px_3px_rgba(0,0,0,0.2),0_1px_1px_rgba(0,0,0,0.08)]',
          'transition-transform duration-normal ease-apple',
          checked && 'translate-x-[18px]'
        )}
 />
    </button>
  );

  if (!label) return control;

  return (
    <label
      htmlFor={switchId}
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <span className="min-w-0">
        <span className="block text-sidebar font-medium tracking-[-0.016em] text-foreground">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-sm leading-relaxed text-text-secondary">
            {description}
          </span>
        ) : null}
      </span>
      {control}
    </label>
  );
}
