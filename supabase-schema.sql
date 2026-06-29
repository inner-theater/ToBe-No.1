-- ============================================================
--   谁是第一名 — 完整数据库 Schema
--   请在 Supabase SQL Editor 一次性执行
-- ============================================================

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 用户表（大厅用）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname     TEXT NOT NULL,
  avatar_b64   TEXT DEFAULT '',
  player_token TEXT NOT NULL UNIQUE,
  is_online    BOOLEAN DEFAULT false,
  last_seen    TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(player_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);

-- ============================================================
-- 2. 房间表
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  creator_token TEXT NOT NULL,
  password     TEXT DEFAULT '',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_active ON rooms(is_active);

-- ============================================================
-- 3. 房间成员
-- ============================================================
CREATE TABLE IF NOT EXISTS room_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_token   TEXT NOT NULL,
  is_owner     BOOLEAN DEFAULT false,
  joined_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rm_room ON room_members(room_id);

-- ============================================================
-- 4. 大厅互动（扔道具）
-- ============================================================
CREATE TABLE IF NOT EXISTS lobby_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_token   TEXT NOT NULL,
  to_token     TEXT NOT NULL,
  item_type    TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. 大厅弹幕 / 评论
-- ============================================================
CREATE TABLE IF NOT EXISTS lobby_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_token   TEXT NOT NULL,
  comment      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. 游戏玩家表
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  player_token  TEXT NOT NULL DEFAULT '',
  click_count   INTEGER DEFAULT 0,
  buff          TEXT DEFAULT '',
  final_score   INTEGER DEFAULT 0,
  is_finished   BOOLEAN DEFAULT false,
  is_owner      BOOLEAN DEFAULT false,
  game_started  BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_token, room_id)
);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_token  ON players(player_token);

-- ============================================================
-- 7. 游戏历史记录
-- ============================================================
CREATE TABLE IF NOT EXISTS game_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name      TEXT NOT NULL,
  room_id        UUID NOT NULL,
  players_json   TEXT NOT NULL,
  loser          TEXT NOT NULL,
  loser_nickname TEXT DEFAULT '',
  played_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gh_room ON game_history(room_id);

-- ============================================================
-- 8. RLS 策略（幂等，可安全重复执行）
-- ============================================================

-- 公开读取 & 写入（幂等，可重复执行）
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY['users','rooms','room_members','lobby_items','lobby_comments','players','game_history'])
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    EXECUTE format('DROP POLICY IF EXISTS "public_access" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_insert" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_update" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "public_delete" ON %I', tbl);
    EXECUTE format('CREATE POLICY "public_access" ON %I FOR SELECT USING (true)', tbl);
    EXECUTE format('CREATE POLICY "public_insert" ON %I FOR INSERT WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "public_update" ON %I FOR UPDATE USING (true) WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "public_delete" ON %I FOR DELETE USING (true)', tbl);
  END LOOP;
END $$;

-- ============================================================
-- 9. 房间数据自动清理（最后一人离开后删除房间）
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_empty_rooms()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = OLD.room_id) THEN
    DELETE FROM rooms WHERE id = OLD.room_id;
    DELETE FROM players WHERE room_id = OLD.room_id::text;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_room ON room_members;
CREATE TRIGGER trg_cleanup_room
AFTER DELETE ON room_members
FOR EACH ROW EXECUTE FUNCTION cleanup_empty_rooms();

-- ============================================================
-- 8. Realtime 复制（幂等，可重复执行）
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','rooms','lobby_items','lobby_comments','room_members','players','game_history']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;
