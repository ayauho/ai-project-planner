'use client';
import { Selection } from 'd3-selection';
import { logger } from '@/lib/client/logger';
import { useTaskOperations } from '@/components/workspace/hooks/useTaskOperations';
import { ControlLayer } from '../layers/control-layer';
import { svgOrderManager } from '@/lib/client/visual/utils/svg-order';
import { overlapDetector } from '../utils/overlap-detector';

type Handlers = {
  split: (event: { elementId: string }) => Promise<void>;
  regenerate?: (event: { elementId: string }) => Promise<void>;
  delete?: (event: { elementId: string }) => Promise<void>;
};

export interface Layers {
  base: Selection<SVGGElement, unknown, null, undefined>;
  connections: Selection<SVGGElement, unknown, null, undefined>;
  content: Selection<SVGGElement, unknown, null, undefined>;
  controls: ControlLayer;
}

class LayerManager {
  private static instance: LayerManager;
  private layers: Layers | null = null;
  private transformGroup: Selection<SVGGElement, unknown, null, undefined> | null = null;
  private pendingTransforms: string[] = []; // Queue to store pending transforms

  private constructor() {}

  public static getInstance(): LayerManager {
    if (!LayerManager.instance) {
      LayerManager.instance = new LayerManager();
    }
    return LayerManager.instance;
  }

  initialize(
    svg: Selection<SVGSVGElement, unknown, null, undefined>,
    handlers: Handlers,
    taskOperations: ReturnType<typeof useTaskOperations>
  ): Layers | null {
    try {
      logger.debug('Initializing SVG layers', {}, 'layer-manager init');
      
      // Always cleanup before initialization
      this.dispose();

      // Create a single transform group for all layers
      this.transformGroup = svg.append('g')
        .attr('class', 'transform-group')
        .attr('transform', '');

      if (!this.transformGroup) {
        throw new Error('Failed to create transform group');
      }

      // Create layers inside transform group in the correct stacking order:
      // 1. Base (background)
      // 2. Connections (arrows)
      // 3. Content (tasks)
      // 4. Controls (buttons)
      const base = this.transformGroup.append('g').attr('class', 'layer-base');
      const connections = this.transformGroup.append('g').attr('class', 'layer-connections');
      const content = this.transformGroup.append('g').attr('class', 'layer-content');
      const controlsGroup = this.transformGroup.append('g').attr('class', 'layer-controls');

      // Initialize control layer with task operations
      const controls = new ControlLayer(
        'controls',
        controlsGroup,
        handlers,
        taskOperations
      );

      this.layers = {
        base,
        connections,
        content,
        controls
      };

      // Clear order manager when layers are initialized
      svgOrderManager.clear();
      overlapDetector.clear();

      // Apply any pending transforms that were queued before initialization
      if (this.pendingTransforms.length > 0) {
        logger.debug(`Applying ${this.pendingTransforms.length} pending transforms`, {}, 'layer-manager transform');
        const lastTransform = this.pendingTransforms[this.pendingTransforms.length - 1];
        this.transformGroup.attr('transform', lastTransform);
        this.pendingTransforms = []; // Clear the queue
      }

      return this.layers;
    } catch (error) {
      logger.error('Failed to initialize layers', { error }, 'layer-manager error');
      return null;
    }
  }

  clearLayers(): void {
    try {
      if (this.layers) {
        logger.debug('Clearing layer contents', {}, 'layer-manager cleanup');
        
        // Clear all elements from each layer
        this.layers.connections.selectAll('*').remove();
        this.layers.content.selectAll('*').remove();
        this.layers.base.selectAll('*').remove();
        
        // Let control layer handle its own cleanup
        this.layers.controls.dispose();
        
        // Clear order manager and overlap detector
        svgOrderManager.clear();
        overlapDetector.clear();
      }
    } catch (error) {
      logger.error('Failed to clear layers', { error }, 'layer-manager error');
    }
  }

  updateTransform(transform: string): void {
    try {
      if (!this.transformGroup) {
        // Instead of warning, queue the transform to be applied when transform group is ready
        logger.debug('Transform group not initialized yet, queueing transform', { transform }, 'layer-manager transform');
        this.pendingTransforms.push(transform);
        return;
      }
      
      // Apply the transform
      this.transformGroup.attr('transform', transform);
    } catch (error) {
      logger.error('Failed to update layer transforms', { error }, 'layer-manager error');
    }
  }

  dispose(): void {
    logger.debug('Disposing layer manager', {}, 'layer-manager cleanup');
    
    if (this.layers) {
      try {
        // Clear contents of all layers first
        this.clearLayers();
        
        // Remove the transform group entirely
        if (this.transformGroup) {
          this.transformGroup.remove();
          this.transformGroup = null;
        }
        
        this.layers = null;
      } catch (error) {
        logger.error('Error disposing layers', { error }, 'layer-manager error');
      }
    }
  }

  getLayers(): Layers | null {
    return this.layers;
  }
}

export const layerManager = LayerManager.getInstance();
