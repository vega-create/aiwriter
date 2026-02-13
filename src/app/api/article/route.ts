import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ExistingArticle {
  title: string;
  slug: string;
  url: string;
}

// Random name pool - categorized to avoid repetition
const FEMALE_NAMES = [
  '雅琪', '佩珊', '怡君', '婉如', '淑芬', '詩涵', '筱婷', '佳穎',
  '欣怡', '雅雯', '芷瑄', '宜蓁', '品妤', '羽彤', '思妤', '子晴',
  '沛蓉', '映彤', '亭瑤', '芸安', '靜宜', '惠如', '雅萍', '秀娟',
  '玉華', '麗君', '慧玲', '美玲', '素梅', '淑惠', '雅婷', '韻如',
];
const MALE_NAMES = [
  '志豪', '家豪', '建宏', '俊傑', '宗翰', '柏翰', '冠廷', '承恩',
  '彥廷', '宥辰', '晨皓', '柏睿', '翊安', '品叡', '宇恆', '紹恩',
  '國華', '明哲', '文彬', '信宏', '啟明', '振宇', '嘉偉', '育誠',
  '泓毅', '哲瑋', '庭瑋', '睿杰', '晉豪', '威廷', '峻維', '聖恩',
];

// Pick random non-repeating names
function getRandomNames(count: number = 3): string {
  const shuffledF = [...FEMALE_NAMES].sort(() => Math.random() - 0.5);
  const shuffledM = [...MALE_NAMES].sort(() => Math.random() - 0.5);
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(i % 2 === 0 ? shuffledF[i] : shuffledM[i]);
  }
  return picked.join('、');
}

// Site-specific writing style
const SITE_PROMPTS: Record<string, (names: string) => string> = {
  bible: (names) => `你是一位溫暖的基督教內容寫手，專門為華人基督徒撰寫靈修與信仰文章。

寫作風格：
- 溫暖、鼓勵、充滿恩典
- 使用繁體中文
- 引用聖經經文支持論點（標注書卷章節）
- 用生活故事或比喻帶入信仰真理
- 語氣像牧者對弟兄姊妹說話
- 故事中的人名請使用以下名字：${names}。絕對不要用英文名字，也不要用「小美」「小華」這類過於常見的名字`,

  chparenting: (names) => `你是一位溫暖且專業的台灣育兒內容寫手，專門為壓力大的台灣媽媽撰寫實用、有共鳴的育兒與舒壓文章。你的目標是讓文章在 Google 搜尋中排名靠前。

寫作風格：
- 語氣溫暖療癒，像好朋友聊天一樣，但同時提供專業實用的建議
- 使用繁體中文，台灣用語（例如：幼兒園不是幼稚園、健保不是醫保）
- 用台灣在地的生活場景（全聯、好市多、公園、診所、月子中心等）
- 開頭用一個生動的故事場景引起共鳴（2-3 段），讓媽媽覺得「這就是在說我」
- 內容要具體可執行，不要空泛的建議
- 多用輕鬆幽默的口吻，讓媽媽讀了會心一笑
- 故事中的人名請使用以下名字：\${names}。絕對不要用英文名字，也不要用「小美」「小華」這類過於常見的名字

SEO 優化指示：
- 標題中的關鍵字必須在文章前 100 字內自然出現
- H2 標題要包含相關的長尾關鍵字變體
- H2 標題前面要加上中文數字編號（例如：一、了解叛逆期的原因　二、提供選擇，增加自主感）
- 文章最後一定要有 FAQ 區塊（3-5 題），用問答格式寫
- 文章字數至少 2000 字，內容要有深度，不要水字數
- 自然地在文中重複主題關鍵字 3-5 次（不要堆砌）

格式規定（非常重要）：
- 文章主段落標題一定要用 ## （H2），絕對不要用 ###（H3）當主標題
- 不要在文章中插入圖片的 Markdown 語法（例如 ![alt](url)），系統會自動配圖
- 文章開頭不要重複標題，直接從故事場景開始寫
- description 要寫 30-50 字的文章摘要，不要只重複標題關鍵字，要讓人想點進來看

格式規定（非常重要）：
- 文章主段落標題一定要用 ## （H2），絕對不要用 ###（H3）當主標題
- 不要在文章中插入圖片的 Markdown 語法（例如 ![alt](url)），系統會自動配圖
- description 要寫 30-50 字的文章摘要，不要只重複標題關鍵字，要讓人想點進來看

⚠️ 分類特殊指示：
- 如果分類是「育兒崩潰」：針對媽媽遇到的具體育兒問題（不吃飯、半夜哭鬧、叛逆期等），提供原因分析 + 具體解決步驟 + 什麼時候該看醫生。語氣是「我懂你的崩潰，這裡有方法」。
- 如果分類是「媽媽情緒」：寫媽媽的壓力、疲累、內疚等情緒主題。重點是共鳴 + 舒壓方法 + 心理支持。語氣像在跟媽媽說「你已經很棒了，不是你的錯」。
- 如果分類是「親子關係」：寫教養方法、溝通技巧、正向教養。提供具體的對話範例和步驟，讓媽媽看完馬上能用。
- 如果分類是「生活實用」：寫副食品、選幼兒園、兒童用品推薦、育兒補助等實用資訊。要具體、有數據、有比較表格，讓媽媽看完能做決定。`,

  mommystartup: (names) => `你是一位專業的內容寫手，專門為台灣的媽媽族群撰寫實用文章。

寫作風格：
- 親切友善，像閨蜜聊天
- 使用繁體中文
- 包含實際案例或故事
- 提供可行動的建議
- 語氣溫暖但專業
- 故事中的人名請使用以下名字：${names}。絕對不要用英文名字，也不要用「小美」「小華」這類過於常見的名字`,

  veganote: (names) => `你是一位專業的技術學習筆記寫手，名叫「Vega」。你正在為個人學習筆記網站「Vega Note」撰寫文章。

 寫作風格
- 語氣親切自然，像朋友分享學習心得
- 用「我」作為第一人稱，帶入個人經驗和觀點
- 有實際操作步驟和程式碼範例（技術類文章）
- 用台灣用語，繁體中文

 分類特殊指示
- AI：介紹 Claude API、Prompt Engineering、AI 自動化工具、各種AI的使用心得
- 行銷：SEO 優化技巧、廣告投放、內容行銷策略的實戰經驗
- 開發：Astro、Next.js、React、GitHub Actions、Vercel 的技術筆記
- 生活：學習方法、工作效率、個人成長的反思、各類學習、手作等等

 注意事項
- 內文中提到的人名必須使用台灣常見的名字：${names}
- 文章要有故事性開頭，帶入個人學習情境
- 2000 字以上，含 H2/H3 結構、FAQ`,

  default: (names) => `你是一位專業的內容寫手，擅長撰寫 SEO 友好的高品質文章。

寫作風格：
- 專業但易讀
- 使用繁體中文
- 段落分明、結構清晰
- 包含實際案例
- 提供可行動的建議
- 故事中的人名請使用以下名字：${names}。絕對不要用英文名字，也不要用「小美」「小華」這類過於常見的名字`,
};

async function searchPexelsImages(query: string, count: number = 15): Promise<Array<{ url: string; thumbnail: string; alt: string; photographer: string }>> {
  if (!PEXELS_API_KEY) return [];
  try {
    const keywords = query.replace(/[？！。，、]/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=${count}`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    const data = await response.json();
    return (data.photos || []).map((p: any) => ({
      url: p.src?.large || '',
      thumbnail: p.src?.medium || '',
      alt: p.alt || query,
      photographer: p.photographer || '',
    }));
  } catch {
    return [];
  }
}

async function searchFreepikImages(query: string, count: number = 10): Promise<Array<{ url: string; thumbnail: string; alt: string; photographer: string }>> {
  if (!FREEPIK_API_KEY) return [];
  try {
    const response = await fetch(
      `https://api.freepik.com/v1/resources?locale=en-US&page=1&limit=${count}&order=relevance&term=${encodeURIComponent(query)}&filters[content_type][photo]=1`,
      { headers: { 'Accept-Language': 'en-US', 'x-freepik-api-key': FREEPIK_API_KEY } }
    );
    const data = await response.json();
    return (data.data || []).map((item: any) => ({
      url: item.image?.source?.url || item.image?.source_url || '',
      thumbnail: item.image?.source?.url || item.image?.source_url || '',
      alt: item.title || query,
      photographer: 'Freepik',
    }));
  } catch {
    return [];
  }
}

// Combined image search: Pexels first, Freepik fallback
async function searchImages(query: string, count: number = 15, preferFreepik: boolean = false): Promise<Array<{ url: string; thumbnail: string; alt: string; photographer: string }>> {
  let results: Array<{ url: string; thumbnail: string; alt: string; photographer: string }> = [];

  if (preferFreepik) {
    // Asian sites: Freepik first, Pexels as backup
    results = await searchFreepikImages(query, count);
    if (results.length < 3) {
      const pexelsResults = await searchPexelsImages(query, count);
      results = [...results, ...pexelsResults];
    }
  } else {
    // Default: Pexels first, Freepik as backup
    results = await searchPexelsImages(query, count);
    if (results.length < 3) {
      const freepikResults = await searchFreepikImages(query, count);
      results = [...results, ...freepikResults];
    }
  }

  // Shuffle results to avoid always picking the same images
  for (let i = results.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]];
  }

  return results;
}

// Fetch external sources from Supabase for a given site
async function getExternalSources(siteSlug: string, category: string): Promise<string> {
  try {
    const { data: site } = await supabase
      .from('sites')
      .select('external_sources')
      .eq('slug', siteSlug)
      .single();

    if (!site?.external_sources) return '';

    const sources = site.external_sources;

    // Collect relevant sources: match category + all other categories as fallback
    let relevantSources: Array<{ name: string; url: string }> = [];

    // First: try exact category match
    for (const [cat, links] of Object.entries(sources)) {
      if (category && cat.toLowerCase().includes(category.toLowerCase()) ||
        category && category.toLowerCase().includes(cat.toLowerCase())) {
        relevantSources.push(...(links as Array<{ name: string; url: string }>));
      }
    }

    // If no exact match, use all sources
    if (relevantSources.length === 0) {
      for (const links of Object.values(sources)) {
        relevantSources.push(...(links as Array<{ name: string; url: string }>));
      }
    }

    if (relevantSources.length === 0) return '';

    const sourceList = relevantSources
      .map((s) => `- ${s.name}: https://${s.url}`)
      .join('\n');

    return `

📌 外部連結來源清單（必須從以下清單中選擇 2-4 個）：
⚠️ 只能使用以下清單中的網站作為外部連結，不要自己編造！
${sourceList}

請從上面的清單中選擇 2-4 個與文章主題最相關的網站，用 Markdown 格式 [適當的文字](URL) 自然融入文章中。`;
  } catch {
    return '';
  }
}

// Fetch existing articles from Supabase (primary) or GitHub (fallback)
async function getExistingArticles(siteSlug: string): Promise<ExistingArticle[]> {
  try {
    const { data: site } = await supabase
      .from('sites')
      .select('internal_articles, github_repo, github_path, domain')
      .eq('slug', siteSlug)
      .single();

    // Primary: use Supabase internal_articles
    if (site?.internal_articles && site.internal_articles.length > 0) {
      return site.internal_articles;
    }

    // Fallback: fetch from GitHub
    if (!site?.github_repo) return [];

    const githubPath = site.github_path || 'src/content/posts';
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ai-writer',
    };
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }
    const response = await fetch(
      `https://api.github.com/repos/${site.github_repo}/contents/${githubPath}`,
      { headers }
    );

    if (!response.ok) return [];

    const files = await response.json();
    if (!Array.isArray(files)) return [];

    const domain = site.domain ? `https://${site.domain}` : '';

    return files
      .filter((f: any) => f.name.endsWith('.md'))
      .map((f: any) => {
        const slug = f.name.replace('.md', '');
        return {
          title: slug.replace(/-[a-z0-9]{8}$/, '').replace(/-/g, ' '),
          slug,
          url: `${domain}/posts/${slug}`,
        };
      });
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, category, length, siteSlug, existingArticles: providedArticles, includeImages = true } = await request.json();

    // Always fetch from Supabase/GitHub for complete internal links
    const githubArticles = await getExistingArticles(siteSlug);

    // Merge: GitHub articles + any frontend-provided articles (deduplicated)
    const allArticles = [...githubArticles];
    if (providedArticles && providedArticles.length > 0) {
      const existingSlugs = new Set(allArticles.map((a: ExistingArticle) => a.slug));
      for (const a of providedArticles) {
        if (!existingSlugs.has(a.slug)) {
          allArticles.push(a);
        }
      }
    }
    const existingArticles = allArticles;
    console.log(`[內連] siteSlug=${siteSlug}, GitHub抓到=${githubArticles.length}, 合併後=${existingArticles.length}`);
    // Generate random names for this article
    const randomNames = getRandomNames(3);
    const siteStyleFn = SITE_PROMPTS[siteSlug] || SITE_PROMPTS.default;
    const siteStyle = siteStyleFn(randomNames);

    // Fetch external sources from Supabase
    const externalSourcesBlock = await getExternalSources(siteSlug, category);

    // Build internal links instruction
    let internalLinksBlock = '';
    console.log(`[內連debug] siteSlug=${siteSlug}, articles=${existingArticles?.length}, first=${existingArticles?.[0]?.title}`);
    if (existingArticles && existingArticles.length > 0) {
      const linkList = existingArticles
        .slice(0, 30) // limit to avoid token overflow
        .map((a: ExistingArticle) => `- [${a.title}](${a.url})`)
        .join('\n');
      internalLinksBlock = `

📌 內部連結（⚠️ 必須使用，不可省略！）：
以下是本站已有的文章清單，你【必須】在文章中插入至少 2 個內部連結。
⚠️ 只能使用以下清單中的 URL，絕對不要自己編造連結！用 Markdown 格式 [適當的文字](URL) 融入段落中。
⚠️ 如果不插入內部連結，這篇文章將不合格！

${linkList}

從上面選擇 2-4 個與本文主題最相關的文章來連結。即使相關性不高，也要選最接近的插入。`;
    }

    // Build external links instruction for prompt
    let externalLinksInstruction = '';
    if (externalSourcesBlock) {
      externalLinksInstruction = `- 在正文中自然插入 2-4 個外部連結（從上面提供的來源清單中選擇）`;
    } else {
      externalLinksInstruction = `- 在正文中自然插入 2-4 個外部連結（連到真實的權威網站，如維基百科、政府網站、知名媒體等）`;
    }

    const systemPrompt = `${siteStyle}

重要 SEO 規範：
- 文章必須包含 2-4 個外部連結，自然融入內容中
- 外部連結用 Markdown 格式 [文字](URL)
- 文章必須有故事性開頭，不要直接說教${externalSourcesBlock}`;

    const prompt = `請撰寫一篇關於「${title}」的文章。

分類：${category}
字數要求：${length || '2000-2500字'}

文章結構要求：
1. 標題（# 格式，使用原標題）
2. 故事性開頭 — 用一個具體的小故事或生活情境帶入（100-150字）
3. 直接回答 — 簡要回答核心問題（50-80字）
4. 3-5 個重點段落（## 格式），每段 200-350 字
5. 實際應用 — 給讀者的行動建議
6. 結語 — 總結 + 呼籲行動

連結要求：
${externalLinksInstruction}
${existingArticles?.length > 0 ? `- ⚠️【必須】在正文中自然插入 2-4 個內部連結，從以下清單選擇：
${existingArticles.slice(0, 20).map((a: ExistingArticle) => `  [${a.title}](${a.url})`).join('\n')}
選最相關的 2-4 篇，用 [適當文字](URL) 格式自然融入段落中。` : ''}

最後請額外輸出：
---DESCRIPTION_START---
用30-50字寫一段吸引人的文章摘要，讓人看了想點進來，不要只重複標題
---DESCRIPTION_END---

---TAGS_START---
["標籤1", "標籤2", "標籤3"]
---TAGS_END---

---FAQ_START---
[
  {"q": "問題1", "a": "回答1（50-80字）"},
  {"q": "問題2", "a": "回答2（50-80字）"},
  {"q": "問題3", "a": "回答3（50-80字）"}
]
---FAQ_END---

---IMAGE_KEYWORDS_START---
{"cover": "封面圖搜尋關鍵字（英文）"}
---IMAGE_KEYWORDS_END---

注意：IMAGE_KEYWORDS 的值請用英文關鍵字。
- 如果圖片需要有人物，請加上 "asian" 關鍵字（例如 "asian mother cooking" 而不是 "mother cooking"）
- 如果是基督教/聖經相關主題，所有關鍵字都要加上 "christian"（例如 "christian prayer"、"christian church worship"、"christian bible reading"），避免搜到其他宗教的圖片

先輸出完整 Markdown 文章，再輸出 FAQ 和 IMAGE_KEYWORDS。`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    });

    const raw = completion.choices[0].message.content || '';

    // Parse FAQ
    let faq: Array<{ q: string; a: string }> = [];
    const faqMatch = raw.match(/---FAQ_START---([\s\S]*?)---FAQ_END---/);
    if (faqMatch) {
      try {
        const cleaned = faqMatch[1].replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        faq = JSON.parse(cleaned);
      } catch { }
    }

    // Parse description
    let description = '';
    const descMatch = raw.match(/---DESCRIPTION_START---([\s\S]*?)---DESCRIPTION_END---/);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // Parse tags
    let tags: string[] = [];
    const tagsMatch = raw.match(/---TAGS_START---([\s\S]*?)---TAGS_END---/);
    if (tagsMatch) {
      try {
        const cleaned = tagsMatch[1].replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        tags = JSON.parse(cleaned);
      } catch { }
    }

    // Parse image keywords
    let imageKeywords: Record<string, string> = {};
    const imgMatch = raw.match(/---IMAGE_KEYWORDS_START---([\s\S]*?)---IMAGE_KEYWORDS_END---/);
    if (imgMatch) {
      try {
        const cleaned = imgMatch[1].replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        imageKeywords = JSON.parse(cleaned);
      } catch { }
    }

    // Extract article content (before FAQ markers)
    let content = raw.split('---FAQ_START---')[0].trim();
    content = content.split('---DESCRIPTION_START---')[0].trim();
    content = content.split('---TAGS_START---')[0].trim();
    // Remove trailing --- if present
    content = content.replace(/\n---\s*$/, '').trim();

    // Search images for each position (skip if includeImages is false)
    if (!includeImages) {
      return NextResponse.json({ content, faq, imageKeywords: {}, images: {} });
    }
    const images: Record<string, { selected: any; candidates: any[] }> = {};
    const positions = ['cover'];

    await Promise.all(
      positions.map(async (pos) => {
        let query = imageKeywords[pos] || title;
        // Add "christian" for bible site to avoid Islamic imagery
        if (siteSlug === 'bible' && !query.toLowerCase().includes('christian')) {
          query = `christian ${query}`;
        }
        // Add "asian" for all Chinese-language sites when people are involved
        if (['bible', 'mommystartup', 'chparenting'].includes(siteSlug) && !query.toLowerCase().includes('asian')) {
          query = `asian ${query}`;
        }
        const preferFreepik = ['bible', 'mommystartup', 'chparenting'].includes(siteSlug);
        const candidates = await searchImages(query, 15, preferFreepik);
        if (candidates.length > 0) {
          images[pos] = {
            selected: candidates[0],
            candidates,
          };
        }
      })
    );

    return NextResponse.json({
      content,
      faq,
      description,
      tags,
      imageKeywords,
      images,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
