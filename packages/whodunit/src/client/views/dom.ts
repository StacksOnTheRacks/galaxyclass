type Child = Node | string | null | undefined | false;

/** Tiny element builder: `true` attributes are set empty, `false`/`undefined` are skipped. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) {
      node.append(child);
    }
  }
  return node;
}

export function setText(node: Element, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/** Shows or hides a node without touching the rest of its attributes. */
export function show(node: HTMLElement, visible: boolean): void {
  if (node.hidden === visible) {
    node.hidden = !visible;
  }
}
