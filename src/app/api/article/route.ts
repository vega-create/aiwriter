import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;

// 台灣常見名字列表（每次隨機選一個）
const TW_NAMES = [
  '志豪', '怡君', '建宏', '淑芬', '俊傑', '雅琪', '宗翰', '佳穎',
  '柏翰', '詩涵', '冠廷', '欣怡', '家豪', '雅雯', '承恩', '筱婷',
  '宏仁', '美玲', '彥廷', '思妤', '育誠', '佩珊', '哲瑋', '曉萱',
  '信宏', '惠婷', '威廷', '雅芳', '嘉豪', '靜宜',
];

function getRandomName(): string {
  return TW_NAMES[Math.floor(Math.random() * TW_NAMES.length)];
}

type ImageCandidate = {
  url: string;
  thumbnail: string;
  alt: string;
  photographer: string;
};

type ImageResult = {
  selected: ImageCandidate;
  candidates: ImageCandidate[];
  source?: string;
};

const EMPTY_RESULT: ImageResult = {
  selected: { url: '', thumbnail: '', alt: '', photographer: '' },
  candidates: [],
  source: 'none',
};

// ========== Pexels 搜圖 ==========
async function searchPexelsImages(query: string): Promise<ImageResult> {
  if (!PEXELS_API_KEY) return { ...EMPTY_RESULT };
  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    const data = await response.json();
    if (!data.photos?.length) return { ...EMPTY_RESULT };
    const candidates = data.photos.map((photo: any) => ({
      url: photo.src.large2x,
      thumbnail: photo.src.medium,
      alt: photo.alt || query,
      photographer: photo.photographer,
    }));
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return { selected: candidates[randomIndex], candidates, source: 'pexels' };
  } catch {
    return { ...EMPTY_RESULT };
  }
}

// ========== Freepik 搜圖（備用） ==========
async function searchFreepikImages(query: string): Promise<ImageResult> {
  if (!FREEPIK_API_KEY) return { ...EMPTY_RESULT };
  try {
    const response = await fetch(
      `https://api.freepik.com/v1/resources?locale=zh-TW&page=1&limit=20&term=${encodeURIComponent(query)}`,
      {
        headers: {
          'x-freepik-api-key': FREEPIK_API_KEY,
          'Accept-Language': 'zh-TW',
        },
      }
    );
    const data = await response.json();
    if (!data.data?.length) return { ...EMPTY_RESULT };
    const candidates = data.data
      .map((item: any) => ({
        url: item.image?.source_url || item.url || '',
        thumbnail: item.image?.source_url || item.url || '',
        alt: item.title || query,
        photographer: 'Freepik',
      }))
      .filter((c: ImageCandidate) => c.url);
    if (!candidates.length) return { ...EMPTY_RESULT };
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return { selected: candidates[randomIndex], candidates, source: 'freepik' };
  } catch {
    return { ...EMPTY_RESULT };
  }
}

// ========== 根據網站決定圖片搜尋前綴 ==========
function getImagePrefix(siteSlug: string): string {
  switch (siteSlug) {
    case 'bible': return 'christian asian';
    case 'bible-en': return 'christian';
    case 'mommystartup':
    case 'chparenting': return 'asian';
    default: return '';
  }
}

// ========== 智慧搜圖（三層 fallback） ==========
async function searchImages(query: string, siteSlug: string): Promise<ImageResult> {
  const prefix = getImagePrefix(siteSlug);
  const needAsian = ['bible', 'mommystartup', 'chparenting'].includes(siteSlug);

  // 1. 加前綴搜 Pexels
  const prefixedQuery = prefix ? `${prefix} ${query}` : query;
  const result = await searchPexelsImages(prefixedQuery);
  if (result.candidates.length) return result;

  // 2. 需要亞洲圖 → Freepik fallback
  if (needAsian) {
    const freepikResult = await searchFreepikImages(query);
    if (freepikResult.candidates.length) return freepikResult;
  }

  // 3. 原始 query 再試
  if (prefix) {
    const fallbackResult = await searchPexelsImages(query);
    if (fallbackResult.candidates.length) return fallbackResult;
  }

  return { ...EMPTY_RESULT };
}

// ========== 主 API ==========
export async function POST(request: NextRequest) {
  try {
    const { title, category, length, siteSlug } = await request.json();

    const randomName = getRandomName();
    const isBible = siteSlug === 'bible' || siteSlug === 'bible-en' || category === '信仰';

    // ====== System Prompt ======
    const systemPrompt = isBible
      ? `你是一位專業的基督教內容作者，擅長用故事性的方式撰寫聖經靈修與信仰文章。

寫作風格：
- 溫暖親切，帶有屬靈深度
- 使用繁體中文
- 用故事或情境開頭，讓讀者產生共鳴
- 包含聖經經文引用
- 提供實際應用建議
- 適當加入 Markdown 表格來整理重點資訊

人名規則：
- 故事主角請使用「${randomName}」這個名字
- 禁止使用「小明」「小華」「雅婷」「瑪莉亞」「約翰」「大衛」等常見或外國名字

文章結構（嚴格遵守）：
- H2 大標用中文數字：## 一、標題  ## 二、標題  ## 三、標題
- H3 小標用阿拉伯數字：### 1. 標題  ### 2. 標題
- 每個 H2 底下有 2-3 個 H3 小標
- 開頭用故事帶入（100-150字）
- 故事後一段精簡回答（粗體，50-80字）
- 故事後加「看完這篇文章，您將了解：」的重點清單（3-4 點）
- 3-4 個 H2 重點段落（每段至少包含一個 Markdown 表格整理重點）
- 「## 相關經文」區塊（引用 2-3 段經文）
- 「## 實際應用」區塊
- 結尾不要加 FAQ（FAQ 會在 frontmatter 裡處理）

表格規範：
- 使用標準 Markdown 表格語法
- 格式：第一行標題列，第二行 | --- | --- | 分隔線，之後是資料列
- 每個 H2 段落至少一個表格來整理該段重點
- 表格要有意義，不要為了加而加

連結規範：
- 加入 2-3 個外部連結到權威來源（如聖經公會、知名神學院、維基百科）
- 連結用 Markdown 格式：[顯示文字](URL)
- 外部連結要自然融入文章內容`
      : `你是一位專業的內容寫手，專門為台灣的媽媽族群撰寫實用文章。

寫作風格：
- 親切友善，像閨蜜聊天
- 使用繁體中文
- 段落分明，好閱讀
- 包含實際案例或故事
- 提供可行動的建議
- 適當加入 Markdown 表格來整理重點資訊

人名規則：
- 故事主角請使用「${randomName}」這個名字
- 禁止使用「小明」「小華」「雅婷」「瑪莉亞」「約翰」「大衛」等常見或外國名字

文章結構（嚴格遵守）：
- H2 大標用中文數字：## 一、標題  ## 二、標題  ## 三、標題
- H3 小標用阿拉伯數字：### 1. 標題  ### 2. 標題
- 每個 H2 底下有 2-3 個 H3 小標
- 開頭用故事或情境帶入（100-150字）
- 故事後加「看完這篇文章，您將了解：」的重點清單（3-4 點）
- 3-5 個 H2 重點段落（每段至少包含一個 Markdown 表格整理重點）
- 每段結尾有實用建議
- 結尾有行動呼籲
- 結尾不要加 FAQ（FAQ 會在 frontmatter 裡處理）

表格規範：
- 使用標準 Markdown 表格語法
- 格式：第一行標題列，第二行 | --- | --- | 分隔線，之後是資料列
- 每個 H2 段落至少一個表格來整理該段重點（例如：比較表、步驟表、分齡對照表）
- 表格要有意義，不要為了加而加

連結規範：
- 加入 2-3 個外部連結到權威來源（如衛福部、兒福聯盟、知名醫療網站、親子天下）
- 連結用 Markdown 格式：[顯示文字](URL)
- 外部連結要自然融入文章內容`;

    // ====== User Prompt ======
    const prompt = `請撰寫一篇關於「${title}」的深度文章。

分類：${category}
目標字數：至少 2000 字（這很重要，內容要充實豐富，每個段落都要有足夠的說明和例子）
故事主角名字：${randomName}

請用 Markdown 格式輸出文章內容（不含 frontmatter），包含：

1. 直接用故事開頭（100-150字），不要加「開頭故事」或任何標題，直接寫故事內容，主角用「${randomName}」
2. 故事後精簡回答（粗體），也不要加標題
3. 「看完這篇文章，您將了解：」重點清單（3-4 點，用 - 列點）
4. 3-4 個 H2 段落（用 ## 一、 ## 二、 ## 三、格式）
5. 每個 H2 底下 2-3 個 H3 段落（用 ### 1. ### 2. 格式）
6. 每個 H2 段落內至少包含一個 Markdown 表格整理重點
7. 文章中自然融入 2-3 個外部連結（權威來源，用 [文字](URL) 格式）
${isBible ? '8. 「## 相關經文」區塊（引用 2-3 段經文）\n9. 「## 實際應用」區塊' : '8. 結尾行動呼籲'}

Markdown 表格格式（務必嚴格遵守）：

| 項目 | 說明 | 建議 |
| --- | --- | --- |
| 內容1 | 說明1 | 建議1 |
| 內容2 | 說明2 | 建議2 |

注意：表格的每一行都必須以 | 開頭和結尾，第二行必須是 | --- | --- | 格式的分隔線。

重要提醒：
- 文章至少 2000 字，內容要充實有深度
- 每個 H3 段落至少 150-200 字，不要只寫兩三句
- 表格必須使用標準 Markdown 語法（| 和 --- 分隔線），不要用其他格式
- 外部連結要連到真實存在的權威網站
- 不要在結尾加 FAQ 區塊

同時，請在文章最後用以下 JSON 格式提供圖片關鍵字和 FAQ：

\`\`\`json
{
  "imageKeywords": {
    "cover": "5-8個英文單字描述封面場景，例如：asian mother reading picture book with toddler cozy bedroom",
    "image1": "5-8個英文單字描述第一個H2段落的具體可拍攝場景",
    "image2": "5-8個英文單字描述第二個H2段落的具體可拍攝場景",
    "image3": "5-8個英文單字描述第三個H2段落的具體可拍攝場景"
  },
  "faq": [
    {"q": "問題1", "a": "答案1（50-80字）"},
    {"q": "問題2", "a": "答案2（50-80字）"},
    {"q": "問題3", "a": "答案3（50-80字）"},
    {"q": "問題4", "a": "答案4（50-80字）"},
    {"q": "問題5", "a": "答案5（50-80字）"}
  ]
}
\`\`\`

圖片關鍵字非常重要的規則：
- 每組 5-8 個英文單字，描述具體可拍攝的場景
- 4 組關鍵字要描述完全不同的場景
- 如果是親子/育兒/教養主題：場景要包含 mother、child、family、toddler 等
- 如果是信仰/聖經主題：場景必須包含 christian、church、bible、cross 等明確的基督教元素
- 禁止使用 religion、spiritual、pray（pray 單獨用容易搜到回教圖片）
- 信仰主題的禱告場景請用 christian prayer church 而不是 prayer
- 場景要具體視覺化，例如「asian mother and daughter reading bible together at wooden table」而不是「bible study」

直接輸出 Markdown + JSON，不要有其他說明。`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    });

    const rawContent = completion.choices[0].message.content || '';

    // 解析文章內容和 JSON
    let articleContent = rawContent;
    let imageKeywords: Record<string, string> = {};
    let faq: Array<{ q: string; a: string }> = [];

    const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        imageKeywords = parsed.imageKeywords || {};
        faq = parsed.faq || [];
      } catch { }
      articleContent = rawContent.replace(/```json[\s\S]*?```/, '').trim();
    }

    // 搜圖（4 個位置並行）
    const imagePositions = ['cover', 'image1', 'image2', 'image3'];
    const images: Record<string, any> = {};

    await Promise.all(
      imagePositions.map(async (pos) => {
        const query = imageKeywords[pos];
        if (query) {
          images[pos] = await searchImages(query, siteSlug || '');
        }
      })
    );

    return NextResponse.json({
      content: articleContent,
      faq,
      imageKeywords,
      images,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}