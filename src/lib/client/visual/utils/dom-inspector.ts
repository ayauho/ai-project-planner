'use client';

import { logger } from '@/lib/client/logger';

/**
 * Utility for inspecting DOM elements and their hierarchy
 * Used for debugging complex SVG structures
 */
export class DomInspector {
  private static instance: DomInspector;
  private debugEnabled: boolean = false;

  private constructor() {}

  public static getInstance(): DomInspector {
    if (!DomInspector.instance) {
      DomInspector.instance = new DomInspector();
    }
    return DomInspector.instance;
  }

  /**
   * Enable or disable debug mode
   */
  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Log an element's details including attributes and class list
   */
  logElement(element: Element, label: string = 'Element'): void {
    if (!this.debugEnabled) return;

    const attributes: Record<string, string> = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }

    logger.debug(`DOM Inspector: ${label}`, { 
      id: element.id,
      tagName: element.tagName,
      className: element.className, 
      classList: Array.from(element.classList),
      attributes,
      children: element.children.length,
      parent: element.parentElement?.tagName || 'none'
    }, 'dom-inspector element-inspection');
  }

  /**
   * Find all related elements for a task
   */
  findTaskRelatedElements(taskId: string): Record<string, Element[]> {
    // Results object to hold all found elements
    const results: Record<string, Element[]> = {
      taskElement: [],
      splitControls: [],
      otherControls: [],
      connectionGroups: [],
      connectionLines: [],
      connectionMarkers: []
    };

    try {
      // Find the task element
      const taskElement = document.getElementById(`task-${taskId}`);
      if (taskElement) {
        results.taskElement.push(taskElement);
        this.logElement(taskElement, 'Task Element');
      }

      // Find all split controls with class .task-control-{taskId}
      document.querySelectorAll(`.task-control-${taskId}`).forEach(element => {
        results.splitControls.push(element);
        this.logElement(element, 'Split Control');
      });

      // Find control elements with data-task-id attribute
      document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(element => {
        // Skip elements already in splitControls
        if (!results.splitControls.includes(element)) {
          results.otherControls.push(element);
          this.logElement(element, 'Other Control');
        }
      });

      // For connections, look in the connections layer
      const connectionsLayer = document.querySelector('.layer-connections');
      if (connectionsLayer) {
        // Find connection groups that contain the taskId in their ID or data attributes
        connectionsLayer.querySelectorAll('g.connection-group').forEach(group => {
          const groupId = group.id || '';
          const groupData = group.getAttribute('data-connection') || '';
          
          if (groupId.includes(taskId) || groupData.includes(taskId)) {
            results.connectionGroups.push(group);
            this.logElement(group, 'Connection Group');
          }
        });
        
        // If no connection groups found, look for individual paths
        if (results.connectionGroups.length === 0) {
          connectionsLayer.querySelectorAll('path').forEach(path => {
            const pathId = path.id || '';
            const pathData = path.getAttribute('data-connection') || '';
            
            if (pathId.includes(taskId) || pathData.includes(taskId)) {
              results.connectionLines.push(path);
              this.logElement(path, 'Connection Line');
            }
          });
        }
        
        // Find connection markers that might be related
        connectionsLayer.querySelectorAll('.connection-marker').forEach(marker => {
          // This is tricky as markers might not have direct taskId references
          // Instead, check if they're close to connections we already found
          const markerId = marker.id || '';
          const markerData = marker.getAttribute('data-connection') || '';
          
          if (markerId.includes(taskId) || markerData.includes(taskId)) {
            results.connectionMarkers.push(marker);
            this.logElement(marker, 'Connection Marker (Direct)');
          }
        });
      }

      // Find any other elements with taskId in their ID or data attributes
      document.querySelectorAll(`[id*="${taskId}"], [data-id*="${taskId}"]`).forEach(element => {
        // Skip elements we've already accounted for
        let alreadyFound = false;
        for (const category in results) {
          if (results[category].includes(element)) {
            alreadyFound = true;
            break;
          }
        }
        
        if (!alreadyFound) {
          // Categorize based on element type or class
          if (element.classList.contains('connection-group')) {
            results.connectionGroups.push(element);
            this.logElement(element, 'Additional Connection Group');
          } else if (element.tagName === 'path') {
            results.connectionLines.push(element);
            this.logElement(element, 'Additional Connection Line');
          } else if (element.classList.contains('connection-marker')) {
            results.connectionMarkers.push(element);
            this.logElement(element, 'Additional Connection Marker');
          } else if (element.classList.contains('task-control')) {
            results.splitControls.push(element);
            this.logElement(element, 'Additional Split Control');
          } else {
            results.otherControls.push(element);
            this.logElement(element, 'Additional Other Element');
          }
        }
      });

      // For debugging, count total elements found
      if (this.debugEnabled) {
        let totalElements = 0;
        for (const category in results) {
          totalElements += results[category].length;
        }
        
        logger.debug('DOM Inspector: Found elements summary', {
          taskId,
          taskElement: results.taskElement.length,
          splitControls: results.splitControls.length,
          otherControls: results.otherControls.length,
          connectionGroups: results.connectionGroups.length,
          connectionLines: results.connectionLines.length,
          connectionMarkers: results.connectionMarkers.length,
          total: totalElements
        }, 'dom-inspector task-elements');
      }
    } catch (error) {
      logger.error('DOM Inspector: Error finding related elements', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'dom-inspector error');
    }

    return results;
  }
}

export const domInspector = DomInspector.getInstance();
