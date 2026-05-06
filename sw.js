// Clock Pro — Service Worker v4.0
// Features: offline cache, alarm notifications, lock-screen timer/stopwatch

const CACHE_NAME = 'clock-pro-v4';
const FONT_CACHE = 'clock-pro-fonts-v1';

const APP_SHELL = [
  './', './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(caches.open(FONT_CACHE).then(cache =>
      cache.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(r => { cache.put(event.request, r.clone()); return r; }).catch(() => cached);
      })
    ));
    return;
  }
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(r => {
          if (r && r.status === 200 && r.type === 'basic')
            caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone()));
          return r;
        }).catch(() => event.request.destination === 'document' ? caches.match('./index.html') : undefined);
      })
    );
  }
});

// ── NOTIFICATION CLICK (lock screen actions) ───────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action;
  const data   = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const app = clients.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
      if (action === 'snooze') {
        if (app) { app.focus(); app.postMessage({ type: 'SNOOZE_ALARM', alarmId: data.alarmId }); }
        else self.clients.openWindow('./index.html#alarm');
      } else {
        if (app) { app.focus(); app.postMessage({ type: 'DISMISS_ALARM', alarmId: data.alarmId }); }
        else self.clients.openWindow('./index.html#' + (data.tab || ''));
      }
    })
  );
});

// ── MESSAGES FROM PAGE ─────────────────────────────────────────────────
self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg) return;
  switch (msg.type) {

    case 'RING_ALARM':
      self.registration.showNotification('⏰  ' + (msg.label || 'Alarm'), {
        body: msg.time + (msg.label ? ' — ' + msg.label : ''),
        icon: './icons/icon-192.png', badge: './icons/icon-96.png',
        tag: 'alarm-' + msg.alarmId, renotify: true, requireInteraction: true,
        vibrate: [500,200,500,200,500,200,800], silent: false,
        data: { alarmId: msg.alarmId, tab: 'alarm' },
        actions: [{ action:'snooze', title:'💤 Snooze' }, { action:'dismiss', title:'✓ Dismiss' }],
      });
      break;

    case 'CLEAR_ALARM':
      self.registration.getNotifications({ tag: 'alarm-' + msg.alarmId })
        .then(ns => ns.forEach(n => n.close()));
      break;

    case 'TIMER_UPDATE': {
      if (!msg.running) {
        self.registration.getNotifications({ tag: 'timer-' + msg.timerId }).then(ns => ns.forEach(n => n.close()));
        break;
      }
      const m = Math.floor(msg.remaining/60), s = msg.remaining%60;
      const disp = String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
      const pct  = msg.total > 0 ? Math.round((1 - msg.remaining/msg.total)*100) : 0;
      self.registration.showNotification('⏳  ' + disp + ' — ' + (msg.label||'Timer'), {
        body: pct+'% complete · Tap to open', icon: './icons/icon-192.png', badge: './icons/icon-96.png',
        tag: 'timer-'+msg.timerId, renotify: false, silent: true,
        data: { tab:'timer' }, actions: [{ action:'open', title:'Open App' }],
      });
      break;
    }

    case 'TIMER_DONE':
      self.registration.getNotifications({ tag: 'timer-'+msg.timerId }).then(ns => ns.forEach(n => n.close()));
      self.registration.showNotification('✅  ' + (msg.label||'Timer') + ' done!', {
        body: 'Your timer has ended. Tap to open.',
        icon: './icons/icon-192.png', badge: './icons/icon-96.png',
        tag: 'done-'+msg.timerId, renotify: true, requireInteraction: true,
        vibrate: [300,100,300,100,600],
        data: { tab:'timer' }, actions: [{ action:'open', title:'OK' }],
      });
      break;

    case 'STOPWATCH_UPDATE': {
      if (!msg.running) {
        self.registration.getNotifications({ tag:'stopwatch' }).then(ns => ns.forEach(n => n.close()));
        break;
      }
      const mm = Math.floor(msg.elapsed/60000), ss = Math.floor((msg.elapsed%60000)/1000),
            cs = Math.floor((msg.elapsed%1000)/10);
      const d = String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0')+'.'+String(cs).padStart(2,'0');
      self.registration.showNotification('⏱  ' + d, {
        body: 'Stopwatch running · Tap to open', icon: './icons/icon-192.png', badge: './icons/icon-96.png',
        tag: 'stopwatch', renotify: false, silent: true,
        data: { tab:'stopwatch' }, actions: [{ action:'open', title:'Open App' }],
      });
      break;
    }

    case 'INTERVAL_UPDATE': {
      if (!msg.running) {
        self.registration.getNotifications({ tag:'interval' }).then(ns => ns.forEach(n => n.close()));
        break;
      }
      const im = Math.floor(msg.remaining/60), is_ = msg.remaining%60;
      const id_ = String(im).padStart(2,'0')+':'+String(is_).padStart(2,'0');
      self.registration.showNotification('🔄  ' + msg.phase + ' — ' + id_, {
        body: msg.name+' · Round '+msg.round+'/'+msg.totalRounds+' · Tap to return',
        icon: './icons/icon-192.png', badge: './icons/icon-96.png',
        tag: 'interval', renotify: false, silent: true,
        data: { tab:'interval' }, actions: [{ action:'open', title:'Open App' }],
      });
      break;
    }

    case 'SKIP_WAITING': self.skipWaiting(); break;
    case 'KEEP_ALIVE':   event.ports?.[0]?.postMessage({ type:'ALIVE' }); break;
  }
});
