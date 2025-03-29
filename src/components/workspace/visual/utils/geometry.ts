'use client';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  isNewProject?: boolean;
  isPostDeletion?: boolean;
  radicalCentering?: boolean;
  svgWidth?: number;
  svgHeight?: number;
}

export interface Point {
  x: number;
  y: number;
}

export function getIntersection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number
): Point | null {
  try {
    // Safety check for invalid inputs
    if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY) ||
        isNaN(rectX) || isNaN(rectY) || isNaN(rectWidth) || isNaN(rectHeight)) {
      console.warn('Invalid coordinates in getIntersection', {
        startPoint: {x: startX, y: startY},
        endPoint: {x: endX, y: endY},
        rectangle: {x: rectX, y: rectY, width: rectWidth, height: rectHeight}
      });
      return null;
    }

    // Handle purely vertical lines
    if (Math.abs(endX - startX) < 0.001) {
      const x = startX;
      let y;

      if (startY < endY) {
        y = rectY;
      } else {
        y = rectY + rectHeight;
      }

      if (x >= rectX && x <= rectX + rectWidth) {
        return { x, y };
      }
      return null;
    }

    // Handle purely horizontal lines
    if (Math.abs(endY - startY) < 0.001) {
      const y = startY;
      let x;

      if (startX < endX) {
        x = rectX;
      } else {
        x = rectX + rectWidth;
      }

      if (y >= rectY && y <= rectY + rectHeight) {
        return { x, y };
      }
      return null;
    }

    // For all other angles
    const slope = (endY - startY) / (endX - startX);
    const intercept = startY - slope * startX;

    // Get all possible intersection points
    const points = [];

    // Left edge
    const leftY = slope * rectX + intercept;
    if (leftY >= rectY && leftY <= rectY + rectHeight) {
      points.push({ x: rectX, y: leftY });
    }

    // Right edge
    const rightY = slope * (rectX + rectWidth) + intercept;
    if (rightY >= rectY && rightY <= rectY + rectHeight) {
      points.push({ x: rectX + rectWidth, y: rightY });
    }

    // Top edge
    const topX = (rectY - intercept) / slope;
    if (topX >= rectX && topX <= rectX + rectWidth) {
      points.push({ x: topX, y: rectY });
    }

    // Bottom edge
    const bottomX = (rectY + rectHeight - intercept) / slope;
    if (bottomX >= rectX && bottomX <= rectX + rectWidth) {
      points.push({ x: bottomX, y: rectY + rectHeight });
    }

    // Return the point closest to start
    if (points.length === 0) return null;

    let closestPoint = points[0];
    let minDistance = Math.hypot(closestPoint.x - startX, closestPoint.y - startY);

    for (const point of points) {
      const distance = Math.hypot(point.x - startX, point.y - startY);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    return closestPoint;
  } catch (error) {
    console.error('Error in getIntersection calculation', error);
    return null;
  }
}

export function getCenter(rect: Rectangle): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}
