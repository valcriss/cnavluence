CREATE INDEX IF NOT EXISTS idx_page_title_fts
ON "Page"
USING GIN (to_tsvector('simple', coalesce("title", '')));

CREATE INDEX IF NOT EXISTS idx_pagecontent_text_fts
ON "PageContent"
USING GIN (to_tsvector('simple', coalesce("contentText", '')));

CREATE INDEX IF NOT EXISTS idx_page_updated_at_id
ON "Page" ("updatedAt" DESC, "id" DESC);
