// 旅遊小秘書 Service Worker：頁面優先連網、斷網時回退快取；靜態資源先給快取再背景更新。
const VER = 'fc-74';
const CACHE = 'trip-' + VER;
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com'];
// 第一次安裝就把外部資源（樣式、圖示、字型、腳本）一併存起來，避免第一次離線時畫面跑版。
const EXTERNAL = [
  ['./tailwind.css', 'css'],
  ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'no-cors'],
  ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', 'no-cors'],
  ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', 'css'],
  ['https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap', 'css']
];
async function precacheOne(cache, url, kind) {
  try {
    if (kind === 'css') {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return;
      const text = await res.clone().text();
      await cache.put(url, res);
      const files = [...text.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].trim().replace(/^['"]|['"]$/g, '')).filter(u => !u.startsWith('data:'));
      const uniq = [...new Set(files.map(u => new URL(u, url).href))];
      await Promise.allSettled(uniq.map(async u => { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await cache.put(u, r); }));
    } else {
      const res = await fetch(url, { mode: kind });
      if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
    }
  } catch (e) {}
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(['./', './index.html']).catch(() => {});
    await Promise.allSettled(EXTERNAL.map(([u, k]) => precacheOne(c, u, k)));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('trip-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function put(req, res) {
  if (res && (res.ok || res.type === 'opaque')) { const c = await caches.open(CACHE); try { await c.put(req, res.clone()); } catch (e) {} }
  return res;
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co') || url.pathname.includes('/realtime/')) return; // 資料 API 一律連網
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => put(new Request('./index.html'), r)).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.endsWith('/tailwind.css')) { // 樣式檔：先連網（GitHub 重新編譯後立刻吃到新版），斷網才用快取
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => put(req, r)).catch(() => caches.match(req)));
    return;
  }
  if (!sameOrigin && !CDN.includes(url.hostname)) return;
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => put(req, r)).catch(() => hit);
    return hit || net;
  }));
});
