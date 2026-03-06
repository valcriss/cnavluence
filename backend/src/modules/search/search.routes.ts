import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth } from '../auth/auth-middleware.js';
import { prisma } from '../../lib/prisma.js';
import { decodeCursor, encodeCursor } from '../../lib/cursor.js';

const searchSchema = z.object({
  q: z.string().min(1).max(120),
  spaceId: z.string().cuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(env.SEARCH_PAGE_SIZE),
  includeArchived: z.coerce.boolean().default(false),
});

export const searchRouter = Router();

searchRouter.get('/', requireAuth, async (req, res) => {
  const query = searchSchema.parse(req.query);
  const decodedCursor = decodeCursor(query.cursor);
  if (query.cursor && !decodedCursor) {
    res.status(400).json({ message: 'Invalid cursor' });
    return;
  }
  const cursorScore = decodedCursor?.score;

  const rows = (await prisma.$queryRaw`
    WITH base AS (
      SELECT
        p.id,
        p.title,
        p.slug,
        p."updatedAt",
        p."spaceId",
        s.key AS "spaceKey",
        s.name AS "spaceName",
        pc."contentText",
        sm.role AS "membershipRole",
        (
          setweight(to_tsvector('simple', coalesce(p.title, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(pc."contentText", '')), 'B')
        ) AS vector
      FROM "Page" p
      JOIN "Space" s ON s.id = p."spaceId"
      JOIN "SpaceMembership" sm
        ON sm."spaceId" = p."spaceId" AND sm."userId" = ${req.auth!.userId}
      LEFT JOIN "PageContent" pc ON pc."pageId" = p.id
      WHERE (${query.includeArchived} OR p.archived = false)
        AND (${query.spaceId ?? null}::text IS NULL OR p."spaceId" = ${query.spaceId ?? null})
    ),
    visible AS (
      SELECT b.*
      FROM base b
      WHERE
        NOT EXISTS (
          SELECT 1
          FROM "PageRestriction" r
          WHERE r."pageId" = b.id
            AND r.type = 'VIEW'
        )
        OR EXISTS (
          SELECT 1
          FROM "PageRestriction" r
          WHERE r."pageId" = b.id
            AND r.type = 'VIEW'
            AND (
              r."userId" = ${req.auth!.userId}
              OR (
                r.role IS NOT NULL
                AND (
                  CASE b."membershipRole"
                    WHEN 'SPACE_VIEWER' THEN 1
                    WHEN 'SPACE_EDITOR' THEN 2
                    WHEN 'SPACE_ADMIN' THEN 3
                  END
                ) >= (
                  CASE r.role
                    WHEN 'SPACE_VIEWER' THEN 1
                    WHEN 'SPACE_EDITOR' THEN 2
                    WHEN 'SPACE_ADMIN' THEN 3
                  END
                )
              )
            )
        )
    ),
    ranked AS (
      SELECT
        v.*,
        plainto_tsquery('simple', ${query.q}) AS query,
        (
          (
            ts_rank_cd(
              setweight(to_tsvector('simple', coalesce(v.title, '')), 'A'),
              plainto_tsquery('simple', ${query.q})
            ) * 2.5
          ) +
          (
            ts_rank_cd(
              setweight(to_tsvector('simple', coalesce(v."contentText", '')), 'B'),
              plainto_tsquery('simple', ${query.q})
            ) * 1.0
          ) +
          0.05 / (1 + GREATEST(EXTRACT(EPOCH FROM (NOW() - v."updatedAt")) / 86400, 0))
        )::double precision AS score
      FROM visible v
      WHERE v.vector @@ plainto_tsquery('simple', ${query.q})
    )
    SELECT
      r.id,
      r.title,
      r.slug,
      r."updatedAt",
      r."spaceId",
      r."spaceKey",
      r."spaceName",
      r.score,
      COALESCE(
        NULLIF(
          ts_headline(
            'simple',
            COALESCE(r."contentText", ''),
            r.query,
            'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=22,MinWords=8,FragmentDelimiter= ... '
          ),
          ''
        ),
        NULLIF(
          ts_headline(
            'simple',
            COALESCE(r.title, ''),
            r.query,
            'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=14,MinWords=4,FragmentDelimiter= ... '
          ),
          ''
        ),
        left(COALESCE(r."contentText", ''), 200),
        left(r.title, 200)
      ) AS snippet
    FROM ranked r
    WHERE (
      ${cursorScore ?? null}::double precision IS NULL
      OR r.score < ${cursorScore ?? null}::double precision
      OR (r.score = ${cursorScore ?? null}::double precision AND r."updatedAt" < ${decodedCursor?.createdAt ?? null}::timestamptz)
      OR (r.score = ${cursorScore ?? null}::double precision AND r."updatedAt" = ${decodedCursor?.createdAt ?? null}::timestamptz AND r.id < ${decodedCursor?.id ?? null}::text)
    )
    ORDER BY r.score DESC, r."updatedAt" DESC, r.id DESC
    LIMIT ${query.limit + 1}
  `) as Array<{
    id: string;
    title: string;
    slug: string;
    updatedAt: Date;
    spaceId: string;
    spaceKey: string;
    spaceName: string;
    score: number;
    snippet: string;
  }>;

  const hasMore = rows.length > query.limit;
  const data = rows.slice(0, query.limit);

  const items = data.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    updatedAt: row.updatedAt,
    space: {
      id: row.spaceId,
      key: row.spaceKey,
      name: row.spaceName,
    },
    snippet: row.snippet,
    canonicalUrl: `/space/${row.spaceKey}/pages/${row.id}-${row.slug}`,
  }));

  const last = data.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({
        createdAt: last.updatedAt.toISOString(),
        id: last.id,
        score: last.score,
      })
    : null;

  res.json({ items, nextCursor });
});
