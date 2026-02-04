import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { category, count } = await request.json();
    
    const prompt = `你是 SEO 專家，請為「${category}」主題規劃 ${count} 個適合撰寫部落格文章的關鍵字。

目標讀者：台灣的媽媽族群
要求：
1. 每個關鍵字都是「問句形式」或「How-to 形式」
2. 關鍵字要具體、有搜尋意圖
3. 涵蓋初學者到進階者的不同需求

請用 JSON 陣列格式回覆：
[
  {"keyword": "如何開始團購事業？", "difficulty": "簡單"},
  {"keyword": "團購新手常犯的 5 個錯誤", "difficulty": "中等"}
]

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
