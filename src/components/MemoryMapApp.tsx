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
  Eye,
  EyeOff,
  Heart,
  ImagePlus,
  Layers3,
  LocateFixed,
  LockKeyhole,
  LogOut,
  Mail,
  Map,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
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
const maxUploadBytes = 8 * 1024 * 1024;
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);

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

function authErrorMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return 'メールアドレスまたはパスワードが正しくありません。';
  if (/email not confirmed/i.test(message)) return 'メールアドレスの確認が完了していません。確認メールのリンクを開いてください。';
  if (/user already registered/i.test(message)) return 'このメールアドレスは既に登録されています。ログインしてください。';
  if (/password should be at least/i.test(message)) return 'パスワードは6文字以上で入力してください。';
  return message;
}

function rowToMemory(row: Record<string, any>): Memory {
  return {
    id: row.id,
    title: row.title,
    placeName: row.place_name ?? '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    visitedAt: row.visited_at,
    people: row.people ?? '',
    memo: row.memo ?? '',
    tags: Array.isArray(row.tags) ? row.tags : parseTags(row.tag ?? ''),
    emotion: row.emotion ?? '',
    imageUrl: row.image_url || assetImage,
    imagePath: row.image_path ?? '',
    locationSource: (row.location_source ?? 'manual') as LocationSource,
    exifDetected: Boolean(row.exif_detected),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function memoryToRow(memory: DraftMemory, userId: string) {
  return {
    user_id: userId,
    title: memory.title,
    place_name: memory.placeName,
    latitude: memory.latitude,
    longitude: memory.longitude,
    visited_at: memory.visitedAt,
    people: memory.people,
    memo: memory.memo,
    tags: memory.tags,
    emotion: memory.emotion,
    image_url: memory.imageUrl,
    image_path: memory.imagePath ?? '',
    location_source: memory.locationSource,
    exif_detected: memory.exifDetected,
  };
}

function memoryToLegacyRow(memory: DraftMemory, userId: string) {
  const { tags, ...row } = memoryToRow(memory, userId);
  return {
    ...row,
    tag: tags.join(' '),
  };
}

function isMissingTagsColumnError(error: { message?: string; code?: string } | null) {
  return Boolean(
    error?.code === 'PGRST204' ||
      /tags.*column|column.*tags|schema cache/i.test(error?.message ?? ''),
  );
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setMessage('');
    setInfo('');

    if (!hasSupabaseConfig || !supabase) {
      localStorage.setItem(authKey, JSON.stringify({ email }));
      onSignedIn();
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage(authErrorMessage(error.message));
          return;
        }
        onSignedIn();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setMessage(authErrorMessage(error.message));
          return;
        }
        if (!data.session) {
          setInfo('確認メールを送信しました。メール内のリンクから登録を完了してください。');
          setMode('login');
          return;
        }
        onSignedIn();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sendPasswordReset = async () => {
    setMessage('');
    setInfo('');

    if (!email.trim()) {
      setMessage('パスワード再設定にはメールアドレスを入力してください。');
      return;
    }
    if (!hasSupabaseConfig || !supabase) {
      setInfo('デモモードではパスワード再設定は利用できません。');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setMessage(authErrorMessage(error.message));
        return;
      }
      setInfo('パスワード再設定メールを送信しました。メール内のリンクを開いてください。');
    } finally {
      setSubmitting(false);
    }
  };

  /* Floating pin positions for the hero image */
  const pinPositions = [
    { top: '34%', left: '74%', delay: '0s' },
    { top: '46%', left: '90%', delay: '0.5s' },
    { top: '72%', left: '64%', delay: '1s' },
  ];

  return (
    <main className="min-h-screen bg-[#eef6f8] px-0 md:px-5">
      <div className="mx-auto grid min-h-screen max-w-[1420px] overflow-hidden bg-white shadow-panel md:my-5 md:min-h-[calc(100vh-40px)] md:rounded-lg lg:grid-cols-[0.92fr_1.08fr]">
        {/* ── Left: Login Form ── */}
        <section className="flex flex-col justify-center px-6 py-8 sm:px-10 md:px-14 lg:px-16">
          {/* Logo */}
          <div className="mb-9 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#e6f6f9] text-[#0796ac] ring-1 ring-[#bfe6ed]">
              <MapPin size={24} />
            </span>
            <div>
              <p className="text-xl font-bold text-[#13283a]">Memory Map 4D</p>
              <p className="text-sm text-[#647586]">場所・人・記憶・時間を、ひとつの地図に。</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-[#dce7ee] bg-[#f7fbfc] px-3 py-2 text-xs font-bold text-[#067f95]">
              <ShieldCheck size={15} />
              {hasSupabaseConfig ? 'Supabase Auth connected' : 'Demo mode'}
            </div>
            <h1 className="text-3xl font-bold leading-tight text-[#13283a]">
              {mode === 'login' ? '思い出の地図へ戻る' : '4Dの記録をはじめる'}
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#647586]">
              写真に眠る場所と時間を読み取り、あなただけのマップに安全に保存します。
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#13283a]">メールアドレス</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]">
                  <Mail size={18} />
                </span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="メールアドレスを入力"
                  className="h-12 w-full rounded-md border border-[#cfdde5] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#0796ac] focus:ring-2 focus:ring-[#0796ac]/20"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#13283a]">パスワード</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af]">
                  <LockKeyhole size={18} />
                </span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="パスワードを入力"
                  className="h-12 w-full rounded-md border border-[#cfdde5] bg-white pl-11 pr-11 text-sm outline-none transition focus:border-[#0796ac] focus:ring-2 focus:ring-[#0796ac]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9ca3af] transition hover:text-[#284457]"
                  aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  title={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 text-[#647586]">
                <CheckCircle2 size={16} className="text-[#0796ac]" />
                RLSで自分の記録だけを表示
              </span>
              <button
                type="button"
                onClick={sendPasswordReset}
                disabled={submitting}
                className="font-semibold text-[#067f95] transition hover:text-[#045f70] disabled:cursor-not-allowed disabled:opacity-60"
              >
                パスワード再設定
              </button>
            </div>

            {message && <p className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-2.5 text-sm text-[#dc2626]">{message}</p>}
            {info && <p className="rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-2.5 text-sm text-[#047857]">{info}</p>}

            {/* Login Button */}
            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center rounded-md bg-[#0796ac] text-sm font-bold text-white shadow-md shadow-[#0796ac]/25 transition hover:bg-[#067f95] hover:shadow-lg hover:shadow-[#0796ac]/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? '処理中...' : mode === 'login' ? 'ログイン' : '新規登録'}
            </button>

            {/* Switch mode */}
            <p className="border-t border-[#e5e7eb] pt-5 text-center text-sm text-[#6b7280]">
              {mode === 'login' ? (
                <>
                  アカウントをお持ちでない方は{' '}
                  <button type="button" onClick={() => { setMode('signup'); setMessage(''); setInfo(''); }} className="font-bold text-[#067f95] transition hover:text-[#045f70]">
                    新規登録
                  </button>
                </>
              ) : (
                <>
                  すでにアカウントをお持ちの方は{' '}
                  <button type="button" onClick={() => { setMode('login'); setMessage(''); setInfo(''); }} className="font-bold text-[#067f95] transition hover:text-[#045f70]">
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
              <svg width="26" height="32" viewBox="0 0 32 40" fill="none" aria-hidden="true">
                <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z" fill="white" fillOpacity="0.86"/>
                <circle cx="16" cy="14" r="5" fill="#3B82F6" fillOpacity="0.92"/>
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
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
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
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<View>('map');
  const [memories, setMemories] = useState<Memory[]>(defaultMemories);
  const [selectedId, setSelectedId] = useState<string | undefined>(defaultMemories[0]?.id);
  const [filters, setFilters] = useState({ year: 'すべて', tag: 'すべて', emotion: 'すべて' });
  const [upload, setUpload] = useState<UploadState>(emptyUpload);
  const [draft, setDraft] = useState<DraftMemory>(createDraftFromMemory());
  const [mapPicking, setMapPicking] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true);

  useEffect(() => {
    if (hasSupabaseConfig && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setSignedIn(Boolean(data.session));
        setUserId(data.session?.user.id);
      });
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        setSignedIn(Boolean(session));
        setUserId(session?.user?.id);
      });
      return () => subscription.subscription.unsubscribe();
    }

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
    if (!(hasSupabaseConfig && supabase) || !userId) return;
    let active = true;
    supabase
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('思い出の読み込みに失敗しました', error);
          return;
        }
        const mapped = (data ?? []).map(rowToMemory);
        setMemories(mapped);
        setSelectedId(mapped[0]?.id);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (hasSupabaseConfig) return;
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
    if (!acceptedImageTypes.has(file.type)) {
      setUpload({
        ...emptyUpload,
        status: 'error',
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        message: 'JPG / PNG / HEIC / WebP形式の画像を選択してください',
      });
      return;
    }
    if (file.size > maxUploadBytes) {
      setUpload({
        ...emptyUpload,
        status: 'error',
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        message: '画像サイズは8MB以下にしてください',
      });
      return;
    }

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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (hasSupabaseConfig && supabase) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          throw new Error('ログインが必要です');
        }
        headers.Authorization = `Bearer ${token}`;
      } else {
        throw new Error('Supabase is not configured');
      }

      const response = await fetch('/api/predict-location', {
        method: 'POST',
        headers,
        body: JSON.stringify({ image: upload.previewUrl }),
      });

      if (!response.ok) {
        throw new Error('API Error');
      }

      const result = await response.json();
      if (
        typeof result.latitude !== 'number' ||
        typeof result.longitude !== 'number' ||
        typeof result.placeName !== 'string' ||
        result.latitude < -90 ||
        result.latitude > 90 ||
        result.longitude < -180 ||
        result.longitude > 180
      ) {
        throw new Error('Invalid AI response');
      }
      
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

  const saveDraft = async () => {
    if (!draft.title.trim()) return;

    const normalized: DraftMemory = {
      ...draft,
      title: draft.title.trim(),
      placeName: draft.placeName.trim(),
    };

    if (hasSupabaseConfig && supabase && userId) {
      if (draft.id) {
        let { data, error } = await supabase
          .from('memories')
          .update({ ...memoryToRow(normalized, userId), updated_at: new Date().toISOString() })
          .eq('id', draft.id)
          .select()
          .single();
        if (isMissingTagsColumnError(error)) {
          const fallback = await supabase
            .from('memories')
            .update({ ...memoryToLegacyRow(normalized, userId), updated_at: new Date().toISOString() })
            .eq('id', draft.id)
            .select()
            .single();
          data = fallback.data;
          error = fallback.error;
        }
        if (error || !data) {
          alert(`保存に失敗しました: ${error?.message ?? '不明なエラー'}`);
          return;
        }
        const saved = rowToMemory(data);
        setMemories((current) => current.map((memory) => (memory.id === saved.id ? saved : memory)));
        setSelectedId(saved.id);
      } else {
        let { data, error } = await supabase
          .from('memories')
          .insert(memoryToRow(normalized, userId))
          .select()
          .single();
        if (isMissingTagsColumnError(error)) {
          const fallback = await supabase
            .from('memories')
            .insert(memoryToLegacyRow(normalized, userId))
            .select()
            .single();
          data = fallback.data;
          error = fallback.error;
        }
        if (error || !data) {
          alert(`保存に失敗しました: ${error?.message ?? '不明なエラー'}`);
          return;
        }
        const saved = rowToMemory(data);
        setMemories((current) => [saved, ...current]);
        setSelectedId(saved.id);
      }
    } else if (draft.id) {
      setMemories((current) =>
        current.map((memory) => (memory.id === draft.id ? { ...memory, ...normalized } : memory)),
      );
      setSelectedId(draft.id);
    } else {
      const memory: Memory = {
        ...normalized,
        id: crypto.randomUUID(),
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

  const deleteMemory = async (id: string) => {
    if (hasSupabaseConfig && supabase && userId) {
      const { error } = await supabase.from('memories').delete().eq('id', id);
      if (error) {
        alert(`削除に失敗しました: ${error.message}`);
        return;
      }
    }
    setMemories((current) => current.filter((memory) => memory.id !== id));
    const next = memories.find((memory) => memory.id !== id);
    setSelectedId(next?.id);
  };

  const logout = async () => {
    if (hasSupabaseConfig && supabase) await supabase.auth.signOut();
    localStorage.removeItem(authKey);
    setUserId(undefined);
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
