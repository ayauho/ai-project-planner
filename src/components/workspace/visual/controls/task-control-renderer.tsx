'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { logger } from '@/lib/client/logger';
import { TaskControl } from './task-control';

interface TaskControlRendererProps {
  taskId: string;
  childrenCount?: number;
  descendantCount?: number;
  onLoadingChange: (isLoading: boolean) => void;
  containerRef: SVGGElement;
}

export const TaskControlRenderer: React.FC<TaskControlRendererProps> = ({
  taskId,
  childrenCount,
  descendantCount,
  onLoadingChange,
  containerRef
}) => {
  const portalContainerRef = useRef<HTMLDivElement | null>(null);
  const foreignObjectRef = useRef<SVGForeignObjectElement | null>(null);

  useEffect(() => {
    try {
      // Create portal container if it doesn't exist
      if (!portalContainerRef.current) {
        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('width', '40');
        foreignObject.setAttribute('height', '40');
        foreignObject.setAttribute('x', '-20');
        foreignObject.setAttribute('y', '-20');
        foreignObject.style.overflow = 'visible';
        foreignObject.style.pointerEvents = 'none';

        const div = document.createElement('div');
        div.style.width = '40px';
        div.style.height = '40px';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.pointerEvents = 'auto';
        div.style.zIndex = '100';
        div.style.position = 'relative';

        foreignObject.appendChild(div);
        containerRef.appendChild(foreignObject);
        portalContainerRef.current = div;
        foreignObjectRef.current = foreignObject;

        logger.debug('Task control portal created', { taskId }, 'controls portal');
      }
    } catch (error) {
      logger.error('Failed to setup task control portal', { taskId, error }, 'controls portal error');
    }

    return () => {
      if (foreignObjectRef.current && foreignObjectRef.current.parentNode) {
        foreignObjectRef.current.parentNode.removeChild(foreignObjectRef.current);
      }
      portalContainerRef.current = null;
      foreignObjectRef.current = null;
    };
  }, [containerRef, taskId]);

  if (!portalContainerRef.current) {
    return null;
  }

  return createPortal(
    <TaskControl
      taskId={taskId}
      childrenCount={childrenCount}
      descendantCount={descendantCount}
      onLoadingChange={onLoadingChange}
    />,
    portalContainerRef.current
  );
};
