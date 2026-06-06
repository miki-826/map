import type { APIRoute } from 'astro';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const maxBase64Bytes = 8 * 1024 * 1024;
const maxRequestBytes = 12 * 1024 * 1024;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

async function requireUser(request: Request) {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 503, error: 'Authentication is not configured' };
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { ok: false as const, status: 401, error: 'Authentication required' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false as const, status: 401, error: 'Invalid session' };
  }

  return { ok: true as const, userId: data.user.id };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const user = await requireUser(request);
    if (!user.ok) {
      return jsonResponse({ error: user.error }, user.status);
    }

    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > maxRequestBytes) {
      return jsonResponse({ error: 'Image is too large' }, 413);
    }

    const { image } = await request.json();

    if (!image || typeof image !== 'string') {
      return jsonResponse({ error: 'Image data is required' }, 400);
    }

    // Extract base64 and mimeType from data URL (e.g., "data:image/jpeg;base64,xxxx")
    const match = image.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,(.+)$/);
    if (!match) {
      return jsonResponse({ error: 'Invalid image format' }, 400);
    }

    const mimeType = match[1];
    const base64Data = match[2];
    if (!allowedMimeTypes.has(mimeType)) {
      return jsonResponse({ error: 'Unsupported image format' }, 415);
    }
    if (Buffer.byteLength(base64Data, 'base64') > maxBase64Bytes) {
      return jsonResponse({ error: 'Image is too large' }, 413);
    }

    const apiKey = import.meta.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse({ error: 'AI location prediction is not configured' }, 503);
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

    const text = response.text ?? '';
    if (!text) {
      return jsonResponse({ error: 'Empty response from AI' }, 502);
    }
    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse AI response');
      return jsonResponse({ error: 'Invalid JSON returned from AI' }, 502);
    }

    const latitude = Number(result.latitude);
    const longitude = Number(result.longitude);
    const placeName = typeof result.placeName === 'string' ? result.placeName.slice(0, 120) : '';
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      !placeName
    ) {
      return jsonResponse({ error: 'Invalid location returned from AI' }, 502);
    }

    return jsonResponse({ latitude, longitude, placeName }, 200);
  } catch (error) {
    console.error('Gemini API Error:', error);
    return jsonResponse({ error: 'Prediction failed' }, 500);
  }
};
