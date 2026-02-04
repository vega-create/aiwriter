import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

async function searchPexelsImage(query: string): Promise<{ main: string; extra: string[] }> {
  if (!PEXELS_API_KEY) return { main: '', extra: [] };

  try {
    const keywords = query.replace(/[？！。，?!]/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=4`,
      { headers: { 'Authorization': PEXELS_API_KEY } }
    );
    const data = await response.json();
    const photos = data.photos || [];
    return {
      main: photos[0]?.src?.large || '',
      extra: photos.slice(1).map((p: any) => p.src?.large || '').filter(Boolean),
    };
  } catch {
    return { main: '', extra: [] };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, category, length, sitePrompt } = await request.json();

    const defaultPrompt = `你是一位專業的內容寫手。

寫作風格：
- 親切友善，容易閱讀
- 使用繁體中文
- 段落分明，好閱讀
- 包含實際案例或故事
- 提供可行動的建議`;

    const systemPrompt = sitePrompt || defaultPrompt;

    // Search for images first
    const images = await searchPexelsImage(title);

    // Build image insertion instruction
    let imageInstruction = '';
    if (images.extra.length > 0) {
      imageInstruction = `

在文章中適當位置插入以下圖片（用 Markdown 圖片語法）：
${images.extra.map((url, i) => `- 第 ${i + 2} 個段落後插入：![相關圖片](${url})`).join('\n')}
`;
    }

    const prompt = `請撰寫一篇關於「${title}」的文章。

分類：${category}
字數：${length}

請用 Markdown 格式，嚴格遵循以下結構：

1. **標題**（# 格式）

2. **目錄區塊**（放在標題之後、正文之前）
   用以下格式呈現目錄框：
   
   > **📋 本文目錄**
   >
   > [一、第一個重點標題](#一第一個重點標題)
   > [二、第二個重點標題](#二第二個重點標題)
   > [三、第三個重點標題](#三第三個重點標題)
   > [四、常見問題 FAQ](#四常見問題-faq)

3. **故事性開頭**（100-150字，用故事或情境帶入主題）

4. **3-5 個重點段落**，標題格式必須是：
   ## 一、第一個重點標題
   ## 二、第二個重點標題
   ## 三、第三個重點標題
   
   每個重點段落（200-300字）內要有小標題：
   ### 1. 小標題
   ### 2. 小標題

5. **FAQ 區塊**
   ## 四、常見問題 FAQ
   ### Q1：問題一？
   回答（50-80字）
   ### Q2：問題二？
   回答（50-80字）
   ### Q3：問題三？
   回答（50-80字）

6. **結語**
   ## 結語
   80-100字，包含行動呼籲
${imageInstruction}

重要規則：
- 目錄中的連結要與實際標題對應
- 大標用中文數字（一、二、三）
- 小標用阿拉伯數字（1. 2. 3.）
- 段落之間保持空行
- 直接輸出 Markdown，不要有其他說明`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = completion.choices[0].message.content || '';

    return NextResponse.json({ content, image: images.main });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}