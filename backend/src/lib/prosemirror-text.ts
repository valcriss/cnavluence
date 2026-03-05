export function extractTextFromProseMirror(content: unknown): string {
  const chunks: string[] = [];

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const typedNode = node as { text?: unknown; content?: unknown[] };
    if (typeof typedNode.text === 'string') {
      chunks.push(typedNode.text);
    }

    if (Array.isArray(typedNode.content)) {
      typedNode.content.forEach((child) => walk(child));
    }
  };

  walk(content);
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}
