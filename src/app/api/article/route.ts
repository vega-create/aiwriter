import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

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

  mommystartup: (names) => `你是一位專業的內容寫手，專門為台灣的媽媽族群撰寫實用文章。

寫作風格：
- 親切友善，像閨蜜聊天
- 使用繁體中文
- 包含實際案例或故事
- 提供可行動的建議
- 語氣溫暖但專業
- 故事中的人名請使用以下名字：${names}。絕對不要用英文名字，也不要用「小美」「小華」這類過於常見的名字`,

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

// Fetch existing articles from GitHub for internal links
async function getExistingArticlesFromGitHub(siteSlug: string): Promise<ExistingArticle[]> {
  try {
    const { data: site } = await supabase
      .from('sites')
      .select('github_repo, github_path, domain')
      .eq('slug', siteSlug)
      .single();

    if (!site?.github_repo) return [];

    const githubPath = site.github_path || 'src/content/posts/';
    const response = await fetch(
      `https://api.github.com/repos/${site.github_repo}/contents/${githubPath}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ai-writer',
        },
      }
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
    const { title, category, length, siteSlug, existingArticles: providedArticles } = await request.json();

    // If no articles provided by frontend, fetch from GitHub
    let existingArticles = providedArticles;
    if (!existingArticles || existingArticles.length === 0) {
      existingArticles = await getExistingArticlesFromGitHub(siteSlug);
    }

    // Generate random names for this article
    const randomNames = getRandomNames(3);
    const siteStyleFn = SITE_PROMPTS[siteSlug] || SITE_PROMPTS.default;
    const siteStyle = siteStyleFn(randomNames);

    // Fetch external sources from Supabase
    const externalSourcesBlock = await getExternalSources(siteSlug, category);

    // Build internal links instruction
    let internalLinksBlock = '';
    if (existingArticles && existingArticles.length > 0) {
      const linkList = existingArticles
        .slice(0, 30) // limit to avoid token overflow
        .map((a: ExistingArticle) => `- [${a.title}](${a.url})`)
        .join('\n');
      internalLinksBlock = `

📌 內部連結（必須使用）：
以下是本站已有的文章清單，請在文章中自然地插入 2-4 個相關的內部連結。
⚠️ 只能使用以下清單中的 URL，絕對不要自己編造連結！用 Markdown 格式 [適當的文字](URL) 融入段落中。

${linkList}

選擇與本文主題最相關的文章來連結。`;
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
- 文章必須有故事性開頭，不要直接說教${externalSourcesBlock}${internalLinksBlock}`;

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
${existingArticles?.length > 0 ? '- 在正文中自然插入 2-4 個內部連結（從上面提供的站內文章中選擇）' : ''}

最後請額外輸出：
---FAQ_START---
[
  {"q": "問題1", "a": "回答1（50-80字）"},
  {"q": "問題2", "a": "回答2（50-80字）"},
  {"q": "問題3", "a": "回答3（50-80字）"}
]
---FAQ_END---

---IMAGE_KEYWORDS_START---
{"cover": "封面圖搜尋關鍵字（英文）", "image1": "段落一配圖關鍵字（英文）", "image2": "段落二配圖關鍵字（英文）", "image3": "段落三配圖關鍵字（英文）"}
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
    // Remove trailing --- if present
    content = content.replace(/\n---\s*$/, '').trim();

    // Search images for each position
    const images: Record<string, { selected: any; candidates: any[] }> = {};
    const positions = ['cover', 'image1', 'image2', 'image3'];

    await Promise.all(
      positions.map(async (pos) => {
        let query = imageKeywords[pos] || title;
        // Safety net: add "christian" for bible site to avoid Islamic imagery
        if (siteSlug === 'bible' && !query.toLowerCase().includes('christian')) {
          query = `christian ${query}`;
        }
        const candidates = await searchPexelsImages(query, 15);
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
      imageKeywords,
      images,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}