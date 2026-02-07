import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SITE_CONTEXT: Record<string, { audience: string; examples: string }> = {
  bible: {
    audience: '華人基督徒、對信仰有興趣的慕道友',
    examples: `[
  {"keyword": "基督徒焦慮", "difficulty": "簡單"},
  {"keyword": "聖經饒恕", "difficulty": "中等"}
]`,
  },
  chparenting: {
    audience: '壓力大的台灣媽媽，需要喘息和放鬆的媽媽族群',
    examples: `[
  {"keyword": "媽媽崩潰", "difficulty": "簡單"},
  {"keyword": "小孩搗蛋", "difficulty": "簡單"},
  {"keyword": "育兒爆笑", "difficulty": "中等"}
]`,
  },
  mommystartup: {
    audience: '台灣的媽媽族群，包含新手媽媽、職業婦女、全職媽媽',
    examples: `[
  {"keyword": "團購入門", "difficulty": "簡單"},
  {"keyword": "團購選品", "difficulty": "中等"}
]`,
  },
  veganote: {
    audience: '對 AI、數位行銷、網站開發、生活有興趣的學習者',
    examples: `[
    {"keyword": "Claude API 入門", "difficulty": "簡單"},
    {"keyword": "Astro 框架", "difficulty": "簡單"},
    {"keyword": "SEO 優化技巧", "difficulty": "中等"}
    ]`,
},
  default: {
    audience: '台灣的一般讀者',
    examples: `[
  {"keyword": "工作效率", "difficulty": "簡單"},
  {"keyword": "遠端工作", "difficulty": "中等"}
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
1. 關鍵字是「簡短主題詞」，2-6 個字，不要問句、不要完整句子（例如：「小孩嬉鬧」「育兒壓力」「團購選品」）
2. 關鍵字要具體、有搜尋意圖
3. 涵蓋不同面向的需求
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
