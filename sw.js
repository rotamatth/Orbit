// sw.js — offline shell. Bump CACHE when you change any file.
const CACHE = 'orbit-v8';

const SHELL = [
  './', './index.html', './styles.css', './ux-v4.css', './ux-v5.css', './manifest.webmanifest',
  './app/main-v5.js', './app/ux-v4.js', './app/ux-v5.js', './app/state.js', './app/cycle.js',
  './app/views.js', './app/more.js', './app/connect.js', './app/ui.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];
self.addEventListener('install',(e)=>{e.waitUntil(caches.open(CACHE).then((c)=>Promise.allSettled(SHELL.map((u)=>c.add(u)))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',(e)=>{e.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((k)=>k!==CACHE).map((k)=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',(e)=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.pathname.includes('/rest/v1/'))return;if(url.hostname.endsWith('gstatic.com')||url.hostname.endsWith('googleapis.com')){e.respondWith(caches.match(req).then((hit)=>hit||fetch(req).then((res)=>{const copy=res.clone();caches.open(CACHE).then((c)=>c.put(req,copy));return res;}).catch(()=>hit)));return;}if(url.origin!==location.origin)return;e.respondWith(fetch(req).then((res)=>{const copy=res.clone();caches.open(CACHE).then((c)=>c.put(req,copy));return res;}).catch(()=>caches.match(req).then((hit)=>hit||caches.match('./index.html'))));});
self.addEventListener('notificationclick',(e)=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then((list)=>{for(const c of list)if('focus'in c)return c.focus();return clients.openWindow('./index.html');}));});
