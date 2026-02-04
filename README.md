# 🌸 AI 產文系統

通用的 AI 文章產生系統，支援多網站、多用戶、權限管理。

## 功能

- 🔐 登入系統（Supabase Auth）
- 🌐 多網站管理
- 👥 權限管理（Admin / Editor）
- 🔍 AI 關鍵字規劃
- ✏️ AI 標題生成（可編輯）
- 📄 批量產生文章
- 🖼️ 自動 Pexels 找圖
- 📤 多種上傳方式：
  - 下載 Markdown
  - 推送到 GitHub
  - 存到 Supabase

## 安全

- API Key 存在 Vercel 環境變數，前端看不到
- 員工只能操作有權限的網站
- GitHub Token 存在 Supabase，按網站分開

---

## 部署步驟

### 1. 建立 Supabase 專案

1. 前往 https://supabase.com/dashboard
2. 建立新專案
3. 執行 `supabase-schema.sql` 建立資料表
4. 取得：
   - Project URL
   - anon public key
   - service_role key（Settings → API）

### 2. 建立用戶

1. Supabase → Authentication → Users → Add user
2. 建立你的管理員帳號

### 3. 新增網站和權限

在 Supabase SQL Editor 執行：

```sql
-- 新增網站
INSERT INTO sites (name, slug, github_repo, github_path) VALUES 
('媽咪小編', 'mommystartup', 'your-username/mommystartup-astro', 'src/content/posts/');

-- 給你的帳號 Admin 權限
INSERT INTO user_sites (user_id, site_id, role)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'your@email.com'),
  (SELECT id FROM sites WHERE slug = 'mommystartup'),
  'admin';
```

### 4. 部署到 Vercel

```bash
# 安裝 Vercel CLI
npm i -g vercel

# 登入
vercel login

# 部署
vercel

# 設定環境變數
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_KEY
vercel env add OPENAI_API_KEY
vercel env add PEXELS_API_KEY

# 重新部署
vercel --prod
```

### 5. 設定自訂網域（可選）

1. Vercel Dashboard → 你的專案 → Settings → Domains
2. 新增 `ai-writer.你的網域.com`
3. 在 DNS 加入 CNAME 記錄

---

## 新增員工帳號

1. Supabase → Authentication → Users → Add user
2. 輸入員工 Email 和密碼
3. SQL Editor 執行：

```sql
-- 給員工特定網站的編輯權限
INSERT INTO user_sites (user_id, site_id, role)
SELECT 
  (SELECT id FROM auth.users WHERE email = 'employee@email.com'),
  (SELECT id FROM sites WHERE slug = 'mommystartup'),
  'editor';
```

---

## 新增網站

```sql
-- 1. 新增網站
INSERT INTO sites (name, slug, github_repo, github_path, created_by) VALUES 
('新網站名稱', 'new-site', 'username/repo-name', 'src/content/posts/', 'YOUR_USER_ID');

-- 2. 給自己 Admin 權限
INSERT INTO user_sites (user_id, site_id, role)
SELECT 
  'YOUR_USER_ID',
  (SELECT id FROM sites WHERE slug = 'new-site'),
  'admin';
```

---

## 使用流程

### 線上產文
1. 登入 https://ai-writer.你的網域.com
2. 選擇網站
3. 產生關鍵字 → 生成標題 → 批量產文
4. 選擇上傳方式

### 本地產文（聖經網站模式）
1. 線上產文 → 下載 Markdown
2. 放到本地專案的 `src/content/posts/`
3. `git add . && git commit -m "add articles" && git push`
4. Vercel 自動部署

---

## 環境變數說明

| 變數 | 說明 | 取得方式 |
|------|------|----------|
| SUPABASE_URL | Supabase 專案 URL | Dashboard → Settings → API |
| SUPABASE_ANON_KEY | 公開 Key | 同上 |
| SUPABASE_SERVICE_KEY | 服務 Key（有完整權限）| 同上 |
| OPENAI_API_KEY | OpenAI API Key | https://platform.openai.com/api-keys |
| PEXELS_API_KEY | Pexels API Key（免費）| https://www.pexels.com/api/ |

---

## 費用

| 項目 | 費用 |
|------|------|
| Vercel Hobby | $0 |
| Supabase Free | $0 |
| OpenAI | ~$0.02/篇 |
| Pexels | $0 |

**一週 7 篇 ≈ $0.15 ≈ NT$5**

---

## 常見問題

**Q: 員工會看到 API Key 嗎？**
A: 不會。API Key 在 Vercel 環境變數，前端完全看不到。

**Q: 可以同時多人使用嗎？**
A: 可以。每個人登入自己的帳號。

**Q: 文章存在哪裡？**
A: 可選擇存到 Supabase 或推送到 GitHub。

**Q: 如果想用本地寫文章？**
A: 直接在本地寫 Markdown，推送到 GitHub 即可。
