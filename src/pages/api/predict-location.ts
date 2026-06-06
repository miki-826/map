import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { image } = await request.json();

    if (!image || typeof image !== 'string') {
      return new Response(JSON.stringify({ error: 'Image data is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Extract base64 and mimeType from data URL (e.g., "data:image/jpeg;base64,xxxx")
    const match = image.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,(.+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Invalid image format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `この画像を見て、撮影場所を推測してください。
もし正確な場所がわからない場合は、画像に映っている風景や建物の特徴から、最も可能性の高い場所の緯度・経度と地名を推測してください。
以下のJSONフォーマットで回答してください。
{
  "latitude": 緯度(数値),
  "longitude": 経度(数値),
  "placeName": "推測される地名や施設名"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse AI response:', text);
      return new Response(JSON.stringify({ error: 'Invalid JSON returned from AI' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Prediction failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
