// An update becomes usable only after the complete, versioned shell is cached.
const CACHE = 'orbit-v12';
const SHELL = [
  './','./index.html','./styles.css','./reliability-v12.css','./ux-v4.css','./ux-v5.css','./reliability-v7.css','./pill-v11.css','./manifest.webmanifest',
  './app/main-v5.js','./app/ux-v4.js','./app/ux-v5.js','./app/ux-v6.js','./app/reliability-v7.js','./app/pill-v11.js','./app/pill-model.js','./app/state.js','./app/cycle.js',
  './app/views.js','./app/more.js','./app/connect.js','./app/ui.js','./app/storage-ui.js','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE_UPDATE') self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('orbit-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(req);
    if(hit)return hit;
    try { const res=await fetch(req); return res; }
    catch { if(req.mode==='navigate') return (await cache.match('./index.html')) || Response.error(); return Response.error(); }
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list[0]?.focus()||clients.openWindow('./index.html')));
});
