'use client';

import type { TaskConfig } from './types';

export const DEFAULT_TASK_CONFIG: TaskConfig = {
  styles: {
    active: {
      fill: '#ffffff',
      stroke: '#2563eb', 
      strokeWidth: 3,
      opacity: 1
    },
    'semi-transparent': {
      fill: '#ffffff',
      stroke: '#94a3b8',
      strokeWidth: 1,
      opacity: 0.6
    },
    hidden: {
      fill: '#ffffff',
      stroke: '#e2e8f0',
      strokeWidth: 1,
      opacity: 0
    }
  },
  text: {
    title: {
      font: 'system-ui, sans-serif',
      size: 14,
      color: '#1e293b',
      weight: 600,
      background: '#f8fafc',
      lineHeight: 1.3
    },
    description: {
      font: 'system-ui, sans-serif',
      size: 12,
      color: '#475569', 
      weight: 400,
      lineHeight: 1.2
    }
  },
  padding: {
    x: 12,
    y: 12
  },
  maxWidth: 240,
  cornerRadius: 6,
  titleAreaHeight: 42,
  titleMarginBottom: 8,
  button: {
    size: 28,
    background: '#f1f5f9',
    hoverBackground: '#e2e8f0',
    iconColor: '#64748b',
    iconSize: 16
  },
  expandedHeight: 200
};
