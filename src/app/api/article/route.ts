import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

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

// 搜 Pexels 圖片，一次拿 20 張候選
async function searchPexelsImages(query: string) {
  const empty = {
    selected: { url: '', thumbnail: '', alt: '', photographer: '' },
    candidates: [] as Array<{ url: string; thumbnail: string; alt: string; photographer: string }>,
  };

  if (!PEXELS_API_KEY) return empty;

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    const data = await response.json();

    if (!data.photos?.length) return empty;

    const candidates = data.photos.map((photo: any) => ({
      url: photo.src.large2x,
      thumbnail: photo.src.medium,
      alt: photo.alt || query,
      photographer: photo.photographer,
    }));

    // 隨機選一張作為預設
    const randomIndex = Math.floor(Math.random() * candidates.length);

    return {
      selected: candidates[randomIndex],
      candidates,
    };
  } catch {
    return empty;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, category, length, siteSlug } = await request.json();

    // 隨機選一個台灣名字
    const randomName = getRandomName();

    // 根據網站選擇不同的 prompt
    const isBible = siteSlug === 'bible' || category === '信仰';

    const systemPrompt = isBible
      ? `你是一位專業的基督教內容作者，擅長用故事性的方式撰寫聖經靈修與信仰文章。

寫作風格：
- 溫暖親切，帶有屬靈深度
- 使用繁體中文
- 用故事或情境開頭，讓讀者產生共鳴
- 包含聖經經文引用
- 提供實際應用建議

人名規則：
- 故事主角請使用「${randomName}」這個名字
- 禁止使用「小明」「小華」「雅婷」「瑪莉亞」「約翰」「大衛」等常見或外國名字
- 如果需要第二個角色，請自行從台灣常見名字中選擇（不要與主角重複）

文章結構（嚴格遵守）：
- H2 大標用中文數字：## 一、標題  ## 二、標題  ## 三、標題
- H3 小標用阿拉伯數字：### 1. 標題  ### 2. 標題
- 每個 H2 底下有 2-3 個 H3 小標
- 開頭用故事帶入（100-150字）
- 故事後一段精簡回答（粗體，50-80字）
- 3 個 H2 重點段落
- 「相關經文」區塊（引用 1-2 段經文）
- 「實際應用」區塊
- 結尾不要加 FAQ（FAQ 會在 frontmatter 裡處理）`
      : `你是一位專業的內容寫手，專門為台灣的媽媽族群撰寫實用文章。

寫作風格：
- 親切友善，像閨蜜聊天
- 使用繁體中文
- 段落分明，好閱讀
- 包含實際案例或故事
- 提供可行動的建議

人名規則：
- 故事主角請使用「${randomName}」這個名字
- 禁止使用「小明」「小華」「雅婷」「瑪莉亞」「約翰」「大衛」等常見或外國名字
- 如果需要第二個角色，請自行從台灣常見名字中選擇（不要與主角重複）

文章結構（嚴格遵守）：
- H2 大標用中文數字：## 一、標題  ## 二、標題  ## 三、標題
- H3 小標用阿拉伯數字：### 1. 標題  ### 2. 標題
- 每個 H2 底下有 2-3 個 H3 小標
- 開頭用故事或情境帶入（100-150字）
- 3-5 個 H2 重點段落
- 每個重點有實用建議
- 結尾有行動呼籲
- 結尾不要加 FAQ（FAQ 會在 frontmatter 裡處理）`;

    const prompt = `請撰寫一篇關於「${title}」的文章。

分類：${category}
字數：${length}
故事主角名字：${randomName}

請用 Markdown 格式輸出文章內容（不含 frontmatter），包含：
1.直接用故事開頭（100-150字），不要加「開頭故事」或任何標題，直接寫故事內容，主角用${randomName}」
2.故事後精簡回答（粗體），也不要加標題
3. 3 個 H2 段落（用 ## 一、 ## 二、 ## 三、格式）
4. 每個 H2 底下 2-3 個 H3 段落（用 ### 1. ### 2. 格式）
${isBible ? '5. 「## 相關經文」區塊\n6. 「## 實際應用」區塊' : '5. 結尾行動呼籲'}

同時，請在文章最後用以下 JSON 格式提供 4 組英文圖片搜尋關鍵字和 3-5 個 FAQ：

\`\`\`json
{
  "imageKeywords": {
    "cover": "3-5個英文單字，適合當封面的圖",
    "image1": "3-5個英文單字，第一個H2段落的配圖",
    "image2": "3-5個英文單字，第二個H2段落的配圖",
    "image3": "3-5個英文單字，第三個H2段落或經文區的配圖"
  },
  "faq": [
    {"q": "問題1", "a": "答案1（50-80字）"},
    {"q": "問題2", "a": "答案2（50-80字）"},
    {"q": "問題3", "a": "答案3（50-80字）"}
  ]
}
\`\`\`

圖片關鍵字要求：
- 每組 3-5 個英文單字
- 4 組不能重複
- 要具體可視覺化，適合在 Pexels 搜到高品質圖片
- 避免太抽象的詞

直接輸出 Markdown + JSON，不要有其他說明。`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const rawContent = completion.choices[0].message.content || '';

    // 解析文章內容和 JSON
    let articleContent = rawContent;
    let imageKeywords: Record<string, string> = {};
    let faq: Array<{ q: string; a: string }> = [];

    // 提取 JSON 區塊
    const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        imageKeywords = parsed.imageKeywords || {};
        faq = parsed.faq || [];
      } catch { }
      // 移除 JSON 區塊，留下純文章
      articleContent = rawContent.replace(/```json[\s\S]*?```/, '').trim();
    }

    // 用 Pexels 搜圖（4 個位置，每個 20 張候選）
    const imagePositions = ['cover', 'image1', 'image2', 'image3'];
    const images: Record<string, any> = {};

    await Promise.all(
      imagePositions.map(async (pos) => {
        const query = imageKeywords[pos];
        if (query) {
          images[pos] = await searchPexelsImages(query);
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