'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Escapist-style lozenge tab group. Container is a soft grey pill; the active
 * option is a pressed-in pure-black pill.
 *
 *   <PillTabs
 *     value={tab}
 *     onChange={setTab}
 *     options={[
 *       { value: 'plan', label: 'Plan' },
 *       { value: 'rides', label: 'Rides' },
 *     ]}
 *   />
 */
export interface PillTabOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export function PillTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: PillTabOption<T>[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('pill-group', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-active={opt.value === value}
          className={cn(
            'pill-tab',
            size === 'sm' && 'px-3 py-1 text-xs',
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
