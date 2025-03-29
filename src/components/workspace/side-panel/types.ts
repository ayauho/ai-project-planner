'use client';

import { ReactNode } from 'react';

export interface PanelContainerProps {
  children: ReactNode;
  className?: string;
}

export interface CollapseButtonProps {
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export interface ApiKeyManagerProps {
  className?: string;
}

export interface ProjectSelectorProps {
  className?: string;
  onProjectSelect: (projectId: string) => void;
}
