'use client';
import type { TaskConfig } from '../task/types';

// Project dimensions - centralized here for consistency
export const PROJECT_WIDTH = 280;
export const PROJECT_HEIGHT = 120;

export const PROJECT_TASK_CONFIG: TaskConfig = {
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

export const PROJECT_COUNT_DISPLAY = {
  background: '#ffffff',     // Match project rectangle
  textColor: '#1e293b',      // Match project title color 
  fontSize: 12,              // Unchanged
  padding: 6,                // Unchanged
  height: 24,                // Unchanged
  minWidth: 40,              // Unchanged
  borderRadius: 4,           // Unchanged
  borderColor: '#2563eb',    // Match project rectangle stroke
  borderWidth: 2             // Similar to project stroke width
};
