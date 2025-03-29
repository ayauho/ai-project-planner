export function setupSvgContainer(): SVGGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  // Create mock SVG point with full DOMPoint interface
  const mockPoint: DOMPoint = {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
    matrixTransform: (_matrix?: DOMMatrix) => mockPoint,
    toJSON: () => ({ x: 0, y: 0, z: 0, w: 1 })
  };

  // Define SVG point method
  svg.createSVGPoint = () => mockPoint;

  // Set ownerSVGElement using Object.defineProperty
  Object.defineProperty(group, 'ownerSVGElement', {
    value: svg,
    configurable: true
  });

  svg.appendChild(group);
  document.body.appendChild(svg);

  return group;
}

export function cleanupSvgContainer() {
  const svg = document.querySelector('svg');
  if (svg) {
    document.body.removeChild(svg);
  }
}
