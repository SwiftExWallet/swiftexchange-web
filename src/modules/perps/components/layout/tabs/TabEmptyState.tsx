import type { LucideIcon } from 'lucide-react';
import React from 'react';

interface TabEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export const TabEmptyState: React.FC<TabEmptyStateProps> = ({ icon: Icon, title, description }) => {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center select-none w-full">
      <div className="w-10 h-10 rounded-full bg-tertiary/60 border border-color flex items-center justify-center text-muted mb-2">
        <Icon size={18} className="text-secondary opacity-80" />
      </div>
      <span className="text-xs font-semibold text-primary">{title}</span>
      {description && (
        <span className="text-[11px] text-muted mt-0.5 max-w-xs leading-relaxed">
          {description}
        </span>
      )}
    </div>
  );
};
