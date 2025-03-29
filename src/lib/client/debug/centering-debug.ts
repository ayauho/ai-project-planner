'use client';

import { logger } from '@/lib/client/logger';

// Global debug state for project centering
export const centeringDebug = {
  enabled: false, // Disable debug mode now that centering issues are fixed
  steps: [] as string[],
  domState: {} as Record<string, unknown>,
  
  // Start debug session
  startDebug(projectId: string): void {
    if (!this.enabled) return;
    
    this.steps = [];
    this.domState = {};
    
    // Log start with timestamp and project ID
    const startTime = new Date().toISOString();
    this.logStep(`DEBUG START - Project centering for ${projectId} at ${startTime}`);
    
    // Add to window for console access
    (window as Window & { __centeringDebug?: typeof centeringDebug }).__centeringDebug = this;
    
    // Log to console for immediate feedback
    logger.info(`Starting project centering debug for ${projectId}`, {
      _style: 'background: #4b5563; color: #fff; padding: 4px 8px; border-radius: 4px;'
    }, 'debug centering');
  },
  
  // Log a step with timing
  logStep(step: string, data?: Record<string, unknown>): void {
    if (!this.enabled) return;
    
    const timestamp = Date.now();
    const formattedStep = `[${timestamp}] ${step}`;
    this.steps.push(formattedStep);
    
    // Only log critical issues in production mode
    if (step.includes('ERROR') || step.includes('FAILED')) {
      logger.warn(`CENTERING ISSUE: ${step}`, data || {}, 'debug centering-error');
    } else {
      // Debug logs only when enabled
      logger.debug(`DEBUG CENTERING: ${step}`, data || {}, 'debug centering');
    }
  },
  
  // Capture DOM state
  captureDOMState(_projectId: string): void {
    if (!this.enabled) return;
    
    try {
      // Capture SVG state
      const svg = document.querySelector('svg');
      const transformGroup = document.querySelector('.transform-group');
      
      // Project element
      const projectElement = document.getElementById(`project-${_projectId}`);
      
      this.domState = {
        timestamp: Date.now(),
        hasSVG: !!svg,
        svgDimensions: svg ? {
          width: svg.clientWidth,
          height: svg.clientHeight
        } : null,
        hasTransformGroup: !!transformGroup,
        transformValue: transformGroup ? transformGroup.getAttribute('transform') : null,
        hasProjectElement: !!projectElement,
        projectRect: projectElement ? projectElement.getBoundingClientRect() : null,
        svgRect: svg ? svg.getBoundingClientRect() : null,
        bodyClasses: document.body.className,
        activeFlags: {
          isCentering: document.body.classList.contains('is-centering'),
          newProject: document.body.classList.contains('centering-new-project'),
          centeringComplete: document.body.classList.contains('centering-complete')
        }
      };
      
      this.logStep('DOM state captured', this.domState);
    } catch (error) {
      this.logStep('Error capturing DOM state', { error });
    }
  },
  
  // End debug session and report
  endDebug(): void {
    if (!this.enabled) return;
    
    const endTime = new Date().toISOString();
    this.logStep(`DEBUG END - Project centering completed at ${endTime}`);
    
    // Calculate total duration
    const startTimestamp = parseInt(this.steps[0]?.match(/\[(\d+)\]/)?.[1] || '0');
    const endTimestamp = Date.now();
    const duration = endTimestamp - startTimestamp;
    
    // Final report - only log basic info in production
    const basicReport = {
      duration: `${duration}ms`,
      totalSteps: this.steps.length
    };
    
    logger.debug('Project centering complete', basicReport, 'debug centering');
    
    // Detailed report only logged when debug enabled
    if (this.enabled) {
      const fullReport = {
        ...basicReport,
        finalDOMState: this.domState,
        allSteps: this.steps
      };
      
      logger.info('Project centering debug report', fullReport, 'debug centering-report');
      
      // Keep in window for later inspection
      (window as Window & { __centeringDebugReport?: unknown }).__centeringDebugReport = fullReport;
    }
  }
};

// Debug wrapper for function calls
export function withCenteringDebug<T>(
  fn: () => T, 
  stepName: string, 
  _projectId?: string // Prefix with underscore to indicate intentionally unused parameter
): T {
  if (!centeringDebug.enabled) return fn();
  
  centeringDebug.logStep(`START: ${stepName}`);
  
  try {
    const result = fn();
    
    // Handle promises
    if (result instanceof Promise) {
      return result
        .then(value => {
          centeringDebug.logStep(`SUCCESS: ${stepName}`);
          return value;
        })
        .catch(error => {
          centeringDebug.logStep(`ERROR: ${stepName}`, { error });
          throw error;
        }) as unknown as T;
    }
    
    centeringDebug.logStep(`COMPLETE: ${stepName}`);
    return result;
  } catch (error) {
    centeringDebug.logStep(`ERROR: ${stepName}`, { error });
    throw error;
  }
}
