'use client';

import { logger } from '@/lib/client/logger';
import { select } from 'd3-selection';

// Define hierarchy level constants for better readability
export enum HierarchyLevel {
  // Higher numbers = higher visual hierarchy (appears on top)
  PROJECT = 1,
  PROJECT_COUNTER = 2,
  FIRST_LEVEL_TASK = 3,
  FIRST_LEVEL_CONTROL = 4,
  SECOND_LEVEL_TASK = 5,
  SECOND_LEVEL_CONTROL = 6,
  THIRD_LEVEL_TASK = 7,
  THIRD_LEVEL_CONTROL = 8,
  // And so on... can be calculated dynamically
}

interface ElementOrder {
  id: string;
  element: SVGElement;
  level: number;
  isControl: boolean;
}

class SVGOrderManager {
  private static instance: SVGOrderManager;
  private elements: Map<string, ElementOrder> = new Map();
  private taskLevels: Map<string, number> = new Map();
  private controlElems: Map<string, ElementOrder> = new Map();
  private contentLayer: SVGGElement | null = null;
  private controlsLayer: SVGGElement | null = null;

  private constructor() {}

  public static getInstance(): SVGOrderManager {
    if (!SVGOrderManager.instance) {
      SVGOrderManager.instance = new SVGOrderManager();
    }
    return SVGOrderManager.instance;
  }

  public setLayers(contentLayer: SVGGElement, controlsLayer: SVGGElement): void {
    this.contentLayer = contentLayer;
    this.controlsLayer = controlsLayer;
    logger.debug('SVG order manager layers set', { hasContentLayer: !!contentLayer, hasControlsLayer: !!controlsLayer }, 'svg-order layer-management');
  }

  public registerElement(id: string, element: SVGElement, level: number, isControl: boolean = false): void {
    this.elements.set(id, { id, element, level, isControl });
    
    // Add data-level attribute to the SVG element for debugging
    select(element).attr('data-level', level.toString());
    
    if (!isControl) {
      // Store in the taskLevels map - ensure we're consistent with key format
      // Strip the 'task-' prefix to get the raw task ID
      const taskId = id.startsWith('task-') ? id.substring(5) : id;
      this.taskLevels.set(taskId, level);
      
      logger.debug('Registered task with level', {
        id,
        taskId,
        level,
        mapSize: this.taskLevels.size
      }, 'svg-order element-registration');
    } else {
      this.controlElems.set(id, { id, element, level, isControl });
    }
  }

  // Add a method to get level from enum
public getLevelFromEnum(levelName: string): number {
  return HierarchyLevel[levelName as keyof typeof HierarchyLevel];
}

public getElementLevel(id: string): number {
    // Try looking up with the raw ID first
    let level = this.taskLevels.get(id);
    
    if (level === undefined) {
      // If not found, try with the 'task-' prefix
      level = this.taskLevels.get(`task-${id}`);
      
      if (level === undefined) {
        // If still not found, try stripping the 'task-' prefix
        const taskId = id.startsWith('task-') ? id.substring(5) : id;
        level = this.taskLevels.get(taskId);
      }
    }
    
    // If we still don't have a level, use a default
    if (level === undefined) {
      logger.warn('Could not find level for task ID', { id }, 'svg-order element-level warning');
      return HierarchyLevel.FIRST_LEVEL_TASK;
    }
    
    return level;
  }

  public calculateTaskLevel(parentId: string | null | undefined): number {
    if (!parentId) {
      logger.debug('Task has no parent, assigning as first-level task', {}, 'svg-order level-calculation');
      return HierarchyLevel.FIRST_LEVEL_TASK;
    }
    
    // Debug the parentId format
    logger.debug('Calculating task level', { parentId }, 'svg-order level-calculation');
    
    // If parent is the project, it's a first-level task
    if (parentId.startsWith('project-')) {
      logger.debug('Task is child of project, assigning as first-level task', {}, 'svg-order level-calculation');
      return HierarchyLevel.FIRST_LEVEL_TASK;
    }
    
    // Try to get the parent level - strip any 'task-' prefix
    const cleanParentId = parentId.startsWith('task-') ? 
      parentId.substring(5) : parentId;
    
    const parentLevel = this.getElementLevel(cleanParentId);
    
    // Calculate the task level based on parent level
    const taskLevel = parentLevel + 2;
    
    logger.debug('Calculated task level from parent', {
      parentId,
      cleanParentId,
      parentLevel,
      taskLevel
    }, 'svg-order level-calculation');
    
    return taskLevel;
  }

  public applyOrder(): void {
    try {
      logger.debug('Applying SVG element ordering', {}, 'svg-order ordering');
      
      if (!this.contentLayer || !this.controlsLayer) {
        logger.warn('Cannot apply ordering - layers not set', {}, 'svg-order ordering warning');
        return;
      }

      // Sort elements by level (lower levels first)
      const sortedElements = Array.from(this.elements.values())
        .sort((a, b) => a.level - b.level);

      // Reorder content elements
      const contentElements = sortedElements.filter(e => !e.isControl);
      for (const elem of contentElements) {
        // Make sure the data-level attribute is set
        select(elem.element).attr('data-level', elem.level.toString());
        
        // Move to end of content layer to bring it to front
        if (elem.element.parentNode) {
          this.contentLayer.appendChild(elem.element);
        }
        //logger.debug('Reordered content element', { id: elem.id, level: elem.level });
      }

      // Reorder control elements
      const controlElements = sortedElements.filter(e => e.isControl);
      for (const elem of controlElements) {
        // Make sure the data-level attribute is set
        select(elem.element).attr('data-level', elem.level.toString());
        
        // Move to end of controls layer to bring it to front
        if (elem.element.parentNode) {
          this.controlsLayer.appendChild(elem.element);
        }
      }
    } catch (error) {
      logger.error('Failed to apply SVG element ordering', { error }, 'svg-order ordering error');
    }
  }

  public clear(): void {
    this.elements.clear();
    this.taskLevels.clear();
    this.controlElems.clear();
    logger.debug('SVG order manager cleared', {}, 'svg-order reset');
  }
}

export const svgOrderManager = SVGOrderManager.getInstance();
