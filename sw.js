// Cache name com timestamp — muda automaticamente a cada deploy via GitHub Actions
// Se não usar CI, pode deixar fixo; o que importa é a estratégia de fetch abaixo.
const CACHE_NAME = 'envolvi-v' + self.registration?.scope?.split('/').pop() || 'envolvi';

const STATIC_ASSETS = [
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// HTML files — nunca ficam presos no cache
const HTML_FILES = [
  './coach.html',
  './aluno.html',
  './index.html'
];

// Install — cache apenas ícones e assets imutáveis
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW: some assets failed to cache', err);
      });
    })
  );
  // Ativa imediatamente sem esperar fechar abas antigas
  self.skipWaiting();
});

// Activate — limpa todos os caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        if (k !== CACHE_NAME) {
          console.log('SW: deleting old cache', k);
          return caches.delete(k);
        }
      }))
    ).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls — sempre rede, nunca cache
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('mercadopago') ||
    url.hostname.includes('resend') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/functions/')
  ) {
    return;
  }

  // Google Fonts — cache first (imutáveis)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // HTML files — network first, sem cache persistente
  // Garante que o usuário sempre veja a versão mais recente
  const isHtml = HTML_FILES.some(f => url.pathname.endsWith(f.replace('./', '/')))
    || url.pathname === '/'
    || url.pathname.endsWith('.html');

  if (isHtml) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          // Atualiza o cache com a versão nova
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Offline — serve do cache se disponível
          return caches.match(event.request).then(cached =>
            cached || new Response(
              '<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Você está offline</h2><p>Conecte-se para carregar o envolvi.</p></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          );
        })
    );
    return;
  }

  // Outros assets (ícones, manifest) — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => cached || new Response('Not found', { status: 404 }));
    })
  );
});

// Mensagem para forçar atualização imediata quando solicitado pelo app
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
