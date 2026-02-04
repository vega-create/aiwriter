-- ============================================
-- 通用產文系統 + 商品管理 Supabase Schema
-- ============================================

-- 啟用 UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 網站管理
-- ============================================
CREATE TABLE sites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,                    -- 網站名稱（媽咪小編）
  slug TEXT UNIQUE NOT NULL,             -- 網站代碼（mommystartup）
  domain TEXT,                           -- 網域（mommystartup.com）
  description TEXT,
  
  -- GitHub 自動部署設定
  github_repo TEXT,                      -- username/repo
  github_branch TEXT DEFAULT 'main',
  github_path TEXT DEFAULT 'src/content/posts/',
  
  -- 分類設定
  categories JSONB DEFAULT '[]',         -- ["行銷", "團購", "育兒"]
  
  -- Prompt 設定
  system_prompt TEXT,                    -- 該網站專用的 AI prompt
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 預設網站資料
INSERT INTO sites (name, slug, domain, categories, system_prompt) VALUES
('媽咪小編', 'mommystartup', 'mommystartup.com', 
 '["行銷", "團購", "育兒"]',
 '你是一位專業的內容寫手，專門為台灣的媽媽族群撰寫實用文章。寫作風格親切友善，像閨蜜聊天。'),
('聖經靈修', 'bible', 'bible.freshblogs.cc',
 '["信仰問答", "經文解釋", "生活應用"]',
 '你是一位資深的聖經教師，用溫暖易懂的方式解釋聖經真理。');

-- ============================================
-- 2. 用戶權限
-- ============================================
CREATE TABLE user_sites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',   -- admin, editor
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, site_id)
);

-- ============================================
-- 3. 文章（所有網站共用）
-- ============================================
CREATE TABLE posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  content TEXT,                          -- Markdown 內容
  
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  
  image TEXT,
  image_alt TEXT,
  
  status TEXT DEFAULT 'draft',           -- draft, review, published
  
  author TEXT DEFAULT '編輯團隊',
  publish_date DATE,
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(site_id, slug)
);

-- ============================================
-- 4. 商品（mommystartup /shop 用）
-- ============================================
CREATE TABLE products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  image TEXT,
  link TEXT,
  
  badge TEXT,                            -- 熱銷, 新品, 限時
  cta_text TEXT DEFAULT '立即選購',
  
  is_hero BOOLEAN DEFAULT FALSE,
  hero_images TEXT[],
  end_date TIMESTAMPTZ,
  
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 索引
-- ============================================
CREATE INDEX idx_posts_site ON posts(site_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_products_site ON products(site_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_user_sites_user ON user_sites(user_id);

-- ============================================
-- 6. RLS 政策
-- ============================================
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 網站：登入用戶可讀取有權限的網站
CREATE POLICY "Users can view their sites" ON sites
  FOR SELECT USING (
    id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())
  );

-- 用戶權限：只能看自己的
CREATE POLICY "Users can view own permissions" ON user_sites
  FOR SELECT USING (user_id = auth.uid());

-- 文章：可讀取/編輯有權限網站的文章
CREATE POLICY "Users can view site posts" ON posts
  FOR SELECT USING (
    site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert posts" ON posts
  FOR INSERT WITH CHECK (
    site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update posts" ON posts
  FOR UPDATE USING (
    site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete posts" ON posts
  FOR DELETE USING (
    site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())
  );

-- 商品：公開讀取（前台用）
CREATE POLICY "Anyone can view active products" ON products
  FOR SELECT USING (is_active = true);

-- 商品：登入用戶可編輯有權限網站的商品
CREATE POLICY "Users can manage site products" ON products
  FOR ALL USING (
    site_id IN (SELECT site_id FROM user_sites WHERE user_id = auth.uid())
  );

-- ============================================
-- 7. 自動更新 updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 8. Storage Bucket（在 Dashboard 手動建立）
-- ============================================
-- images - 公開讀取的圖片 bucket
-- 1. Dashboard → Storage → New bucket
-- 2. Name: images
-- 3. Public bucket: ✓
-- 4. Policies: 
--    - SELECT: public
--    - INSERT: authenticated
--    - DELETE: authenticated

-- ============================================
-- 完成後記得：
-- 1. 在 Authentication → Users 建立你的帳號
-- 2. 執行下方 SQL 給自己 Admin 權限
-- ============================================

-- 給你的帳號 Admin 權限（替換 your@email.com）
-- INSERT INTO user_sites (user_id, site_id, role)
-- SELECT 
--   (SELECT id FROM auth.users WHERE email = 'your@email.com'),
--   id,
--   'admin'
-- FROM sites;

-- 給員工特定網站的 Editor 權限
-- INSERT INTO user_sites (user_id, site_id, role)
-- SELECT 
--   (SELECT id FROM auth.users WHERE email = 'employee@email.com'),
--   (SELECT id FROM sites WHERE slug = 'mommystartup'),
--   'editor';
