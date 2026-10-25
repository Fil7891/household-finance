const CACHE="household-finance-v4";
const CORE=["./","./index.html","./manifest.json?v=4","./css/style.css?v=4","./js/app.js?v=4"];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));});
self.addEventListener("activate",event=>{event.waitUntil((async()=>{for(const key of await caches.keys()){if(key!==CACHE)await caches.delete(key);}await self.clients.claim();})());});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  const isAppAsset=url.origin===self.location.origin && (url.pathname.endsWith(".html")||url.pathname.endsWith(".css")||url.pathname.endsWith(".js")||url.pathname.endsWith("/"));
  if(isAppAsset){
    event.respondWith((async()=>{
      try{const fresh=await fetch(event.request,{cache:"no-store"});const cache=await caches.open(CACHE);cache.put(event.request,fresh.clone());return fresh;}
      catch(e){return (await caches.match(event.request)) || (await caches.match("./index.html"));}
    })());
  }
});
