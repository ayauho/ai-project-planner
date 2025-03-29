'use client';

import { Selection } from 'd3-selection';
import { select } from 'd3-selection';
import { logger } from '@/lib/client/logger';
import { Rectangle, getCenter, getIntersection, Point } from '../utils/geometry';
import { easeCubicInOut } from 'd3-ease';

// Connection marker configuration - enhanced styling
const CIRCLE_MARKER = {
  radius: 4,
  fill: '#64748b',
  stroke: '#ffffff',
  strokeWidth: 1
};

/**
 * Creates a curved path between two points
 */
function createCurvedPath(start: Point, end: Point): string {
  const pathPoints: string[] = [];
  
  // Start point
  pathPoints.push(`M${start.x},${start.y}`);
  
  // Create a curve with control points
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const controlX1 = start.x + dx / 3;
  const controlY1 = start.y + dy / 3;
  const controlX2 = start.x + dx * 2 / 3;
  const controlY2 = start.y + dy * 2 / 3;
  
  // Add curve
  pathPoints.push(`C${controlX1},${controlY1} ${controlX2},${controlY2} ${end.x},${end.y}`);
  
  return pathPoints.join(' ');
}

class ConnectionDrawer {
  private static instance: ConnectionDrawer;
  private readonly animationDuration: number = 500;
  private readonly animationClass: string = 'connection-line';

  private constructor() {}

  public static getInstance(): ConnectionDrawer {
    if (!ConnectionDrawer.instance) {
      ConnectionDrawer.instance = new ConnectionDrawer();
    }
    return ConnectionDrawer.instance;
  }

  /**
   * Draw a connection between two rectangles
   */
  public drawConnection(
    layer: Selection<SVGGElement, unknown, null, undefined> | null,
    fromRect: Rectangle,
    toRect: Rectangle,
    opacity: number = 1.0,
    zIndex: number = 1,
    animate: boolean = false
  ): SVGPathElement | null {
    try {
      if (!layer || layer.empty()) {
        return null;
      }
      
      const fromCenter = getCenter(fromRect);
      const toCenter = getCenter(toRect);
      
      // Calculate intersection with the target rectangle
      const endPoint = getIntersection(
        fromCenter.x, fromCenter.y,
        toCenter.x, toCenter.y,
        toRect.x, toRect.y,
        toRect.width, toRect.height
      ) || toCenter;
      
      // Calculate intersection with the source rectangle
      const startPoint = getIntersection(
        toCenter.x, toCenter.y,
        fromCenter.x, fromCenter.y,
        fromRect.x, fromRect.y,
        fromRect.width, fromRect.height
      ) || fromCenter;
      
      // Create a path
      const pathData = createCurvedPath(startPoint, endPoint);
      
      // Generate a connection ID
      const fromId = `${Math.round(fromRect.x)}-${Math.round(fromRect.y)}`;
      const toId = `${Math.round(toRect.x)}-${Math.round(toRect.y)}`;
      const connectionId = `connection-${fromId}-to-${toId}`;
      const connectionGroupId = `connection-group-${fromId}-to-${toId}`;
      
      // Remove any existing connection with the same ID
      layer.select(`#${connectionGroupId}`).remove();
      
      // Create a group for the connection (path + marker)
      const connectionGroup = layer.append('g')
        .attr('id', connectionGroupId)
        .attr('class', 'connection-group')
        .style('opacity', 0);
      
      // Get the initial path string ahead of time to avoid 'this' context issues
      const initialPathString = `M${startPoint.x},${startPoint.y} C${startPoint.x},${startPoint.y} ${startPoint.x},${startPoint.y} ${startPoint.x},${startPoint.y}`;

      // Create the path
      const path = connectionGroup.append('path')
        .attr('id', connectionId)
        .attr('class', this.animationClass)
        .attr('d', animate ? initialPathString : pathData)
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr('data-start-x', startPoint.x)
        .attr('data-start-y', startPoint.y)
        .attr('data-end-x', endPoint.x)
        .attr('data-end-y', endPoint.y)
        .style('z-index', zIndex)
        .style('pointer-events', 'none');
      
      // Create the end marker (circle)
      const marker = connectionGroup.append('circle')
        .attr('class', 'connection-marker')
        .attr('cx', endPoint.x)
        .attr('cy', endPoint.y)
        .attr('r', CIRCLE_MARKER.radius)
        .attr('fill', CIRCLE_MARKER.fill)
        .attr('stroke', CIRCLE_MARKER.stroke)
        .attr('stroke-width', CIRCLE_MARKER.strokeWidth)
        .style('z-index', zIndex + 1)
        .style('pointer-events', 'none');
      
      // Animate to final state
      if (animate) {
        // Set initial positions
        connectionGroup.style('opacity', 0);
        path.attr('d', initialPathString);
        marker.attr('cx', startPoint.x).attr('cy', startPoint.y);
        
        // Add a small random delay for staggered animations
        const delay = Math.random() * 100;
        
        // Store the animation duration locally to avoid 'this' context issues
        const animDuration = this.animationDuration;
        
        // Animate to final state with smoother timing
        connectionGroup
          .transition()
          .duration(animDuration)
          .delay(delay)
          .ease(easeCubicInOut)
          .style('opacity', opacity);
          
        path
          .transition()
          .duration(animDuration)
          .delay(delay)
          .ease(easeCubicInOut)
          .attr('d', pathData);
          
        marker
          .transition()
          .duration(animDuration)
          .delay(delay)
          .ease(easeCubicInOut)
          .attr('cx', endPoint.x)
          .attr('cy', endPoint.y);
      } else {
        // Just set to final value
        connectionGroup
          .style('opacity', opacity);
      }
      
      return path.node() as SVGPathElement;
    } catch (error) {
      logger.error('Failed to draw connection', { error }, 'connection-drawer error');
      return null;
    }
  }

  /**
   * Update connection opacity
   */
  public updateConnectionOpacity(
    layer: Selection<SVGGElement, unknown, null, undefined> | null,
    elementId: string,
    opacity: number,
    animate: boolean = true
  ): void {
    try {
      if (!layer) return;
      
      // Get all connections
      const connections = layer.selectAll('.connection-group').nodes();
      
      // Manually iterate through connections to avoid D3 'this' context issues
      for (let i = 0; i < connections.length; i++) {
        const connection = connections[i];
        const path = select(connection).select('path');
        const id = path.attr('id') || '';
        
        // Only update connections for the specified element
        if (id.includes(elementId)) {
          if (animate) {
            select(connection)
              .transition()
              .duration(300)
              .style('opacity', opacity);
          } else {
            select(connection).style('opacity', opacity);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to update connection opacity', { elementId, error }, 'connection-drawer error');
    }
  }

  /**
   * Reanimate connections for a specific element
   */
  public reanimateConnections(
    layer: Selection<SVGGElement, unknown, null, undefined> | null,
    elementId: string
  ): void {
    try {
      if (!layer) return;
      
      logger.info('Reanimating connections for element', { elementId }, 'connection-drawer animation');
      
      // Store the animation duration locally to avoid 'this' context issues
      const animDuration = this.animationDuration;
      
      // Get all connections nodes
      const connections = layer.selectAll('.connection-group').nodes();
      const count = connections.length;
      
      logger.debug('Checking connections for reanimation', { count }, 'connection-drawer animation');
      
      let animatedCount = 0;
      
      // Manually loop through connections to avoid D3 'this' context issues
      for (let i = 0; i < connections.length; i++) {
        const connection = connections[i];
        const groupEl = select(connection);
        const pathEl = groupEl.select('path');
        const id = pathEl.attr('id') || '';
        
        // Only animate connections for the specified element
        if (id.includes(elementId)) {
          animatedCount++;
          const markerEl = groupEl.select('.connection-marker');
          
          // Get current opacity
          const currentOpacity = parseFloat(groupEl.style('opacity') || '1');
          
          // Get original start and end points from data attributes
          const startX = parseFloat(pathEl.attr('data-start-x') || '0');
          const startY = parseFloat(pathEl.attr('data-start-y') || '0');
          const endX = parseFloat(pathEl.attr('data-end-x') || '0');
          const endY = parseFloat(pathEl.attr('data-end-y') || '0');
          
          // Create the initial and final paths
          const start: Point = { x: startX, y: startY };
          const end: Point = { x: endX, y: endY };
          const initialPath = `M${start.x},${start.y} C${start.x},${start.y} ${start.x},${start.y} ${start.x},${start.y}`;
          const finalPath = createCurvedPath(start, end);
          
          // Reset path and marker to initial state
          groupEl.style('opacity', 0);
          pathEl.attr('d', initialPath);
          markerEl.attr('cx', start.x).attr('cy', start.y);
          
          // Add a small delay for staggered animation
          const delay = Math.random() * 100;
          
          // Animate to final state
          groupEl
            .transition()
            .duration(animDuration)
            .delay(delay)
            .ease(easeCubicInOut)
            .style('opacity', currentOpacity);
            
          pathEl
            .transition()
            .duration(animDuration)
            .delay(delay)
            .ease(easeCubicInOut)
            .attr('d', finalPath);
            
          markerEl
            .transition()
            .duration(animDuration)
            .delay(delay)
            .ease(easeCubicInOut)
            .attr('cx', end.x)
            .attr('cy', end.y);
        }
      }
      
      logger.debug('Reanimated connections', { animatedCount }, 'connection-drawer animation');
    } catch (error) {
      logger.error('Failed to reanimate connections', { elementId, error }, 'connection-drawer error');
    }
  }
}

export const connectionDrawer = ConnectionDrawer.getInstance();
