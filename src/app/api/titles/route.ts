import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { keywords, existingTitles } = await request.json();

    let excludeBlock = '';
    if (existingTitles && existingTitles.length > 0) {
      excludeBlock = `\n\n⚠️ 以下標題已經存在，請勿產生相似或重複的標題：\n${existingTitles.map((t: string) => `- ${t}`).join('\n')}\n\n你生成的標題必須與上面的標題明顯不同，不能只是換個說法或加減幾個字。`;
    }

    const prompt = `你是內容行銷專家，請把以下關鍵字轉換成吸引人的文章標題。

關鍵字：
${keywords.map((k: string, i: number) => `${i + 1}. ${k}`).join('\n')}

要求：
1. 標題要吸引點擊，但不要標題黨
2. 可以加入數字、問句、對比等技巧
3. 標題長度 15-30 字
4. 保留關鍵字的核心意思${excludeBlock}

請用 JSON 陣列格式回覆：
[
  {"keyword": "原關鍵字", "title": "生成的標題"},
  ...
]

直接輸出 JSON，不要有其他說明。`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    });

    let content = completion.choices[0].message.content || '[]';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const titles = JSON.parse(content);

    return NextResponse.json({ titles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}