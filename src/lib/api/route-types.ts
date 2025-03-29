/**
 * Type definitions for Next.js API routes
 */

/**
 * Context object passed to route handlers with dynamic parameters
 */
export interface RouteContext<P = Record<string, string>> {
  /**
   * Route parameters extracted from the URL
   */
  params: P;
}

/**
 * Route parameters for routes with an ID parameter
 */
export interface IdParams {
  id: string;
}

/**
 * Route context with an ID parameter
 */
export type IdRouteContext = RouteContext<IdParams>;

/**
 * Route parameters for routes with a taskId parameter
 */
export interface TaskIdParams {
  taskId: string;
}

/**
 * Route context with a taskId parameter
 */
export type TaskIdRouteContext = RouteContext<TaskIdParams>;
