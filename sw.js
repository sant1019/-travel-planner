// 旅遊小秘書 Service Worker：頁面優先連網、斷網時回退快取；靜態資源先給快取再背景更新。
const VER = 'fc-71a';
const CACHE = 'trip-' + VER;
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html']).catch(() => {})).then(() => self.skipWaiting()));
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
  if (!sameOrigin && !CDN.includes(url.hostname)) return;
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => put(req, r)).catch(() => hit);
    return hit || net;
  }));
});
