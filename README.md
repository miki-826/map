# Memory Map 4D

写真の位置情報と撮影日時を読み取り、思い出を地図と時間軸に再構成するWebアプリです。

## 起動

```bash
npm install
npm run dev
```

ローカルURL:

```text
http://localhost:4321
```

## 実装済み

- Astro + React + Tailwind CSS
- Leafletのマップ起点UI
- デモログイン
- 思い出ピン、選択中ピンの強調、詳細パネル
- PCのサイドバー + マップ + 詳細パネル
- スマホの全画面マップ + ボトムナビ + 詳細ボトムシート
- 写真アップロードUI
- exifrによるGPS / 撮影日EXIF解析
- GPSなし写真の手動位置指定導線
- 思い出登録、編集、削除
- 年 / タグ / 感情フィルター
- タイムライン表示
- 今日の記憶
- Supabase接続用クライアントとSQL雛形

## Supabase

`.env.example` をもとに以下を設定すると、Supabase Authへ接続できます。

```text
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
```

DBとRLSのSQLは `database/memories.sql` にあります。
