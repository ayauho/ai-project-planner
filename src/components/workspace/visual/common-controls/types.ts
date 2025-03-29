'use client';

export type ControlType = 'split' | 'regenerate' | 'delete';

export interface CommonControlEvent {
  type: ControlType;
  taskId: string;
}

export type CommonControlHandler = (event: CommonControlEvent) => Promise<void>;

export interface ControlModeState {
  activeMode: 'none' | 'regenerate' | 'delete';
  setActiveMode: (mode: 'none' | 'regenerate' | 'delete') => void;
}

export interface CommonControlsProps {
  className?: string;
  style?: React.CSSProperties;
}
