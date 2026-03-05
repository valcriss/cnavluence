import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';

export function shouldKeepVersion(params: {
  ageDays: number;
  isFirstOfDay: boolean;
  isFirstOfWeek: boolean;
}): boolean {
  if (params.ageDays <= env.VERSION_RETENTION_ALL_DAYS) {
    return true;
  }

  if (params.ageDays <= env.VERSION_RETENTION_ALL_DAYS + env.VERSION_RETENTION_DAILY_DAYS) {
    return params.isFirstOfDay;
  }

  if (params.ageDays <= env.VERSION_RETENTION_MAX_DAYS) {
    return params.isFirstOfWeek;
  }

  return false;
}

export type RetentionVersion = {
  id: string;
  createdAt: Date;
};

function isoWeekKey(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function selectVersionIdsToDelete(versions: RetentionVersion[], now: Date): string[] {
  const dayBuckets = new Set<string>();
  const weekBuckets = new Set<string>();
  const dayMs = 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];

  for (const version of versions) {
    const ageDays = Math.floor((now.getTime() - version.createdAt.getTime()) / dayMs);
    const dayKey = version.createdAt.toISOString().slice(0, 10);
    const weekKey = isoWeekKey(version.createdAt);
    const isFirstOfDay = !dayBuckets.has(dayKey);
    const isFirstOfWeek = !weekBuckets.has(weekKey);

    dayBuckets.add(dayKey);
    weekBuckets.add(weekKey);

    if (!shouldKeepVersion({ ageDays, isFirstOfDay, isFirstOfWeek })) {
      toDelete.push(version.id);
    }
  }

  return toDelete;
}

export async function applyVersionRetention(now: Date = new Date()): Promise<number> {
  const pages = await prisma.page.findMany({ select: { id: true } });
  let deletedCount = 0;

  for (const page of pages) {
    const versions = await prisma.pageVersion.findMany({
      where: { pageId: page.id },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!versions.length) {
      continue;
    }

    const toDelete = selectVersionIdsToDelete(versions, now);
    if (!toDelete.length) {
      continue;
    }

    const result = await prisma.pageVersion.deleteMany({
      where: { id: { in: toDelete } },
    });
    deletedCount += result.count;
  }

  return deletedCount;
}
