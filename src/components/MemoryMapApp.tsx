import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DivIcon, LayerGroup, LeafletMouseEvent, Map as LeafletMapInstance, Marker } from 'leaflet';
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Heart,
  ImagePlus,
  Layers3,
  LocateFixed,
  LogOut,
  Map,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

type View = 'map' | 'upload' | 'form' | 'timeline' | 'today' | 'settings';
type LocationSource = 'exif' | 'manual' | 'search' | 'current_location';

type Memory = {
  id: string;
  title: string;
  placeName: string;
  latitude: number;
  longitude: number;
  visitedAt: string;
  people: string;
  memo: string;
  tags: string[];
  emotion: string;
  imageUrl: string;
  imagePath?: string;
  locationSource: LocationSource;
  exifDetected: boolean;
  createdAt: string;
};

type DraftMemory = Omit<Memory, 'id' | 'createdAt'> & {
  id?: string;
};

type UploadState = {
  fileName: string;
  fileSize: string;
  previewUrl: string;
  status: 'idle' | 'reading' | 'detected' | 'no-gps' | 'error' | 'predicting' | 'predicted';
  latitude?: number;
  longitude?: number;
  placeName?: string;
  date?: string;
  message: string;
};

type LatLng = {
  lat: number;
  lng: number;
};

const assetImage = '/assets/memory-map-reference.png';
const storageKey = 'memory-map-4d.memories.v1';
const authKey = 'memory-map-4d.auth.v1';

const defaultMemories: Memory[] = [
  {
    id: 'yokohama-night-2025',
    title: '横浜の夜景',
    placeName: '横浜みなとみらい',
    latitude: 35.4556,
    longitude: 139.638,
    visitedAt: '2025-06-06',
    people: '友達',
    memo: '仕事終わりにみんなで夜景を見に行った。海風が気持ちよくて、ずっとこの時間が続けばいいと思った。',
    tags: ['旅行', '夜景'],
    emotion: '懐かしい',
    imageUrl: assetImage,
    locationSource: 'exif',
    exifDetected: true,
    createdAt: '2025-06-06T19:23:00.000Z',
  },
  {
    id: 'shibuya-cafe-2026',
    title: '渋谷カフェ',
    placeName: '渋谷',
    latitude: 35.6595,
    longitude: 139.7005,
    visitedAt: '2026-04-12',
    people: '一人',
    memo: '窓際の席で作業した日。人の流れを見ているだけでアイデアが少しずつほどけた。',
    tags: ['カフェ', '休日'],
    emotion: '楽しい',
    imageUrl: assetImage,
    locationSource: 'manual',
    exifDetected: false,
    createdAt: '2026-04-12T05:40:00.000Z',
  },
  {
    id: 'ueno-park-2026',
    title: '上野公園',
    placeName: '上野',
    latitude: 35.7148,
    longitude: 139.773,
    visitedAt: '2026-03-25',
    people: '家族',
    memo: '桜が残っていて、歩く速度が自然にゆっくりになった。',
    tags: ['散歩', '公園'],
    emotion: '落ち着く',
    imageUrl: assetImage,
    locationSource: 'manual',
    exifDetected: false,
    createdAt: '2026-03-25T04:00:00.000Z',
  },
  {
    id: 'enoshima-2024',
    title: '江の島の夕方',
    placeName: '江の島',
    latitude: 35.3002,
    longitude: 139.4803,
    visitedAt: '2024-08-18',
    people: '友達',
    memo: '階段を上ったあとに見えた海が、思っていたより広かった。',
    tags: ['旅行', '海'],
    emotion: 'うれしい',
    imageUrl: assetImage,
    locationSource: 'search',
    exifDetected: false,
    createdAt: '2024-08-18T08:20:00.000Z',
  },
];

const emptyUpload: UploadState = {
  fileName: '',
  fileSize: '',
  previewUrl: '',
  status: 'idle',
  message: '',
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  return value.replaceAll('-', '/');
}

function getMonthDay(value: string) {
  return value.slice(5);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function parseTags(input: string) {
  return input
    .split(/[、,\s#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function createDraftFromMemory(memory?: Memory): DraftMemory {
  return memory
    ? { ...memory }
    : {
        title: '',
        placeName: '',
        latitude: 35.4556,
        longitude: 139.638,
        visitedAt: toDateInputValue(new Date()),
        people: '',
        memo: '',
        tags: [],
        emotion: '',
        imageUrl: assetImage,
        imagePath: '',
        locationSource: 'manual',
        exifDetected: false,
      };
}

function makeIcon(L: typeof import('leaflet'), active: boolean, pending = false): DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="memory-pin ${active ? 'is-active' : ''} ${pending ? 'pending-pin' : ''}" aria-hidden="true"></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

function MemoryLeafletMap({
  memories,
  selectedId,
  pendingLocation,
  pickMode,
  compact = false,
  onSelect,
  onMapPick,
}: {
  memories: Memory[];
  selectedId?: string;
  pendingLocation?: LatLng | null;
  pickMode?: boolean;
  compact?: boolean;
  onSelect: (id: string) => void;
  onMapPick?: (location: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const pendingMarkerRef = useRef<Marker | null>(null);
  const pickModeRef = useRef(Boolean(pickMode));
  const onMapPickRef = useRef(onMapPick);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    pickModeRef.current = Boolean(pickMode);
    onMapPickRef.current = onMapPick;
  }, [pickMode, onMapPick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;

      leafletRef.current = L;
      const initialMemory = memories.find((memory) => memory.id === selectedId) ?? memories[0];
      const center: [number, number] = initialMemory
        ? [initialMemory.latitude, initialMemory.longitude]
        : [35.4556, 139.638];

      const map = L.map(containerRef.current, {
        zoomControl: !compact,
        attributionControl: !compact,
      }).setView(center, compact ? 13 : 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      map.on('click', (event: LeafletMouseEvent) => {
        if (pickModeRef.current) {
          onMapPickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
        }
      });

      mapRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const markerLayer = markerLayerRef.current;
    if (!ready || !L || !markerLayer) return;

    markerLayer.clearLayers();
    memories.forEach((memory) => {
      L.marker([memory.latitude, memory.longitude], {
        icon: makeIcon(L, memory.id === selectedId),
        keyboard: true,
        title: memory.title,
      })
        .addTo(markerLayer)
        .on('click', () => onSelect(memory.id));
    });
  }, [memories, onSelect, ready, selectedId]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    if (pendingMarkerRef.current) {
      pendingMarkerRef.current.remove();
      pendingMarkerRef.current = null;
    }

    if (pendingLocation) {
      pendingMarkerRef.current = L.marker([pendingLocation.lat, pendingLocation.lng], {
        icon: makeIcon(L, false, true),
        title: '仮ピン',
      }).addTo(map);
      map.flyTo([pendingLocation.lat, pendingLocation.lng], Math.max(map.getZoom(), 13), {
        duration: 0.6,
      });
    }
  }, [pendingLocation, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const selected = memories.find((memory) => memory.id === selectedId);
    if (!ready || !map || !selected) return;

    map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 13), {
      duration: 0.6,
    });
  }, [memories, ready, selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function IconButton({
  label,
  children,
  onClick,
  active,
  tone = 'plain',
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: 'plain' | 'primary' | 'danger';
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-[#0796ac] text-white hover:bg-[#067f95]'
      : tone === 'danger'
        ? 'bg-[#f06c58] text-white hover:bg-[#dc5542]'
        : active
          ? 'bg-[#e6f6f9] text-[#067f95]'
          : 'bg-white text-[#284457] hover:bg-[#f1f7f9]';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-[#dce7ee] px-3 text-sm font-semibold shadow-sm transition ${toneClass}`}
    >
      {children}
    </button>
  );
}

function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('demo@memory-map.local');
  const [password, setPassword] = useState('memory4d');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setMessage('');

    if (hasSupabaseConfig && supabase) {
      const result =
        mode === 'login'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }
    }

    localStorage.setItem(authKey, JSON.stringify({ email }));
    onSignedIn();
  };

  /* Floating pin positions for the hero image */
  const pinPositions = [
    { top: '18%', left: '15%', delay: '0s' },
    { top: '32%', left: '72%', delay: '0.4s' },
    { top: '55%', left: '25%', delay: '0.8s' },
    { top: '40%', left: '88%', delay: '1.2s' },
    { top: '70%', left: '65%', delay: '0.6s' },
    { top: '25%', left: '45%', delay: '1.0s' },
  ];

  return (
    <main className="min-h-screen bg-[#f0f4f8]">
      <div className="mx-auto grid min-h-screen max-w-[1400px] overflow-hidden bg-white shadow-panel md:min-h-[calc(100vh-40px)] md:my-5 md:rounded-2xl lg:grid-cols-[1fr_1.15fr]">
        {/* ── Left: Login Form ── */}
        <section className="flex flex-col justify-center px-8 py-10 sm:px-12 md:px-16 lg:px-20">
          {/* Logo */}
          <div className="mb-10 flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="shrink-0">
              <path d="M18 2C12.48 2 8 6.48 8 12c0 7.5 10 20 10 20s10-12.5 10-20c0-5.52-4.48-10-10-10z" fill="#3B82F6"/>
              <circle cx="18" cy="12" r="4" fill="white"/>
            </svg>
            <div>
              <p className="text-xl font-bold text-[#13283a]">Memory Map 4D</p>
              <p className="text-sm text-[#647586]">場所・人・記憶・時間を、ひとつの地図に。</p>
            </div>
          </div>

          {/* Heading */}
          <h1 className="mb-8 text-2xl font-bold text-[#13283a]">ログイン</h1>

          <form onSubmit={submit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#13283a]">メールアドレス</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                </span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="メールアドレスを入力"
                  className="h-12 w-full rounded-lg border border-[#d1d5db] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#13283a]">パスワード</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="パスワードを入力"
                  className="h-12 w-full rounded-lg border border-[#d1d5db] bg-white pl-11 pr-11 text-sm outline-none transition focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280] transition"
                  aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#4b5563]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-[#d1d5db] text-[#3B82F6] accent-[#3B82F6]"
                />
                ログインしたままにする
              </label>
              <button type="button" className="font-semibold text-[#3B82F6] hover:text-[#2563EB] transition">
                パスワードをお忘れの方
              </button>
            </div>

            {message && <p className="text-sm text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-4 py-2.5">{message}</p>}

            {/* Login Button */}
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:shadow-lg hover:shadow-blue-500/30 hover:from-[#2563EB] hover:to-[#1D4ED8] active:scale-[0.98]"
            >
              ログイン
            </button>

            {/* Divider */}
            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-[#e5e7eb]" />
              <span className="mx-4 text-xs text-[#9ca3af]">または</span>
              <div className="flex-1 border-t border-[#e5e7eb]" />
            </div>

            {/* Google Login */}
            <button
              type="button"
              onClick={submit}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#d1d5db] bg-white text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb] hover:border-[#9ca3af] active:scale-[0.98]"
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Googleでログイン
            </button>

            {/* Switch mode */}
            <p className="text-center text-sm text-[#6b7280]">
              {mode === 'login' ? (
                <>
                  アカウントをお持ちでない方は{' '}
                  <button type="button" onClick={() => setMode('signup')} className="font-bold text-[#3B82F6] hover:text-[#2563EB] transition">
                    新規登録
                  </button>
                </>
              ) : (
                <>
                  すでにアカウントをお持ちの方は{' '}
                  <button type="button" onClick={() => setMode('login')} className="font-bold text-[#3B82F6] hover:text-[#2563EB] transition">
                    ログイン
                  </button>
                </>
              )}
            </p>

            {!hasSupabaseConfig && (
              <p className="text-center text-xs text-[#9ca3af]">
                環境変数未設定時はデモログインで起動します
              </p>
            )}
          </form>
        </section>

        {/* ── Right: Hero Image ── */}
        <section className="relative hidden min-h-[500px] overflow-hidden lg:block">
          <img
            src="/assets/login-hero.png"
            alt="山頂から景色を眺める人"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/20" />

          {/* Floating map pins */}
          {pinPositions.map((pin, i) => (
            <div
              key={i}
              className="login-floating-pin absolute"
              style={{ top: pin.top, left: pin.left, animationDelay: pin.delay }}
            >
              <svg width="32" height="40" viewBox="0 0 32 40" fill="none">
                <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="white" fillOpacity="0.85"/>
                <circle cx="16" cy="14" r="5" fill="#3B82F6"/>
              </svg>
            </div>
          ))}

          {/* Text overlay */}
          <div className="absolute left-8 right-8 top-[12%] z-10">
            <h2 className="text-2xl font-bold leading-relaxed text-white drop-shadow-lg xl:text-3xl">
              写真に眠る「場所」と「時間」を読み取り、
              <br />
              思い出を4Dマップとして再構成する
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-white/85 drop-shadow-md">
              Memory Map 4D は、写真に残された位置情報・撮影日時をもとに、
              思い出を地図上に自動配置できるWebアプリです。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  view,
  setView,
  onLogout,
}: {
  view: View;
  setView: (view: View) => void;
  onLogout: () => void;
}) {
  const items = [
    { view: 'map' as const, label: 'Map', icon: Map },
    { view: 'upload' as const, label: 'Add Photo', icon: ImagePlus },
    { view: 'timeline' as const, label: 'Timeline', icon: CalendarDays },
    { view: 'today' as const, label: 'Today', icon: Sparkles },
    { view: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="hidden w-[220px] shrink-0 border-r border-[#dce7ee] bg-white/94 p-4 md:flex md:flex-col">
      <button onClick={() => setView('map')} className="mb-7 flex items-center gap-3 rounded-md p-2 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#e6f6f9] text-[#0796ac]">
          <MapPin size={22} />
        </span>
        <span>
          <span className="block font-bold">Memory Map 4D</span>
          <span className="text-xs text-[#647586]">4D思い出記録</span>
        </span>
      </button>

      <nav className="space-y-2">
        {items.map((item) => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`flex h-12 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
              view === item.view ? 'bg-[#e6f6f9] text-[#067f95]' : 'text-[#284457] hover:bg-[#f4f9fa]'
            }`}
          >
            <item.icon size={19} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="rounded-md border border-[#dce7ee] bg-[#fbfdfe] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#647586]">
            <Layers3 size={14} />
            ストレージ使用量
          </div>
          <div className="mb-2 text-sm font-bold">2.4GB / 10GB</div>
          <div className="h-2 rounded-full bg-[#dce7ee]">
            <div className="h-2 w-[24%] rounded-full bg-[#0796ac]" />
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex h-11 w-full items-center gap-2 rounded-md border border-[#dce7ee] bg-white px-3 text-sm font-semibold text-[#284457]"
        >
          <LogOut size={17} />
          ログアウト
        </button>
      </div>
    </aside>
  );
}

function FilterBar({
  years,
  tags,
  emotions,
  filters,
  setFilters,
  onAdd,
}: {
  years: string[];
  tags: string[];
  emotions: string[];
  filters: { year: string; tag: string; emotion: string };
  setFilters: (filters: { year: string; tag: string; emotion: string }) => void;
  onAdd: () => void;
}) {
  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex items-start justify-between gap-3">
      <div className="pointer-events-auto flex flex-wrap gap-2">
        <SelectPill
          icon={<CalendarDays size={16} />}
          value={filters.year}
          onChange={(year) => setFilters({ ...filters, year })}
          options={['すべて', ...years]}
        />
        <SelectPill
          icon={<Tag size={16} />}
          value={filters.tag}
          onChange={(tag) => setFilters({ ...filters, tag })}
          options={['すべて', ...tags]}
        />
        <SelectPill
          icon={<Heart size={16} />}
          value={filters.emotion}
          onChange={(emotion) => setFilters({ ...filters, emotion })}
          options={['すべて', ...emotions]}
        />
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-md bg-[#0796ac] px-3 text-sm font-bold text-white shadow-panel hover:bg-[#067f95] md:px-4"
      >
        <ImagePlus size={18} />
        <span className="hidden sm:inline">写真から追加</span>
      </button>
    </div>
  );
}

function SelectPill({
  icon,
  value,
  options,
  onChange,
}: {
  icon: ReactNode;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-md border border-[#dce7ee] bg-white px-3 text-sm font-semibold shadow-sm">
      {icon}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent outline-none"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function TodayCard({
  memories,
  onSelect,
}: {
  memories: Memory[];
  onSelect: (memory: Memory) => void;
}) {
  if (!memories.length) return null;

  const today = new Date();
  const todayMonthDay = toDateInputValue(today).slice(5);
  const sameDay = memories.find((memory) => getMonthDay(memory.visitedAt) === todayMonthDay);
  const memory = sameDay ?? [...memories].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))[0];
  const yearsAgo = today.getFullYear() - Number(memory.visitedAt.slice(0, 4));

  return (
    <button
      onClick={() => onSelect(memory)}
      className="absolute bottom-5 left-5 z-[500] hidden w-[250px] rounded-md border border-[#dce7ee] bg-white p-4 text-left shadow-panel transition hover:-translate-y-0.5 md:block"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Sparkles size={17} className="text-[#0796ac]" />
        今日の記憶
      </div>
      <p className="text-base font-semibold leading-7">
        {sameDay && yearsAgo > 0 ? `${yearsAgo}年前の今日は、` : '最近の思い出は、'}
        <br />
        {memory.placeName || memory.title}にいました。
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="text-sm text-[#647586]">{displayDate(memory.visitedAt)}</span>
        <img src={memory.imageUrl} alt="" className="h-14 w-16 rounded-md object-cover" />
      </div>
    </button>
  );
}

function DetailPanel({
  memory,
  onEdit,
  onDelete,
}: {
  memory?: Memory;
  onEdit: (memory: Memory) => void;
  onDelete: (id: string) => void;
}) {
  if (!memory) {
    return (
      <aside className="hidden w-[330px] shrink-0 border-l border-[#dce7ee] bg-white p-5 md:block">
        <div className="flex h-full flex-col items-center justify-center text-center text-[#647586]">
          <MapPin className="mb-3 text-[#0796ac]" size={30} />
          <p className="font-semibold text-[#13283a]">ピンを選択</p>
          <p className="mt-2 text-sm leading-6">地図上の思い出を選ぶと、写真・場所・時間・人・記憶がここに表示されます。</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[330px] shrink-0 overflow-y-auto border-l border-[#dce7ee] bg-white p-5 md:block">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{memory.title}</h2>
          <p className="mt-1 text-sm text-[#647586]">{displayDate(memory.visitedAt)}</p>
        </div>
        <IconButton label="メニュー" onClick={() => undefined}>
          <Menu size={18} />
        </IconButton>
      </div>

      <img src={memory.imageUrl} alt={memory.title} className="mb-5 aspect-[4/3] w-full rounded-md object-cover" />

      <div className="space-y-3 border-b border-[#dce7ee] pb-5 text-sm">
        <InfoRow icon={<MapPin size={16} />} label="場所" value={memory.placeName || '未設定'} />
        <InfoRow icon={<CalendarDays size={16} />} label="日付" value={displayDate(memory.visitedAt)} />
        <InfoRow icon={<UsersRound size={16} />} label="一緒にいた人" value={memory.people || '未設定'} />
        <div className="flex items-start gap-4">
          <Tag size={16} className="mt-1 text-[#647586]" />
          <div>
            <p className="text-xs text-[#647586]">タグ</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {memory.tags.length ? (
                memory.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-[#e6f6f9] px-2 py-1 text-xs font-semibold text-[#067f95]">
                    #{tag}
                  </span>
                ))
              ) : (
                <span>未設定</span>
              )}
            </div>
          </div>
        </div>
        <InfoRow icon={<Heart size={16} />} label="感情" value={memory.emotion || '未設定'} />
      </div>

      <div className="py-5">
        <p className="mb-2 text-sm font-bold">メモ</p>
        <p className="whitespace-pre-wrap text-sm leading-7 text-[#284457]">{memory.memo || 'メモはまだありません。'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onEdit(memory)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#cfdde5] bg-white font-semibold text-[#067f95]"
        >
          <Edit3 size={17} />
          編集
        </button>
        <button
          onClick={() => onDelete(memory.id)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#f06c58] font-semibold text-white"
        >
          <Trash2 size={17} />
          削除
        </button>
      </div>
    </aside>
  );
}

function MobileBottomSheet({
  memory,
  visible,
  onClose,
  onDetail,
}: {
  memory?: Memory;
  visible: boolean;
  onClose: () => void;
  onDetail: () => void;
}) {
  if (!visible || !memory) return null;

  return (
    <div className="absolute inset-x-3 bottom-[76px] z-[650] rounded-md border border-[#dce7ee] bg-white p-3 shadow-panel md:hidden">
      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[#cfdde5]" />
      <div className="flex gap-3">
        <img src={memory.imageUrl} alt="" className="h-20 w-20 rounded-md object-cover" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h2 className="truncate text-lg font-bold">{memory.title}</h2>
            <button aria-label="閉じる" title="閉じる" onClick={onClose} className="text-[#647586]">
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-[#647586]">{displayDate(memory.visitedAt)}</p>
          <button onClick={onDetail} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#067f95]">
            詳細を見る
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_1fr_1.25fr] items-center gap-3">
      <span className="text-[#647586]">{icon}</span>
      <span className="text-xs text-[#647586]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function UploadView({
  upload,
  onFile,
  onUseExif,
  onPickOnMap,
  onPredictAI,
  onBack,
}: {
  upload: UploadState;
  onFile: (file: File) => void;
  onUseExif: () => void;
  onPickOnMap: () => void;
  onPredictAI: () => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <main className="h-full overflow-y-auto bg-[#f5fafb] p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between">
          <button onClick={onBack} className="inline-flex items-center gap-2 rounded-md px-2 py-2 font-bold text-[#284457]">
            <ChevronRight className="rotate-180" size={18} />
            写真から追加
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1fr_1fr]">
          <section className="rounded-md border border-[#dce7ee] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">写真を追加する</h2>
            <button
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files.item(0);
                if (file) onFile(file);
              }}
              className="flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-[#b9cad4] bg-[#fbfdfe] p-6 text-center transition hover:border-[#0796ac]"
            >
              <UploadCloud className="mb-4 text-[#284457]" size={46} />
              <span className="font-bold">写真をドラッグ&ドロップ</span>
              <span className="mt-3 text-sm text-[#647586]">または</span>
              <span className="mt-4 rounded-md bg-[#0796ac] px-5 py-3 font-bold text-white">ファイルを選択</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
              }}
            />
            <p className="mt-5 text-xs leading-6 text-[#647586]">
              EXIFの位置情報と撮影日時だけを読み取り、端末名やカメラ情報など不要な情報は保存しません。
            </p>
          </section>

          <section className="rounded-md border border-[#dce7ee] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">選択した写真</h2>
            {upload.previewUrl ? (
              <>
                <img src={upload.previewUrl} alt="選択した写真" className="aspect-[4/3] w-full rounded-md object-cover" />
                <p className="mt-4 font-semibold">{upload.fileName}</p>
                <p className="text-sm text-[#647586]">{upload.fileSize}</p>
              </>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-[#eef7f9] text-[#647586]">
                <Camera size={36} />
              </div>
            )}
          </section>

          <section className="rounded-md border border-[#dce7ee] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">EXIF情報の検出結果</h2>
            {upload.status === 'idle' && <p className="text-sm leading-7 text-[#647586]">写真を選ぶと解析を開始します。</p>}
            {upload.status === 'reading' && <p className="text-sm font-semibold text-[#067f95]">写真情報を解析中...</p>}
            {upload.status === 'predicting' && <p className="text-sm font-semibold text-[#3B82F6]">AIが撮影場所を推測中...</p>}
            {upload.status !== 'idle' && upload.status !== 'reading' && upload.status !== 'predicting' && (
              <div
                className={`rounded-md border p-4 ${
                  upload.status === 'detected'
                    ? 'border-[#9fdccf] bg-[#eefaf6]'
                    : upload.status === 'no-gps'
                      ? 'border-[#ead19b] bg-[#fff8e8]'
                      : 'border-[#f3baae] bg-[#fff2ef]'
                }`}
              >
                <div className="mb-3 flex items-center gap-2 font-bold">
                  {upload.status === 'detected' ? <CheckCircle2 size={18} /> : <Search size={18} />}
                  {upload.message}
                </div>
                {upload.date && <p className="text-sm">撮影日：{displayDate(upload.date)}</p>}
                {upload.latitude && upload.longitude && (
                  <p className="text-sm">
                    GPS：{upload.latitude.toFixed(4)}, {upload.longitude.toFixed(4)}
                  </p>
                )}
                {upload.placeName && <p className="text-sm">推測地名：{upload.placeName}</p>}
              </div>
            )}

            <div className="mt-4 h-44 overflow-hidden rounded-md border border-[#dce7ee]">
              <MemoryLeafletMap
                compact
                memories={[]}
                selectedId=""
                pendingLocation={upload.latitude && upload.longitude ? { lat: upload.latitude, lng: upload.longitude } : null}
                onSelect={() => undefined}
              />
            </div>

            <div className="mt-4 grid gap-3">
              <button
                onClick={onUseExif}
                disabled={upload.status !== 'detected' && upload.status !== 'predicted'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#0796ac] font-bold text-white disabled:cursor-not-allowed disabled:bg-[#b9cad4]"
              >
                <MapPin size={17} />
                この場所で登録する
              </button>
              <button
                onClick={onPredictAI}
                disabled={!upload.previewUrl || upload.status === 'predicting'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#cfdde5] bg-white font-bold text-[#3B82F6] disabled:cursor-not-allowed disabled:text-[#9ca3af] transition hover:bg-[#eff6ff]"
              >
                <Sparkles size={17} />
                AIで場所を推測する
              </button>
              <button
                onClick={onPickOnMap}
                disabled={!upload.previewUrl}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#cfdde5] bg-white font-bold text-[#067f95] disabled:cursor-not-allowed disabled:text-[#9eb0ba]"
              >
                <LocateFixed size={17} />
                地図で場所を選ぶ
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MemoryForm({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: DraftMemory;
  setDraft: (draft: DraftMemory) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="h-full overflow-y-auto bg-[#f5fafb] p-4 md:p-6">
      <div className="mx-auto max-w-3xl rounded-md border border-[#dce7ee] bg-white p-5 shadow-panel">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#dce7ee] pb-4">
          <button onClick={onCancel} className="inline-flex items-center gap-2 font-bold text-[#284457]">
            <ChevronRight className="rotate-180" size={18} />
            新しい思い出
          </button>
          <button onClick={onSave} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0796ac] px-4 font-bold text-white">
            <Save size={17} />
            保存
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <div>
            <p className="mb-2 text-sm font-bold">写真</p>
            <img src={draft.imageUrl || assetImage} alt="" className="aspect-square w-full rounded-md object-cover" />
            <div className="mt-3 rounded-md bg-[#eef7f9] p-3 text-xs leading-6 text-[#516777]">
              位置情報の取得元：{draft.locationSource}
              <br />
              EXIF検出：{draft.exifDetected ? 'あり' : 'なし'}
            </div>
          </div>

          <div className="grid gap-4">
            <TextField label="タイトル" value={draft.title} required onChange={(title) => setDraft({ ...draft, title })} />
            <TextField label="場所" value={draft.placeName} onChange={(placeName) => setDraft({ ...draft, placeName })} />

            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                label="訪問日"
                type="date"
                value={draft.visitedAt}
                required
                onChange={(visitedAt) => setDraft({ ...draft, visitedAt })}
              />
              <TextField
                label="緯度"
                type="number"
                value={String(draft.latitude)}
                required
                onChange={(latitude) => setDraft({ ...draft, latitude: Number(latitude) })}
              />
              <TextField
                label="経度"
                type="number"
                value={String(draft.longitude)}
                required
                onChange={(longitude) => setDraft({ ...draft, longitude: Number(longitude) })}
              />
            </div>

            <TextField label="一緒にいた人" value={draft.people} onChange={(people) => setDraft({ ...draft, people })} />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="タグ"
                value={draft.tags.join(' ')}
                onChange={(tags) => setDraft({ ...draft, tags: parseTags(tags) })}
              />
              <TextField label="感情" value={draft.emotion} onChange={(emotion) => setDraft({ ...draft, emotion })} />
            </div>

            <label className="text-sm font-bold">
              メモ
              <textarea
                value={draft.memo}
                onChange={(event) => setDraft({ ...draft, memo: event.target.value })}
                rows={6}
                className="mt-2 w-full resize-none rounded-md border border-[#cfdde5] bg-white px-3 py-3 outline-none focus:border-[#0796ac]"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {['旅行', '日常', 'カフェ', 'イベント'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      tags: draft.tags.includes(tag) ? draft.tags.filter((item) => item !== tag) : [...draft.tags, tag],
                    })
                  }
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                    draft.tags.includes(tag)
                      ? 'border-[#9bd7e0] bg-[#e6f6f9] text-[#067f95]'
                      : 'border-[#dce7ee] bg-white text-[#647586]'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        value={value}
        required={required}
        type={type}
        step={type === 'number' ? 'any' : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-[#cfdde5] bg-white px-3 outline-none focus:border-[#0796ac]"
      />
    </label>
  );
}

function TimelineView({
  memories,
  selectedId,
  onSelect,
  onMap,
}: {
  memories: Memory[];
  selectedId?: string;
  onSelect: (memory: Memory) => void;
  onMap: () => void;
}) {
  const grouped = useMemo(() => {
    const sorted = [...memories].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
    return sorted.reduce<Record<string, Memory[]>>((acc, memory) => {
      const year = memory.visitedAt.slice(0, 4);
      acc[year] = [...(acc[year] ?? []), memory];
      return acc;
    }, {});
  }, [memories]);

  return (
    <main className="h-full overflow-y-auto bg-[#f5fafb] p-4 md:p-6">
      <div className="mx-auto max-w-6xl rounded-md border border-[#dce7ee] bg-white p-5 shadow-panel">
        <div className="mb-6 flex items-center justify-between border-b border-[#dce7ee] pb-4">
          <h1 className="text-2xl font-bold">Timeline</h1>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cfdde5] px-3 font-semibold" onClick={onMap}>
            <Navigation size={17} />
            Map
          </button>
        </div>

        <div className="space-y-8">
          {Object.entries(grouped)
            .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))
            .map(([year, items]) => (
            <section key={year} className="grid gap-4 md:grid-cols-[90px_1fr]">
              <div className="flex items-center gap-3 text-2xl font-bold text-[#0796ac]">
                <span className="h-3 w-3 rounded-full bg-[#0796ac]" />
                {year}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((memory) => (
                  <button
                    key={memory.id}
                    onClick={() => onSelect(memory)}
                    className={`grid grid-cols-[96px_1fr] overflow-hidden rounded-md border text-left transition hover:-translate-y-0.5 ${
                      memory.id === selectedId ? 'border-[#0796ac] bg-[#f0fbfd]' : 'border-[#dce7ee] bg-white'
                    }`}
                  >
                    <img src={memory.imageUrl} alt="" className="h-full min-h-28 w-full object-cover" />
                    <div className="p-4">
                      <p className="font-bold">{memory.title}</p>
                      <p className="mt-1 text-sm text-[#647586]">{displayDate(memory.visitedAt)}</p>
                      <p className="mt-2 text-sm text-[#284457]">{memory.people}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {memory.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded-md bg-[#e6f6f9] px-2 py-1 text-xs font-semibold text-[#067f95]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      {memory.emotion && (
                        <p className="mt-3 inline-flex items-center gap-1 text-sm text-[#dc5542]">
                          <Heart size={14} />
                          {memory.emotion}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function TodayView({ memories, onSelect }: { memories: Memory[]; onSelect: (memory: Memory) => void }) {
  const today = toDateInputValue(new Date());
  const todayMonthDay = today.slice(5);
  const exact = memories.filter((memory) => getMonthDay(memory.visitedAt) === todayMonthDay);
  const shown = exact.length ? exact : [...memories].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)).slice(0, 3);

  return (
    <main className="h-full overflow-y-auto bg-[#f5fafb] p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-5 text-2xl font-bold">今日の記憶</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {shown.map((memory) => {
            const yearsAgo = new Date().getFullYear() - Number(memory.visitedAt.slice(0, 4));
            return (
              <button
                key={memory.id}
                onClick={() => onSelect(memory)}
                className="overflow-hidden rounded-md border border-[#dce7ee] bg-white text-left shadow-sm transition hover:-translate-y-0.5"
              >
                <img src={memory.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="p-4">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-[#eef7f9] px-2 py-1 text-xs font-bold text-[#067f95]">
                    <Sparkles size={14} />
                    {exact.length && yearsAgo > 0 ? `${yearsAgo}年前の今日` : '最近の記憶'}
                  </div>
                  <h2 className="text-lg font-bold">{memory.title}</h2>
                  <p className="mt-1 text-sm text-[#647586]">{displayDate(memory.visitedAt)}</p>
                  <p className="mt-3 text-sm leading-7 text-[#284457]">{memory.memo}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function SettingsView() {
  return (
    <main className="h-full overflow-y-auto bg-[#f5fafb] p-4 md:p-6">
      <div className="mx-auto max-w-3xl rounded-md border border-[#dce7ee] bg-white p-5 shadow-panel">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="mt-6 space-y-4">
          <SettingRow title="Auth" value={hasSupabaseConfig ? 'Supabase Auth' : 'Demo local auth'} />
          <SettingRow title="Privacy" value="思い出は初期状態で非公開" />
          <SettingRow title="EXIF" value="GPSと撮影日時のみ利用" />
          <SettingRow title="Storage" value="memory-images / {user_id}/{memory_id}/original.jpg" />
        </div>
      </div>
    </main>
  );
}

function SettingRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[#dce7ee] bg-[#fbfdfe] p-4">
      <p className="font-bold">{title}</p>
      <p className="text-right text-sm text-[#647586]">{value}</p>
    </div>
  );
}

function BottomNav({ view, setView }: { view: View; setView: (view: View) => void }) {
  const items = [
    { view: 'map' as const, label: 'Map', icon: Map },
    { view: 'upload' as const, label: 'Add', icon: Plus },
    { view: 'timeline' as const, label: 'Timeline', icon: Clock3 },
    { view: 'today' as const, label: 'Me', icon: UserRound },
  ];

  return (
    <nav className="absolute inset-x-0 bottom-0 z-[700] grid h-16 grid-cols-4 border-t border-[#dce7ee] bg-white md:hidden">
      {items.map((item) => (
        <button
          key={item.view}
          onClick={() => setView(item.view)}
          className={`flex flex-col items-center justify-center gap-1 text-xs font-bold ${
            view === item.view ? 'text-[#0796ac]' : 'text-[#647586]'
          }`}
        >
          <item.icon size={19} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export default function MemoryMapApp() {
  const [signedIn, setSignedIn] = useState(false);
  const [view, setView] = useState<View>('map');
  const [memories, setMemories] = useState<Memory[]>(defaultMemories);
  const [selectedId, setSelectedId] = useState<string | undefined>(defaultMemories[0]?.id);
  const [filters, setFilters] = useState({ year: 'すべて', tag: 'すべて', emotion: 'すべて' });
  const [upload, setUpload] = useState<UploadState>(emptyUpload);
  const [draft, setDraft] = useState<DraftMemory>(createDraftFromMemory());
  const [mapPicking, setMapPicking] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem(authKey)));
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Memory[];
        if (Array.isArray(parsed)) {
          setMemories(parsed);
          setSelectedId(parsed[0]?.id);
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(memories));
  }, [memories]);

  const selectedMemory = memories.find((memory) => memory.id === selectedId);

  const years = useMemo(() => unique(memories.map((memory) => memory.visitedAt.slice(0, 4))).sort((a, b) => b.localeCompare(a)), [memories]);
  const tags = useMemo(() => unique(memories.flatMap((memory) => memory.tags)).sort(), [memories]);
  const emotions = useMemo(() => unique(memories.map((memory) => memory.emotion).filter(Boolean)).sort(), [memories]);

  const filteredMemories = useMemo(
    () =>
      memories.filter((memory) => {
        const byYear = filters.year === 'すべて' || memory.visitedAt.startsWith(filters.year);
        const byTag = filters.tag === 'すべて' || memory.tags.includes(filters.tag);
        const byEmotion = filters.emotion === 'すべて' || memory.emotion === filters.emotion;
        return byYear && byTag && byEmotion;
      }),
    [filters, memories],
  );

  const handleFile = async (file: File) => {
    const previewUrl = await readFileAsDataUrl(file);
    setUpload({
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      previewUrl,
      status: 'reading',
      message: '写真情報を解析中です',
    });

    try {
      const exifr = await import('exifr');
      const [gps, metadata] = await Promise.all([
        exifr.gps(file).catch(() => null),
        exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] }).catch(() => null),
      ]);

      const dateValue = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
      const date = dateValue instanceof Date ? toDateInputValue(dateValue) : undefined;

      if (gps?.latitude && gps?.longitude) {
        setUpload({
          fileName: file.name,
          fileSize: formatFileSize(file.size),
          previewUrl,
          status: 'detected',
          latitude: gps.latitude,
          longitude: gps.longitude,
          date,
          message: '撮影場所を検出しました！',
        });
        return;
      }

      setUpload({
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        previewUrl,
        status: 'no-gps',
        date,
        message: '位置情報を検出できませんでした',
      });
    } catch {
      setUpload({
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        previewUrl,
        status: 'error',
        message: 'EXIF情報を読み取れませんでした',
      });
    }
  };

  const handlePredictAI = async () => {
    if (!upload.previewUrl) return;

    setUpload((prev) => ({
      ...prev,
      status: 'predicting',
      message: 'AIが推測中です...',
    }));

    try {
      const response = await fetch('/api/predict-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: upload.previewUrl }),
      });

      if (!response.ok) {
        throw new Error('API Error');
      }

      const result = await response.json();
      
      setUpload((prev) => ({
        ...prev,
        status: 'predicted',
        latitude: result.latitude,
        longitude: result.longitude,
        placeName: result.placeName,
        message: 'AIが撮影場所を推測しました！',
      }));
    } catch (error) {
      setUpload((prev) => ({
        ...prev,
        status: 'error',
        message: 'AIによる場所の推測に失敗しました',
      }));
    }
  };

  const openDraftFromUpload = (source: LocationSource, location?: LatLng) => {
    const latitude = location?.lat ?? upload.latitude ?? 35.4556;
    const longitude = location?.lng ?? upload.longitude ?? 139.638;
    setDraft({
      ...createDraftFromMemory(),
      title: upload.fileName ? upload.fileName.replace(/\.[^.]+$/, '') : '',
      placeName: upload.placeName || (source === 'exif' ? '撮影場所' : ''),
      latitude,
      longitude,
      visitedAt: upload.date ?? toDateInputValue(new Date()),
      imageUrl: upload.previewUrl || assetImage,
      locationSource: source === 'exif' && upload.status === 'predicted' ? 'search' : source,
      exifDetected: upload.status === 'detected',
    });
    setView('form');
  };

  const saveDraft = () => {
    if (!draft.title.trim()) return;

    if (draft.id) {
      setMemories((current) =>
        current.map((memory) =>
          memory.id === draft.id
            ? {
                ...memory,
                ...draft,
                title: draft.title.trim(),
                placeName: draft.placeName.trim(),
              }
            : memory,
        ),
      );
      setSelectedId(draft.id);
    } else {
      const memory: Memory = {
        ...draft,
        id: crypto.randomUUID(),
        title: draft.title.trim(),
        placeName: draft.placeName.trim(),
        createdAt: new Date().toISOString(),
      };
      setMemories((current) => [memory, ...current]);
      setSelectedId(memory.id);
    }

    setUpload(emptyUpload);
    setMapPicking(false);
    setMobileSheetOpen(true);
    setView('map');
  };

  const deleteMemory = (id: string) => {
    setMemories((current) => current.filter((memory) => memory.id !== id));
    const next = memories.find((memory) => memory.id !== id);
    setSelectedId(next?.id);
  };

  const logout = async () => {
    if (hasSupabaseConfig && supabase) await supabase.auth.signOut();
    localStorage.removeItem(authKey);
    setSignedIn(false);
  };

  const selectMemory = (id: string) => {
    setSelectedId(id);
    setMobileSheetOpen(true);
  };

  if (!signedIn) {
    return <LoginScreen onSignedIn={() => setSignedIn(true)} />;
  }

  const mapView = (
    <div className="relative h-full flex-1 overflow-hidden bg-[#dbeff5]">
      <MemoryLeafletMap
        memories={filteredMemories}
        selectedId={selectedId}
        pickMode={mapPicking}
        pendingLocation={mapPicking ? { lat: draft.latitude, lng: draft.longitude } : null}
        onSelect={selectMemory}
        onMapPick={(location) => {
          setMapPicking(false);
          openDraftFromUpload('manual', location);
        }}
      />
      <FilterBar years={years} tags={tags} emotions={emotions} filters={filters} setFilters={setFilters} onAdd={() => setView('upload')} />
      <TodayCard
        memories={memories}
        onSelect={(memory) => {
          selectMemory(memory.id);
          setView('map');
        }}
      />
      {mapPicking && (
        <div className="absolute left-3 top-16 z-[600] max-w-sm rounded-md border border-[#ead19b] bg-[#fff8e8] p-3 text-sm font-semibold text-[#73511a] shadow-panel md:left-5 md:top-20">
          地図をクリックして、写真の場所を指定してください。
        </div>
      )}
      <MobileBottomSheet
        memory={selectedMemory}
        visible={mobileSheetOpen && view === 'map'}
        onClose={() => setMobileSheetOpen(false)}
        onDetail={() => setView('today')}
      />
    </div>
  );

  return (
    <div className="relative h-screen overflow-hidden bg-white md:flex">
      <Sidebar view={view} setView={setView} onLogout={logout} />

      {view === 'map' && (
        <>
          {mapView}
          <DetailPanel
            memory={selectedMemory}
            onEdit={(memory) => {
              setDraft(createDraftFromMemory(memory));
              setView('form');
            }}
            onDelete={deleteMemory}
          />
        </>
      )}

      {view === 'upload' && (
        <UploadView
          upload={upload}
          onFile={handleFile}
          onUseExif={() => openDraftFromUpload('exif')}
          onPredictAI={handlePredictAI}
          onPickOnMap={() => {
            setMapPicking(true);
            setView('map');
          }}
          onBack={() => setView('map')}
        />
      )}

      {view === 'form' && <MemoryForm draft={draft} setDraft={setDraft} onSave={saveDraft} onCancel={() => setView('map')} />}

      {view === 'timeline' && (
        <TimelineView
          memories={filteredMemories}
          selectedId={selectedId}
          onSelect={(memory) => {
            selectMemory(memory.id);
            setView('map');
          }}
          onMap={() => setView('map')}
        />
      )}

      {view === 'today' && (
        <TodayView
          memories={memories}
          onSelect={(memory) => {
            selectMemory(memory.id);
            setView('map');
          }}
        />
      )}

      {view === 'settings' && <SettingsView />}

      <BottomNav view={view} setView={setView} />
    </div>
  );
}
