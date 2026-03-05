import { prisma } from '../../lib/prisma.js';

const CUID_LIKE = /^c[a-z0-9]{8,24}$/;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractPageIdsFromString(value: string): string[] {
  const ids = new Set<string>();

  if (CUID_LIKE.test(value)) {
    ids.add(value);
  }

  const pagePathRegex = /\/pages\/(c[a-z0-9]{8,24})(?=[-/?#]|$)/g;
  for (const match of value.matchAll(pagePathRegex)) {
    if (match[1]) {
      ids.add(match[1]);
    }
  }

  const pageSchemeRegex = /page:\/\/(c[a-z0-9]{8,24})(?=[/?#]|$)/g;
  for (const match of value.matchAll(pageSchemeRegex)) {
    if (match[1]) {
      ids.add(match[1]);
    }
  }

  return [...ids];
}

export function extractLinkedPageIds(content: unknown): string[] {
  const collected = new Set<string>();
  const stack: unknown[] = [content];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    if (!isObjectRecord(current)) {
      continue;
    }

    const attrs = isObjectRecord(current.attrs) ? current.attrs : null;
    if (attrs) {
      if (typeof attrs.pageId === 'string' && CUID_LIKE.test(attrs.pageId)) {
        collected.add(attrs.pageId);
      }
      if (typeof attrs.href === 'string') {
        for (const id of extractPageIdsFromString(attrs.href)) {
          collected.add(id);
        }
      }
    }

    if (typeof current.text === 'string') {
      for (const id of extractPageIdsFromString(current.text)) {
        collected.add(id);
      }
    }

    for (const value of Object.values(current)) {
      if (typeof value === 'object' && value !== null) {
        stack.push(value);
      }
    }
  }

  return [...collected];
}

export async function syncBacklinksForPage(fromPageId: string, content: unknown): Promise<void> {
  const referencedIds = extractLinkedPageIds(content).filter((id) => id !== fromPageId);

  if (referencedIds.length === 0) {
    await prisma.linkIndex.deleteMany({ where: { fromPageId } });
    return;
  }

  const existingPages = await prisma.page.findMany({
    where: { id: { in: referencedIds }, archived: false },
    select: { id: true },
  });
  const validTargets = [...new Set(existingPages.map((page) => page.id))];

  await prisma.$transaction(async (tx) => {
    if (validTargets.length === 0) {
      await tx.linkIndex.deleteMany({ where: { fromPageId } });
      return;
    }

    await tx.linkIndex.deleteMany({
      where: {
        fromPageId,
        toPageId: { notIn: validTargets },
      },
    });

    for (const toPageId of validTargets) {
      await tx.linkIndex.upsert({
        where: {
          fromPageId_toPageId: {
            fromPageId,
            toPageId,
          },
        },
        update: {},
        create: {
          fromPageId,
          toPageId,
        },
      });
    }
  });
}
