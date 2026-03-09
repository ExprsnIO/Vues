'use client';

import { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  error,
  hint,
  required = false,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-text-primary mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// Pre-styled input component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: ReactNode;
}

export function Input({
  error = false,
  icon,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          {icon}
        </div>
      )}
      <input
        className={`
          w-full px-3 py-2 text-sm bg-surface border rounded-lg
          text-text-primary placeholder:text-text-muted
          focus:outline-none focus:ring-2 focus:ring-accent/50
          transition-colors
          ${icon ? 'pl-10' : ''}
          ${
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
              : 'border-border focus:border-accent'
          }
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-hover
          ${className}
        `}
        {...props}
      />
    </div>
  );
}

// Pre-styled textarea
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function Textarea({
  error = false,
  className = '',
  ...props
}: TextareaProps) {
  return (
    <textarea
      className={`
        w-full px-3 py-2 text-sm bg-surface border rounded-lg
        text-text-primary placeholder:text-text-muted
        focus:outline-none focus:ring-2 focus:ring-accent/50
        transition-colors resize-none
        ${
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
            : 'border-border focus:border-accent'
        }
        disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-hover
        ${className}
      `}
      {...props}
    />
  );
}

// Pre-styled select
interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  children: ReactNode;
}

export function Select({
  error = false,
  className = '',
  children,
  ...props
}: SelectProps) {
  return (
    <select
      className={`
        w-full px-3 py-2 text-sm bg-surface border rounded-lg
        text-text-primary
        focus:outline-none focus:ring-2 focus:ring-accent/50
        transition-colors appearance-none
        ${
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
            : 'border-border focus:border-accent'
        }
        disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-hover
        ${className}
      `}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1.5rem',
        paddingRight: '2.5rem',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

// Checkbox with label
interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export function Checkbox({
  label,
  description,
  className = '',
  ...props
}: CheckboxProps) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${className}`}>
      <input
        type="checkbox"
        className="mt-0.5 w-4 h-4 rounded border-border text-accent focus:ring-accent focus:ring-offset-0 focus:ring-2 bg-surface"
        {...props}
      />
      <div className="flex-1">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

// Radio group
interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  className?: string;
}

export function RadioGroup({
  name,
  value,
  onChange,
  options,
  className = '',
}: RadioGroupProps) {
  return (
    <div className={`space-y-2 ${className}`} role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-start gap-3 cursor-pointer ${
            option.disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => onChange(e.target.value)}
            disabled={option.disabled}
            className="mt-0.5 w-4 h-4 border-border text-accent focus:ring-accent focus:ring-offset-0 focus:ring-2 bg-surface"
          />
          <div className="flex-1">
            <span className="text-sm font-medium text-text-primary">
              {option.label}
            </span>
            {option.description && (
              <p className="text-xs text-text-muted mt-0.5">
                {option.description}
              </p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}

// Toggle switch
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}: ToggleProps) {
  return (
    <label
      className={`flex items-center gap-3 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative w-11 h-6 rounded-full transition-colors
          ${checked ? 'bg-accent' : 'bg-surface-hover'}
          focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-background
        `}
      >
        <span
          className={`
            absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
      {label && (
        <div className="flex-1">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {description && (
            <p className="text-xs text-text-muted mt-0.5">{description}</p>
          )}
        </div>
      )}
    </label>
  );
}
