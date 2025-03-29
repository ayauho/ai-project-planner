// src/lib/client/layout/distribution/circular.ts
'use client';

import { LayoutElement } from '@/types/layout';
import { CircularLayoutConfig, CircularLayoutManager } from './types';
import { logger } from '@/lib/client/logger';

interface ElementNode extends LayoutElement {
  children: ElementNode[];
}

export class CircularLayoutManagerImpl implements CircularLayoutManager {
  private buildHierarchy(elements: LayoutElement[]): ElementNode[] {
    // Create map for quick lookups
    const elementMap = new Map<string, ElementNode>();
    
    // Initialize nodes with empty children arrays
    elements.forEach(element =>{
      elementMap.set(element.id, {
        ...element,
        children: []
      });
    });

    // Build parent-child relationships
    const rootNodes: ElementNode[] = [];
    elements.forEach(element =>{
      const node = elementMap.get(element.id)!;
      if (element.parentId) {
        const parent = elementMap.get(element.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  }

  private calculateNodeRadius(childCount: number, elementSize: number, parentSize: number = 0): number {
    if (childCount< 1) return 0;
    
    // Minimal spacing between elements
    const minSpacing = 30; 
    
    // Special case for exactly one child
    // Use the same radius calculation as if there were two children to maintain consistent distance
    if (childCount === 1) {
      // Simulate the calculation for two children
      const simulatedAngleStep = Math.PI; // 180 degrees, as if there were 2 children
      const minChordLength = elementSize + minSpacing;
      let radius = (minChordLength / (2 * Math.sin(simulatedAngleStep / 2))) * 1.2;
      
      // Same parent overlap check
      const minRadiusToAvoidParent = (parentSize / 2) + (elementSize / 2) + minSpacing;
      radius = Math.max(radius, minRadiusToAvoidParent);
      
      // Apply the same multipliers as we would for small sets
      radius *= 1.3; // For <= 5 children
      radius *= 1.2; // For <= 3 children
      
      logger.debug('Using special radius calculation for single child', { 
        elementSize, 
        parentSize, 
        radius,
        minRadiusToAvoidParent
      }, 'layout-distribution circular-layout radius-calculation');
      
      return radius;
    }
    
    // Regular calculation for multiple children
    // Calculate angle step between elements
    const angleStep = (2 * Math.PI) / childCount;
    
    // Calculate minimum chord length required for spacing
    const minChordLength = elementSize + minSpacing;
    
    // Calculate base radius needed for children to not overlap each other
    let radius = (minChordLength / (2 * Math.sin(angleStep / 2))) * 1.2;
    
    // Additional check to ensure children don't overlap with parent
    // Ensure radius is at least parentSize/2 + elementSize/2 + minSpacing
    const minRadiusToAvoidParent = (parentSize / 2) + (elementSize / 2) + minSpacing;
    
    // Use the larger of the two radius calculations
    radius = Math.max(radius, minRadiusToAvoidParent);
    
    // For very small numbers of children, increase radius more to avoid overlap
    if (childCount<= 5) {
      radius *= 1.3; // Increase radius by 30% for small sets of children
    }
    
    // Increase more for even fewer children
    if (childCount<= 3) {
      radius *= 1.2; // Additional 20% increase
    }
    
    logger.debug('Calculated node radius', { 
      childCount, 
      elementSize, 
      parentSize, 
      radius,
      minRadiusToAvoidParent
    }, 'layout-distribution circular-layout radius-calculation');
    
    return radius;
  }

  private positionNodes(
    nodes: ElementNode[],
    centerX: number,
    centerY: number,
    radius: number,
    parentRotation: number = 0,
    parentNode: ElementNode | null = null
  ): LayoutElement[] {
    const positioned: LayoutElement[] = [];
    
    if (nodes.length === 0) return positioned;

    const angleStep = (2 * Math.PI) / nodes.length;
    
    // If we have a parent node, calculate the max dimension for parent size
    const parentSize = parentNode ? 
      Math.max(parentNode.dimensions.width, parentNode.dimensions.height) : 0;

    // When we have few nodes, increase radius to prevent intersection with parent
    if (nodes.length<= 5 && parentNode) {
      // Recalculate radius with parent size consideration
      radius = this.calculateNodeRadius(
        nodes.length, 
        Math.max(...nodes.map(node =>Math.max(node.dimensions.width, node.dimensions.height))),
        parentSize
      );
    }
    
    // Special cases for task positioning
    // For 4 children - place them on diagonals
    // For 1 child - place it at the top/north position
    let rotationOffset = 0;
    
    if (nodes.length === 4) {
      rotationOffset = Math.PI / 4; // 45 degrees in radians
      logger.debug('Using diagonal arrangement for 4 children', { rotationOffset }, 'layout-distribution circular-layout node-positioning');
    } else if (nodes.length === 1) {
      // Position single child at the top/north (0 degrees)
      // The default angle calculation already has -Math.PI/2 which puts it at the top
      rotationOffset = 0; // Explicitly set to 0 for clarity
      logger.debug('Positioning single child at top/north', { rotationOffset }, 'layout-distribution circular-layout node-positioning');
    }

    nodes.forEach((node, index) =>{
      // Calculate position for this node - shift by -Math.PI/2 to start from top
      const angle = parentRotation + rotationOffset + (angleStep * index) - Math.PI/2;
      
      // Use the larger of calculated radius or minimum safe distance (300)
      const adjustedRadius = Math.max(radius, 300);
      
      // Calculate center point of the node based on angle and radius
      const centerPointX = centerX + adjustedRadius * Math.cos(angle);
      const centerPointY = centerY + adjustedRadius * Math.sin(angle);

      // Adjust for element dimensions to position top-left corner
      const elementX = centerPointX - (node.dimensions.width / 2);
      const elementY = centerPointY - (node.dimensions.height / 2);

      // Add this node to results
      positioned.push({
        ...node,
        position: { x: elementX, y: elementY }
      });

      // Calculate maximum dimension for this node to use as the node size
      const nodeSize = Math.max(node.dimensions.width, node.dimensions.height);
      
      // Calculate child radius based on number of children and their parent node size
      const childRadius = this.calculateNodeRadius(
        node.children.length,
        Math.max(...node.children.map(child =>Math.max(child.dimensions.width, child.dimensions.height)
        ) || [0]),
        nodeSize
      );

      // Position children around this node (which becomes their parent)
      if (node.children.length >0) {
        // For children, use this node's center point as their center
        const childPositions = this.positionNodes(
          node.children,
          centerPointX, // Use the exact center point of this node
          centerPointY,
          childRadius,
          angle,        // Pass the angle for rotation reference
          node          // Pass this node as the parent
        );
        positioned.push(...childPositions);
      }
    });

    return positioned;
  }

  async distribute(elements: LayoutElement[], config: CircularLayoutConfig): Promise<LayoutElement[]>{
    if (!elements.length) {
      return [];
    }

    try {
      logger.debug('Starting hierarchical distribution', { 
        elementCount: elements.length
      }, 'layout-distribution circular-layout');

      // Build hierarchy
      const rootNodes = this.buildHierarchy(elements);
      logger.debug('Hierarchy built', {
        rootNodeCount: rootNodes.length
      }, 'layout-distribution circular-layout hierarchy');

      // Find maximum element size for radius calculation
      const maxElementSize = Math.max(...elements.map(el =>Math.max(el.dimensions.width, el.dimensions.height)
      ));

      // Calculate initial radius for root nodes
      const radius = this.calculateNodeRadius(
        rootNodes.length,
        maxElementSize
      );

      // Position all nodes starting from center
      const centerX = config.screenBounds.width / 2;
      const centerY = config.screenBounds.height / 2;

      const positioned = this.positionNodes(
        rootNodes, 
        centerX, 
        centerY, 
        radius, 
        0,           // Start from right (0 radians) instead of top
        null         // No parent for root nodes
      );

      logger.debug('Layout distribution completed', {
        totalPositioned: positioned.length,
        maxElementSize,
        calculatedRadius: radius,
        screenBounds: config.screenBounds
      }, 'layout-distribution circular-layout completion');

      return positioned;
    } catch (error) {
      logger.error('Failed to distribute elements', { 
        error: error instanceof Error ? error.message : String(error)
      }, 'layout-distribution circular-layout error');
      throw new Error('Failed to distribute elements');
    }
  }
}

export const createCircularLayoutManager = (): CircularLayoutManager =>{
  return new CircularLayoutManagerImpl();
};
