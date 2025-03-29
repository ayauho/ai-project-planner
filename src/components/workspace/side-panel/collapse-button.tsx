'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CollapseButtonProps {
  isCollapsed: boolean;
  onToggle: () =>void;
  className?: string;
}

const CollapseButton = ({
  isCollapsed,
  onToggle,
  className = ''
}: CollapseButtonProps) =>{
  return (<button
      onClick={onToggle}
      className={`p-1.5 transition-colors ${className}`}
      aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
    >{isCollapsed ? (<ChevronRight className="w-4 h-4" />) : (<ChevronLeft className="w-4 h-4" />)}</button>);
};

export default CollapseButton;
