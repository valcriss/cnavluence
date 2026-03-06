import { VersionReason } from '../../lib/prisma-enums.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { createVersionIfChanged } from './version.service.js';
import { applyVersionRetention } from './version-retention.js';

let timer: NodeJS.Timeout | null = null;
let retentionRunning = false;
let lastRetentionRunAt = 0;

export function startVersionScheduler(): void {
  if (timer || env.NODE_ENV === 'test') {
    return;
  }

  timer = setInterval(async () => {
    const pages = await prisma.page.findMany({
      where: { archived: false },
      select: { id: true },
    });

    for (const page of pages) {
      await createVersionIfChanged({
        pageId: page.id,
        reason: VersionReason.AUTO_TIMER,
      });
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (!retentionRunning && now - lastRetentionRunAt >= dayMs) {
      retentionRunning = true;
      try {
        await applyVersionRetention();
        lastRetentionRunAt = now;
      } finally {
        retentionRunning = false;
      }
    }
  }, env.VERSION_TIMER_MINUTES * 60 * 1000);
}

export function stopVersionScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
