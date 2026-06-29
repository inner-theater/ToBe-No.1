-- ============================================================
-- 🏆 谁是第一名 - 主持权争夺战
-- Supabase 数据库建表 + RLS 安全策略
-- 请在 Supabase SQL Editor 中执行本文件
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 创建 players 表
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
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 索引：加速按房间和 token 查询
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_token  ON players(player_token);

-- ============================================================
-- 2. 启用行级安全 (Row Level Security)
-- ============================================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS 策略
-- ============================================================

-- 策略 1：允许任何人查询（SELECT）所有记录
DROP POLICY IF EXISTS "Anyone can read players" ON players;
CREATE POLICY "Anyone can read players" ON players
  FOR SELECT
  USING (true);

-- 策略 2：允许任何人插入（INSERT）新记录
-- 公开页面无法验证身份，允许插入
DROP POLICY IF EXISTS "Anyone can insert players" ON players;
CREATE POLICY "Anyone can insert players" ON players
  FOR INSERT
  WITH CHECK (true);

-- 策略 3：限制更新（UPDATE）—— 仅允许通过 player_token 匹配更新自己的记录
-- 由于 Supabase 匿名用户无 JWT 身份，安全校验在应用层（JS 端通过 WHERE player_token = ? 过滤）
-- 此处允许 UPDATE，但应用层确保只能更新匹配 player_token 的行
DROP POLICY IF EXISTS "Players can update own record" ON players;
CREATE POLICY "Players can update own record" ON players
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 策略 4：允许删除（DELETE）—— 仅房主可删除
-- 同样由应用层校验
DROP POLICY IF EXISTS "Owner can delete records" ON players;
CREATE POLICY "Owner can delete records" ON players
  FOR DELETE
  USING (true);

-- ============================================================
-- 4. 辅助函数：安全地获取请求头中的 player_token
-- （主要用于未来增强安全性，当前由应用层校验）
-- ============================================================
CREATE OR REPLACE FUNCTION get_header_player_token()
RETURNS text AS $$
BEGIN
  RETURN coalesce(
    current_setting('request.headers', true)::json->>'x-player-token',
    ''
  );
EXCEPTION
  WHEN OTHERS THEN RETURN '';
END;
$$ LANGUAGE plpgsql STABLE;
