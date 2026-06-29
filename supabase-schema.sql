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

-- ============================================================
-- 2. 房间表
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  creator_token TEXT NOT NULL,
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
-- 7. RLS 策略
-- ============================================================
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE players        ENABLE ROW LEVEL SECURITY;

-- 公开读取 & 写入（内部工具，依赖应用层安全校验）
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY['users','rooms','room_members','lobby_items','lobby_comments','players'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public_access" ON %I', tbl);
    EXECUTE format('CREATE POLICY "public_access" ON %I FOR SELECT USING (true)', tbl);
    EXECUTE format('CREATE POLICY "public_insert" ON %I FOR INSERT WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "public_update" ON %I FOR UPDATE USING (true) WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "public_delete" ON %I FOR DELETE USING (true)', tbl);
  END LOOP;
END $$;

-- ============================================================
-- 8. Realtime 复制
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_items;
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
