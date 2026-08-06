'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/Button';

/** Shared field chrome — matches Memory / MCP / Automation form fields. */
export const fieldClassName = cn(
  'w-full rounded-[14px] border border-border',
  'bg-white/70 dark:bg-white/[0.06]',
  'px-3.5 py-2.5',
  'text-sm tracking-[-0.014em] text-foreground',
  'placeholder:text-muted-foreground/40',
  'transition-[border-color,background-color] duration-fast ease-apple',
  'focus:border-accent/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
);

export const selectClassName = cn(
  'rounded-full border border-border',
  'bg-white/70 dark:bg-white/[0.06]',
  'px-3 py-1.5',
  'text-caption text-foreground/80',
  'transition-[border-color,background-color] duration-fast ease-apple',
  'focus:border-accent/30',
  'disabled:cursor-not-allowed disabled:opacity-60'
);

/** Settings-row select (Billing AI section) — slightly squarer than pill selects. */
export const selectFieldClassName = cn(
  'max-w-[200px] rounded-lg border border-border bg-surface-elevated',
  'px-2.5 py-2 text-sm text-foreground',
  'focus:border-accent/40',
  'disabled:cursor-not-allowed disabled:opacity-60'
);

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visual recipe. Default = text field. */
  inputSize?: 'sm' | 'md';
}

/**
 * Shared text / password / url / email input.
 * Focus ring comes from global form `:focus-visible` rules.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type = 'text', inputSize = 'md', ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          fieldClassName,
          inputSize === 'sm' && 'px-3 py-2 text-caption rounded-[12px]',
          className
        )}
        {...props}
      />
    );
  }
);

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldClassName, 'resize-none', className)}
        {...props}
      />
    );
  }
);

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** `pill` = Memory/MCP filters; `field` = Billing settings rows. */
  appearance?: 'pill' | 'field';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, appearance = 'pill', ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          appearance === 'field' ? selectFieldClassName : selectClassName,
          className
        )}
        {...props}
      />
    );
  }
);

export interface SearchInputProps extends Omit<InputProps, 'type'> {
  containerClassName?: string;
  onClear?: () => void;
}

/**
 * Pill search field with leading Search icon — Memory / sidebar recipe.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    { className, containerClassName, onClear: _onClear, ...props },
    ref
  ) {
    return (
      <div
        className={cn(
          'flex min-w-[160px] flex-1 items-center gap-2 rounded-full px-3 py-2',
          'bg-black/[0.035] dark:bg-white/[0.05]',
          'border border-transparent focus-within:border-accent/25',
          containerClassName
        )}
      >
        <Search size={14} className="shrink-0 text-muted-foreground/50" aria-hidden />
        <input
          ref={ref}
          type="search"
          className={cn(
            'w-full bg-transparent text-sm text-foreground',
            'placeholder:text-muted-foreground/40',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

export interface FilePickerProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
  /** Trigger button props (defaults to ghost sm). */
  buttonProps?: Omit<ButtonProps, 'onClick' | 'type'>;
  children?: React.ReactNode;
  inputId?: string;
  className?: string;
}

/**
 * Hidden file input + shared Button trigger (dropdown / upload affordance).
 */
export function FilePicker({
  accept,
  multiple,
  disabled,
  onFiles,
  buttonProps,
  children = 'Upload',
  inputId,
  className,
}: FilePickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const {
    variant = 'ghost',
    size = 'sm',
    leftIcon,
    className: btnClassName,
    ...restButton
  } = buttonProps ?? {};

  return (
    <span className={cn('inline-flex', className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) onFiles(files);
          e.currentTarget.value = '';
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        leftIcon={leftIcon}
        className={btnClassName}
        onClick={() => inputRef.current?.click()}
        {...restButton}
      >
        {children}
      </Button>
    </span>
  );
}

/**
 * Standard ghost/icon control used as a Dropdown `trigger` child.
 * Keeps radius / hover / focus aligned with Button icon variant.
 */
export const DropdownTrigger = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function DropdownTrigger(
    { variant = 'icon', size = 'sm', type = 'button', ...props },
    ref
  ) {
    return <Button ref={ref} type={type} variant={variant} size={size} {...props} />;
  }
);

export default Input;
