import React from 'react';
import type { PresenceStatus } from '../shared/types';

interface PresenceDotProps {
  status: PresenceStatus;
  hasLeft?: boolean;
  showTextLabel?: boolean;
  size?: 'sm' | 'md';
}

export const PresenceDot: React.FC<PresenceDotProps> = ({
  status,
  hasLeft = false,
  showTextLabel = false,
  size = 'md',
}) => {
  const effectiveStatus: PresenceStatus = hasLeft ? 'offline' : status;

  const dotColor =
    effectiveStatus === 'active'
      ? 'bg-[#22c55e] ring-[#22c55e]/25'
      : effectiveStatus === 'idle'
        ? 'bg-[#eab308] ring-[#eab308]/25'
        : 'bg-[#ef4444] ring-[#ef4444]/25';

  const label =
    effectiveStatus === 'active'
      ? 'Active'
      : effectiveStatus === 'idle'
        ? 'AFK / Idle'
        : hasLeft
          ? 'Left'
          : 'Offline';

  const textColor =
    effectiveStatus === 'active'
      ? 'text-[#16a34a] dark:text-[#4ade80]'
      : effectiveStatus === 'idle'
        ? 'text-[#ca8a04] dark:text-[#facc15]'
        : 'text-[#dc2626] dark:text-[#f87171]';

  const sizeClass = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={label}>
      <span
        role="status"
        aria-label={label}
        className={`inline-block rounded-full ring-2 shrink-0 ${sizeClass} ${dotColor}`}
      />
      {showTextLabel && (
        <span className={`text-[10px] sm:text-[11px] font-semibold leading-none ${textColor}`}>
          {label}
        </span>
      )}
    </span>
  );
};
