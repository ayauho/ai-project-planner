/* global jest */
class MockSVGElement {
  constructor() {
    this.attributes = new Map();
    this.styles = new Map();
    this.children = [];
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  getBBox() {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
}

class MockSelection {
  constructor(element) {
    this.element = element || new MockSVGElement();
    this.empty = jest.fn(() => false);
    this.nodes = jest.fn(() => [{ textContent: 'mock text' }]);
    this.size = jest.fn(() => 2);
  }

  append(/* eslint-disable-line @typescript-eslint/no-unused-vars */ _type) {
    const newElement = new MockSVGElement();
    this.element.appendChild(newElement);
    return new MockSelection(newElement);
  }

  attr(name, value) {
    if (value !== undefined) {
      this.element.setAttribute(name, value);
    }
    return this;
  }

  style(name, value) {
    if (value !== undefined) {
      this.element.styles.set(name, value);
    }
    return this;
  }

  text(value) {
    if (value !== undefined) {
      this.element.textContent = value;
    }
    return this;
  }

  select(/* eslint-disable-line @typescript-eslint/no-unused-vars */ _selector) {
    return new MockSelection(new MockSVGElement());
  }

  selectAll(/* eslint-disable-line @typescript-eslint/no-unused-vars */ _selector) {
    return new MockSelection(new MockSVGElement());
  }

  transition() {
    return this;
  }

  duration() {
    return this;
  }
}

export { MockSVGElement, MockSelection };
