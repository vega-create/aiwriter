import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SITE_CONTEXT: Record<string, { audience: string; examples: string }> = {
  bible: {
    audience: '華人基督徒、對信仰有興趣的慕道友',
    examples: `[
  {"keyword": "基督徒如何面對焦慮與不安？", "difficulty": "簡單"},
  {"keyword": "聖經中關於饒恕的教導是什麼？", "difficulty": "中等"}
]`,
  },
  mommystartup: {
    audience: '台灣的媽媽族群，包含新手媽媽、職業婦女、全職媽媽',
    examples: `[
  {"keyword": "如何開始團購事業？", "difficulty": "簡單"},
  {"keyword": "團購新手常犯的 5 個錯誤", "difficulty": "中等"}
]`,
  },
  default: {
    audience: '台灣的一般讀者',
    examples: `[
  {"keyword": "如何提升工作效率？", "difficulty": "簡單"},
  {"keyword": "遠端工作必備的 5 個工具推薦", "difficulty": "中等"}
]`,
  },
};

export async function POST(request: NextRequest) {
  try {
    const { category, count, siteSlug } = await request.json();
    const context = SITE_CONTEXT[siteSlug] || SITE_CONTEXT.default;

    const prompt = `你是 SEO 專家，請為「${category}」主題規劃 ${count} 個適合撰寫部落格文章的關鍵字。

目標讀者：${context.audience}
分類主題：${category}

要求：
1. 每個關鍵字都是「問句形式」或「How-to 形式」
2. 關鍵字要具體、有搜尋意圖
3. 涵蓋初學者到進階者的不同需求
4. 關鍵字必須與「${category}」分類高度相關，不要偏離主題

請用 JSON 陣列格式回覆：
${context.examples}

difficulty 選項：簡單、中等、進階
直接輸出 JSON，不要有其他說明。`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 2000,
    });

    let content = completion.choices[0].message.content || '[]';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const keywords = JSON.parse(content);

    return NextResponse.json({ keywords });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
