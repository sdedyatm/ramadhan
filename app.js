/**
 * ProPWA — app.js
 * CV Amelia Trans Mandiri · Ramadhan 1447 H Edition
 * Handles: iframe loader, SPA router, permissions, image viewer, state
 * Vanilla ES6+, zero dependencies
 * @version 2.0.0
 */

'use strict';

/* ═══════════════════════════════════════════════════
   STATE MANAGER
═══════════════════════════════════════════════════ */
const State = (() => {
  const _s = {
    view: 'landing',         // 'landing' | 'iframe' | 'spa'
    currentSpa: '/',
    currentUrl: null,
    online: navigator.onLine,
    installPrompt: null,
    permissions: {},
    geoWatchId: null,
    mediaStream: null,
    wakeLock: null,
  };
  const _l = {};
  return {
    get: k => _s[k],
    set(k, v) { _s[k] = v; (_l[k] || []).forEach(fn => fn(v)); },
    subscribe(k, fn) { (_l[k] = _l[k] || []).push(fn); },
  };
})();

/* ═══════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════ */
const Utils = {
  toast(msg, type = 'info', dur = 3200) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
    t.className = 'toast';
    t.textContent = `${icons[type] || 'ℹ️'} ${msg}`;
    c.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      t.addEventListener('animationend', () => t.remove());
    }, dur);
  },

  loader(on) {
    document.getElementById('page-loader').classList.toggle('active', on);
  },

  loaderBar(state) {
    // state: 'start' | 'done' | 'reset'
    const bar = document.getElementById('loader-bar');
    if (!bar) return;
    bar.className = 'loader-bar';
    if (state === 'start') {
      requestAnimationFrame(() => bar.classList.add('running'));
    } else if (state === 'done') {
      bar.classList.add('done');
      setTimeout(() => { bar.className = 'loader-bar'; }, 700);
    }
  },

  clamp: (v, mn, mx) => Math.min(Math.max(v, mn), mx),
};

/* ═══════════════════════════════════════════════════
   VIEW SWITCHER
   Manages which view is visible:
   landing | iframe | spa
═══════════════════════════════════════════════════ */
const ViewSwitcher = {
  _els() {
    return {
      landing: document.getElementById('landing-screen'),
      frame:   document.getElementById('main-frame'),
      spa:     document.getElementById('spa-page'),
      back:    document.getElementById('btn-back-home'),
    };
  },

  showLanding() {
    const { landing, frame, spa, back } = this._els();
    if (!landing) return;
    frame.classList.remove('active'); frame.src = 'about:blank';
    spa.classList.remove('active');   spa.innerHTML = '';
    landing.classList.remove('hidden');
    back.classList.remove('show');
    State.set('view', 'landing');
    // Update nav active
    document.querySelectorAll('#nav-menu .nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.spa === '/');
    });
    window.history.pushState({ view: 'landing' }, '', './');
    document.body.style.overflow = '';
  },

  showIframe(url, label = '') {
    const { landing, frame, spa, back } = this._els();
    landing.classList.add('hidden');
    spa.classList.remove('active'); spa.innerHTML = '';
    Utils.loaderBar('start');
    frame.onload = () => { Utils.loaderBar('done'); };
    frame.src = url;
    frame.classList.add('active');
    back.classList.add('show');
    State.set('view', 'iframe');
    State.set('currentUrl', url);
    window.history.pushState({ view: 'iframe', url, label }, '', './');
    Utils.toast(`Membuka ${label || 'halaman'}...`, 'info', 1800);
  },

  showSpa(path) {
    const { landing, frame, spa, back } = this._els();
    if (path === '/') { this.showLanding(); return; }
    landing.classList.add('hidden');
    frame.classList.remove('active'); frame.src = 'about:blank';

    Utils.loader(true);
    spa.classList.remove('active');
    spa.style.opacity = '0';
    spa.style.transform = 'translateY(10px)';

    setTimeout(() => {
      spa.innerHTML = `<div class="page-inner">${SpaPages[path] ? SpaPages[path]() : '<p>Halaman tidak ditemukan</p>'}</div>`;
      spa.classList.add('active');
      spa.style.transition = 'opacity 0.35s var(--easing,ease), transform 0.35s var(--easing,ease)';
      spa.style.opacity = '1';
      spa.style.transform = 'translateY(0)';
      Utils.loader(false);
      back.classList.add('show');
      State.set('view', 'spa');
      State.set('currentSpa', path);
      document.querySelectorAll('#nav-menu .nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.spa === path);
      });
      window.history.pushState({ view: 'spa', path }, '', './');
      afterSpaRender(path);
    }, 100);
  },
};

/* ═══════════════════════════════════════════════════
   AFTER-RENDER HOOKS
═══════════════════════════════════════════════════ */
function afterSpaRender(path) {
  if (path === '/device') {
    DevicePage.renderSystemInfo();
    DevicePage.initNetworkListener();
  }
  if (path === '/offline') {
    OfflinePage.init();
  }
}

/* ═══════════════════════════════════════════════════
   SPA PAGE TEMPLATES
═══════════════════════════════════════════════════ */
const SpaPages = {
  '/permissions': () => {
    const perms = State.get('permissions');
    const cards = PermissionManager.PERMISSIONS.map(p => {
      const supported = PermissionManager.isSupported(p);
      const status    = supported ? (perms[p.id] || 'unknown') : 'unsupported';
      return `
        <div class="perm-card ${status}" id="pcard-${p.id}" data-perm-id="${p.id}">
          <div class="perm-card-header">
            <div class="perm-icon-wrap">${p.icon}</div>
            <div class="perm-meta">
              <div class="perm-name">${p.name}</div>
              <div class="perm-desc">${p.desc}</div>
            </div>
          </div>
          <div class="perm-card-footer">
            <div class="flex items-center gap-8" id="pstatus-${p.id}">
              <div class="dot dot-${status}"></div>
              <span class="badge badge-${status}">${status.toUpperCase()}</span>
            </div>
            ${supported
              ? `<button class="btn btn-ghost btn-sm" onclick="PermCenter.request('${p.id}')">Minta Izin</button>`
              : `<span class="text-xs text-faint">Tidak didukung</span>`}
          </div>
        </div>`;
    }).join('');
    return `
      <p class="section-label">Hardware &amp; Browser API</p>
      <h2 class="section-title">Permission Center</h2>
      <p class="text-muted text-sm" style="margin-bottom:22px;line-height:1.65">
        Kelola akses ke hardware dan fitur browser. Semua izin mengikuti kebijakan keamanan browser standar.
      </p>
      <div class="grid-2">${cards}</div>`;
  },

  '/viewer': () => `
  <div style="position:relative;width:100%;height:calc(100dvh - 140px);overflow:hidden;border-radius:14px">
    <iframe
      src="./imsyak.html"
      style="position:absolute;inset:0;width:100%;height:100%;border:none"
      loading="lazy"
      referrerpolicy="no-referrer">
    </iframe>
  </div>
`,

  '/device': () => `
    <p class="section-label">Diagnostik Hardware</p>
    <h2 class="section-title">Info Perangkat</h2>
    <div class="grid-2">
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:14px">🧭 Orientasi Perangkat</h3>
        <div style="text-align:center;margin-bottom:14px">
          <div id="orientation-visual"><span style="font-size:1.5rem">📱</span></div>
        </div>
        <div class="geo-display" id="orientation-data">alpha: — °&#10;beta:  — °&#10;gamma: — °</div>
        <button class="btn btn-ghost btn-sm full-width mt-12" onclick="DevicePage.startOrientation()">Mulai Tracking</button>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:14px">📍 Geolokasi</h3>
        <div class="geo-display" id="geo-data">latitude:  —&#10;longitude: —&#10;accuracy:  —&#10;altitude:  —</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary btn-sm" onclick="DevicePage.startGeo()" style="flex:1">Watch Position</button>
          <button class="btn btn-ghost btn-sm" onclick="DevicePage.stopGeo()">Stop</button>
        </div>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:14px">📷 Kamera Preview</h3>
        <video id="camera-preview" autoplay muted playsinline></video>
        <div id="audio-bar-wrap" style="display:none"><div id="audio-bar"></div></div>
        <div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="DevicePage.startCamera()">Kamera</button>
          <button class="btn btn-ghost btn-sm" onclick="DevicePage.startMic()">Mic Level</button>
          <button class="btn btn-ghost btn-sm" onclick="DevicePage.stopMedia()">Stop</button>
        </div>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:14px">💻 Sistem</h3>
        <div class="geo-display" id="system-info">Loading...</div>
        <button class="btn btn-ghost btn-sm full-width mt-12" onclick="DevicePage.refreshSystemInfo()">Refresh</button>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:10px">☀️ Screen Wake Lock</h3>
        <p class="text-muted text-sm" style="margin-bottom:12px;line-height:1.5">Cegah layar mati saat app aktif.</p>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="DevicePage.requestWakeLock()">Aktifkan</button>
          <button class="btn btn-ghost btn-sm" onclick="DevicePage.releaseWakeLock()">Lepas</button>
          <span class="text-xs text-faint" id="wakelock-status">Tidak aktif</span>
        </div>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:10px">🔔 Notifikasi</h3>
        <div class="notification-preview">
          <span style="font-size:1.35rem">📣</span>
          <div>
            <div style="font-size:0.83rem;font-weight:600">ProPWA Notification</div>
            <div style="font-size:0.72rem;color:var(--text3)">Test notification</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm full-width mt-12" onclick="DevicePage.sendNotification()">Kirim Test</button>
      </div>
    </div>`,

  '/offline': () => `
    <p class="section-label">Service Worker</p>
    <h2 class="section-title">Status Offline</h2>
    <div class="grid-2">
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:12px">📡 Status Jaringan</h3>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:12px">
          <div class="dot dot-${navigator.onLine ? 'granted' : 'denied'}" id="net-dot" style="width:9px;height:9px"></div>
          <span style="font-weight:600" id="net-status">${navigator.onLine ? 'Online' : 'Offline'}</span>
        </div>
        <div class="geo-display">
          Tipe: <span id="net-type">${'connection' in navigator ? (navigator.connection.effectiveType || '—') : '—'}</span>&#10;Downlink: <span id="net-dl">${'connection' in navigator ? (navigator.connection.downlink || '—') + ' Mbps' : '—'}</span>&#10;RTT: <span id="net-rtt">${'connection' in navigator ? (navigator.connection.rtt || '—') + ' ms' : '—'}</span>
        </div>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:12px">🗃️ Cache Storage</h3>
        <div class="geo-display" id="cache-info">Memuat...</div>
        <button class="btn btn-ghost btn-sm full-width mt-12" onclick="OfflinePage.refreshCache()">Refresh</button>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:12px">⚙️ Service Worker</h3>
        <div class="geo-display" id="sw-info">Memeriksa...</div>
      </div>
      <div class="card">
        <h3 style="font-size:0.92rem;font-weight:600;margin-bottom:10px">🔄 Aksi Cache</h3>
        <p class="text-muted text-sm" style="margin-bottom:12px;line-height:1.5">Hapus atau reload cache service worker.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="OfflinePage.clearCache()">Hapus Cache</button>
          <button class="btn btn-primary btn-sm" onclick="location.reload()">Hard Reload</button>
        </div>
      </div>
    </div>`,
};

/* ═══════════════════════════════════════════════════
   PERMISSION MANAGER
═══════════════════════════════════════════════════ */
const PermissionManager = (() => {
  const PERMISSIONS = [
    { id:'geolocation',    name:'Geolokasi',         icon:'📍', desc:'Akses lokasi GPS real-time.',                      api:'geolocation',  queryName:'geolocation' },
    { id:'camera',         name:'Kamera',             icon:'📷', desc:'Akses kamera untuk foto/video.',                  api:'mediaDevices', queryName:'camera' },
    { id:'microphone',     name:'Mikrofon',           icon:'🎤', desc:'Akses mikrofon untuk audio.',                     api:'mediaDevices', queryName:'microphone' },
    { id:'notifications',  name:'Notifikasi',         icon:'🔔', desc:'Tampilkan notifikasi sistem.',                    api:'notifications',queryName:'notifications' },
    { id:'clipboard-read', name:'Clipboard Read',     icon:'📋', desc:'Baca konten dari clipboard.',                     api:'clipboard',    queryName:'clipboard-read' },
    { id:'clipboard-write',name:'Clipboard Write',    icon:'✏️', desc:'Tulis ke clipboard sistem.',                      api:'clipboard',    queryName:'clipboard-write' },
    { id:'nfc',            name:'NFC',                icon:'📶', desc:'Akses Near-Field Communication.',                 api:'nfc',          queryName:'nfc' },
    { id:'wake-lock',      name:'Screen Wake Lock',   icon:'☀️', desc:'Cegah layar mati saat aktif.',                   api:'wakeLock',     queryName:'screen-wake-lock' },
    { id:'device-orientation',name:'Orientasi',       icon:'🧭', desc:'Akses giroskop dan akselerometer.',               api:'orientation',  queryName:null },
    { id:'contacts',       name:'Contacts Picker',    icon:'👤', desc:'Pilih kontak dari buku alamat.',                  api:'contacts',     queryName:null },
    { id:'file-system',    name:'File System Access', icon:'📂', desc:'Buka dan simpan file lokal.',                     api:'fileSystem',   queryName:null },
    { id:'fullscreen',     name:'Fullscreen',         icon:'⛶',  desc:'Tampilkan app dalam mode layar penuh.',           api:'fullscreen',   queryName:'fullscreen' },
  ];

  function isSupported(p) {
    switch(p.api) {
      case 'geolocation':   return 'geolocation' in navigator;
      case 'mediaDevices':  return 'mediaDevices' in navigator;
      case 'notifications': return 'Notification' in window;
      case 'clipboard':     return 'clipboard' in navigator;
      case 'nfc':           return 'NDEFReader' in window;
      case 'wakeLock':      return 'wakeLock' in navigator;
      case 'orientation':   return 'DeviceOrientationEvent' in window;
      case 'contacts':      return 'contacts' in navigator && 'ContactsManager' in window;
      case 'fileSystem':    return 'showOpenFilePicker' in window;
      case 'fullscreen':    return 'requestFullscreen' in document.documentElement;
      default: return false;
    }
  }

  async function queryStatus(p) {
    if (!isSupported(p)) return 'unsupported';
    if (!p.queryName) return 'unknown';
    try {
      if ('permissions' in navigator) {
        const r = await navigator.permissions.query({ name: p.queryName });
        return r.state;
      }
    } catch(_) {}
    return 'unknown';
  }

  async function request(id) {
    const p = PERMISSIONS.find(x => x.id === id);
    if (!p || !isSupported(p)) return 'unsupported';
    try {
      switch(p.api) {
        case 'geolocation':
          return await new Promise(res =>
            navigator.geolocation.getCurrentPosition(
              () => res('granted'),
              e  => res(e.code === 1 ? 'denied' : 'prompt')
            )
          );
        case 'mediaDevices': {
          const c = p.id === 'camera' ? { video: true } : { audio: true };
          const s = await navigator.mediaDevices.getUserMedia(c);
          s.getTracks().forEach(t => t.stop());
          return 'granted';
        }
        case 'notifications': {
          const r = await Notification.requestPermission();
          return r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'prompt';
        }
        case 'clipboard':
          if (p.id === 'clipboard-write') { await navigator.clipboard.writeText('test'); return 'granted'; }
          else { await navigator.clipboard.readText(); return 'granted'; }
        case 'nfc': { const n = new NDEFReader(); await n.scan(); return 'granted'; }
        case 'wakeLock': { const wl = await navigator.wakeLock.request('screen'); wl.release(); return 'granted'; }
        case 'orientation':
          if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const r = await DeviceOrientationEvent.requestPermission();
            return r === 'granted' ? 'granted' : 'denied';
          }
          return 'granted';
        case 'contacts': { await navigator.contacts.select(['name'], { multiple: false }); return 'granted'; }
        case 'fileSystem': { const [h] = await window.showOpenFilePicker(); return h ? 'granted' : 'prompt'; }
        case 'fullscreen': { await document.documentElement.requestFullscreen(); return 'granted'; }
        default: return 'unknown';
      }
    } catch(e) {
      return (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'denied';
    }
  }

  async function initAll() {
    const s = {};
    await Promise.all(PERMISSIONS.map(async p => { s[p.id] = await queryStatus(p); }));
    State.set('permissions', s);
    return s;
  }

  return { PERMISSIONS, isSupported, queryStatus, request, initAll };
})();

/* ═══════════════════════════════════════════════════
   PERMISSION CENTER UI CONTROLLER
═══════════════════════════════════════════════════ */
const PermCenter = {
  async request(id) {
    Utils.toast(`Meminta izin ${id}...`, 'info', 1600);
    const status = await PermissionManager.request(id);
    const perms  = { ...State.get('permissions'), [id]: status };
    State.set('permissions', perms);
    // Update card DOM
    const card  = document.getElementById(`pcard-${id}`);
    const swrap = document.getElementById(`pstatus-${id}`);
    if (card)  card.className  = `perm-card ${status}`;
    if (swrap) swrap.innerHTML = `<div class="dot dot-${status}"></div><span class="badge badge-${status}">${status.toUpperCase()}</span>`;
    const msgs = { granted:'✅ Akses diberikan', denied:'❌ Akses ditolak', prompt:'⚠️ Menunggu keputusan' };
    Utils.toast(`${id}: ${msgs[status] || status}`, status === 'granted' ? 'success' : status === 'denied' ? 'error' : 'warn');
  },
};

/* ═══════════════════════════════════════════════════
   IMAGE VIEWER
═══════════════════════════════════════════════════ */
const ImageViewer = (() => {
  let scale = 1, minScale = 0.05, maxScale = 12;
  let ox = 0, oy = 0;
  let dragging = false, lx = 0, ly = 0;
  let lastDist = 0, pinchScale0 = 1;

  const stage = () => document.getElementById('viewer-stage');
  const img   = () => document.getElementById('viewer-img');
  const lbl   = () => document.getElementById('zoom-label');

  function apply(animated = false) {
    const el = img(); if (!el) return;
    el.style.transition = animated ? 'transform 0.25s cubic-bezier(0.23,1,0.32,1)' : '';
    el.style.transform  = `translate(${ox}px,${oy}px) scale(${scale})`;
    if (lbl()) lbl().textContent = Math.round(scale * 100) + '%';
  }

  function reset(anim = true) { scale = 1; ox = 0; oy = 0; apply(anim); }

  function zoom(f, cx = 0, cy = 0) {
    const ns = Utils.clamp(scale * f, minScale, maxScale);
    const ds = ns / scale;
    ox = cx + (ox - cx) * ds; oy = cy + (oy - cy) * ds;
    scale = ns; apply();
  }

  function center(e) {
    const [t1, t2] = e.touches;
    return { x:(t1.clientX+t2.clientX)/2, y:(t1.clientY+t2.clientY)/2, d:Math.hypot(t1.clientX-t2.clientX, t1.clientY-t2.clientY) };
  }

  function bind() {
    const s = stage();
    s.addEventListener('wheel', e => {
      e.preventDefault();
      const r = s.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.13 : 1/1.13, e.clientX - r.left - r.width/2, e.clientY - r.top - r.height/2);
    }, { passive: false });

    s.addEventListener('mousedown', e => { dragging=true; lx=e.clientX; ly=e.clientY; s.classList.add('dragging'); });
    window.addEventListener('mousemove', e => { if(!dragging) return; ox+=e.clientX-lx; oy+=e.clientY-ly; lx=e.clientX; ly=e.clientY; apply(); });
    window.addEventListener('mouseup',   () => { dragging=false; s.classList.remove('dragging'); });

    s.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { const c=center(e); lastDist=c.d; pinchScale0=scale; lx=c.x; ly=c.y; }
      else { dragging=true; lx=e.touches[0].clientX; ly=e.touches[0].clientY; }
    }, { passive: true });

    s.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const c=center(e), r=s.getBoundingClientRect();
        const cx=c.x-r.left-r.width/2, cy=c.y-r.top-r.height/2;
        const ns=Utils.clamp(pinchScale0*(c.d/lastDist), minScale, maxScale);
        const ds=ns/scale;
        ox=cx+(ox-cx)*ds; oy=cy+(oy-cy)*ds; scale=ns;
        ox+=c.x-lx; oy+=c.y-ly; lx=c.x; ly=c.y; apply();
      } else if (e.touches.length===1 && dragging) {
        ox+=e.touches[0].clientX-lx; oy+=e.touches[0].clientY-ly;
        lx=e.touches[0].clientX; ly=e.touches[0].clientY; apply();
      }
    }, { passive: false });

    s.addEventListener('touchend', () => { dragging=false; lastDist=0; });
    document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(1.28));
    document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(1/1.28));
    document.getElementById('btn-zoom-reset').addEventListener('click', () => reset(true));
    document.getElementById('btn-viewer-close').addEventListener('click', close);
    window.addEventListener('keydown', e => { if(e.key==='Escape') close(); });
  }

  function open(src, name = 'Gambar') {
    const o = document.getElementById('viewer-overlay');
    document.getElementById('viewer-filename').textContent = name;
    const el = img(); el.src = src; el.style.transform = '';
    reset(false); o.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    document.getElementById('viewer-overlay').classList.remove('show');
    document.body.style.overflow = '';
    const el = img(); if(el) el.src = '';
  }

  return { init: bind, open, close };
})();

/* ═══════════════════════════════════════════════════
   VIEWER PAGE DEMOS
═══════════════════════════════════════════════════ */
const ViewerPage = {
  DEMOS: [
    { colors:['#22d3ee','#6366f1'], label:'Biru Langit', emoji:'🌊' },
    { colors:['#f59e0b','#ef4444'], label:'Fajar Emas',  emoji:'🌅' },
    { colors:['#34d399','#0ea5e9'], label:'Hutan Sejuk', emoji:'🌿' },
  ],
  openDemo(i) {
    const d = this.DEMOS[i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${d.colors[0]}"/><stop offset="100%" stop-color="${d.colors[1]}"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><text x="600" y="480" font-size="52" fill="rgba(255,255,255,0.7)" text-anchor="middle" font-family="Georgia">${d.emoji} ${d.label}</text></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type:'image/svg+xml' }));
    ImageViewer.open(url, d.label + '.svg');
  },
  openFile(input) {
    const f = input.files[0]; if(!f) return;
    const el = document.getElementById('viewer-file-name');
    if(el) el.textContent = f.name;
    ImageViewer.open(URL.createObjectURL(f), f.name);
  },
};

/* ═══════════════════════════════════════════════════
   DEVICE PAGE
═══════════════════════════════════════════════════ */
const DevicePage = {
  _audioCtx: null, _analyser: null, _audioRAF: null,

  getSystemInfo() {
    const na = navigator;
    return [
      `memory:   ${na.deviceMemory ? na.deviceMemory+' GB' : '—'}`,
      `cores:    ${na.hardwareConcurrency || '—'}`,
      `language: ${na.language || '—'}`,
      `platform: ${na.platform || '—'}`,
      `ua: ${na.userAgent.slice(0,55)}…`,
    ].join('\n');
  },

  renderSystemInfo() {
    const el = document.getElementById('system-info');
    if (el) el.textContent = this.getSystemInfo();
  },

  refreshSystemInfo() { this.renderSystemInfo(); Utils.toast('Sistem diperbarui', 'success', 2000); },

  initNetworkListener() {
    const update = () => {
      const d = document.getElementById('net-dot'), s = document.getElementById('net-status');
      if(d) { d.className=`dot dot-${navigator.onLine?'granted':'denied'}`; d.style.width='9px'; d.style.height='9px'; }
      if(s) s.textContent = navigator.onLine ? 'Online' : 'Offline';
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  },

  startOrientation() {
    if (!('DeviceOrientationEvent' in window)) { Utils.toast('Tidak didukung', 'error'); return; }
    const go = () => {
      window.addEventListener('deviceorientation', e => {
        const el = document.getElementById('orientation-data');
        if(el) el.textContent = `alpha: ${e.alpha?.toFixed(1)??'—'} °\nbeta:  ${e.beta?.toFixed(1)??'—'} °\ngamma: ${e.gamma?.toFixed(1)??'—'} °`;
        const v = document.getElementById('orientation-visual');
        if(v && e.beta!==null) v.style.transform = `rotateX(${Utils.clamp(e.beta,-40,40)}deg) rotateZ(${Utils.clamp(e.gamma,-40,40)}deg)`;
      });
      Utils.toast('Tracking orientasi aktif', 'success', 2000);
    };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(r => { if(r==='granted') go(); else Utils.toast('Ditolak','error'); });
    } else { go(); }
  },

  startGeo() {
    if (!navigator.geolocation) { Utils.toast('Geolokasi tidak didukung','error'); return; }
    const id = navigator.geolocation.watchPosition(
      p => {
        const el = document.getElementById('geo-data');
        if(el) el.textContent = `latitude:  ${p.coords.latitude.toFixed(6)}\nlongitude: ${p.coords.longitude.toFixed(6)}\naccuracy:  ${p.coords.accuracy?.toFixed(1)} m\naltitude:  ${p.coords.altitude?.toFixed(1)??'—'} m\nspeed:     ${p.coords.speed?.toFixed(2)??'—'} m/s`;
      },
      e => Utils.toast(`Geo error: ${e.message}`,'error'),
      { enableHighAccuracy: true }
    );
    State.set('geoWatchId', id);
    Utils.toast('Memantau posisi...', 'success', 2000);
  },

  stopGeo() {
    const id = State.get('geoWatchId');
    if(id) { navigator.geolocation.clearWatch(id); State.set('geoWatchId', null); }
    Utils.toast('Geolokasi dihentikan','info',2000);
  },

  async startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
      State.set('mediaStream', s);
      const v = document.getElementById('camera-preview'); if(v) v.srcObject = s;
      Utils.toast('Kamera aktif','success',2000);
    } catch(e) { Utils.toast(`Kamera: ${e.message}`,'error'); }
  },

  async startMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
      State.set('mediaStream', s);
      this._audioCtx  = new AudioContext();
      this._analyser  = this._audioCtx.createAnalyser(); this._analyser.fftSize = 256;
      this._audioCtx.createMediaStreamSource(s).connect(this._analyser);
      document.getElementById('audio-bar-wrap').style.display = 'block';
      const data = new Uint8Array(this._analyser.frequencyBinCount);
      const tick = () => {
        this._analyser.getByteFrequencyData(data);
        const avg = data.reduce((a,b)=>a+b,0)/data.length;
        const bar = document.getElementById('audio-bar');
        if(bar) bar.style.width = Utils.clamp(avg*2,0,100)+'%';
        this._audioRAF = requestAnimationFrame(tick);
      };
      tick(); Utils.toast('Mikrofon aktif','success',2000);
    } catch(e) { Utils.toast(`Mic: ${e.message}`,'error'); }
  },

  stopMedia() {
    const s = State.get('mediaStream');
    if(s) { s.getTracks().forEach(t=>t.stop()); State.set('mediaStream',null); }
    if(this._audioRAF) cancelAnimationFrame(this._audioRAF);
    if(this._audioCtx) this._audioCtx.close();
    const v=document.getElementById('camera-preview'); if(v) v.srcObject=null;
    const b=document.getElementById('audio-bar-wrap'); if(b) b.style.display='none';
    Utils.toast('Media dihentikan','info',2000);
  },

  async requestWakeLock() {
    if(!('wakeLock' in navigator)) { Utils.toast('Tidak didukung','error'); return; }
    try {
      const wl = await navigator.wakeLock.request('screen');
      State.set('wakeLock', wl);
      const el = document.getElementById('wakelock-status');
      if(el) el.textContent = 'Aktif ✅';
      wl.addEventListener('release', () => { if(el) el.textContent='Dilepas'; State.set('wakeLock',null); });
      Utils.toast('Wake lock aktif','success');
    } catch(e) { Utils.toast(`Wake lock: ${e.message}`,'error'); }
  },

  releaseWakeLock() {
    const wl = State.get('wakeLock'); if(wl) { wl.release(); State.set('wakeLock',null); }
    const el = document.getElementById('wakelock-status'); if(el) el.textContent='Tidak aktif';
    Utils.toast('Wake lock dilepas','info',2000);
  },

  async sendNotification() {
    if(!('Notification' in window)) { Utils.toast('Tidak didukung','error'); return; }
    const p = await Notification.requestPermission();
    if(p==='granted') {
      new Notification('ProPWA', { body:'Test notifikasi dari CV Amelia Trans Mandiri.', icon:'icon-192.png', tag:'propwa' });
      Utils.toast('Notifikasi dikirim!','success');
    } else { Utils.toast('Izin notifikasi ditolak','error'); }
  },
};

/* ═══════════════════════════════════════════════════
   OFFLINE PAGE
═══════════════════════════════════════════════════ */
const OfflinePage = {
  async init() { await this.refreshCache(); this.updateSWInfo(); },
  async refreshCache() {
    const el = document.getElementById('cache-info'); if(!el) return;
    try {
      if(!('caches' in window)) { el.textContent='Cache API tidak didukung'; return; }
      const keys = await caches.keys(); let out = '';
      for(const k of keys) { const c=await caches.open(k); const r=await c.keys(); out+=`${k}\n  ${r.length} item\n`; }
      el.textContent = out || 'Tidak ada cache ditemukan';
    } catch(e) { el.textContent='Error: '+e.message; }
  },
  updateSWInfo() {
    const el = document.getElementById('sw-info'); if(!el) return;
    if(!('serviceWorker' in navigator)) { el.textContent='Tidak didukung'; return; }
    navigator.serviceWorker.ready.then(reg => {
      el.textContent = `status:   aktif\nscope:    ${reg.scope}\nscript:   ${reg.active?.scriptURL?.split('/').pop()||'sw.js'}`;
    });
  },
  async clearCache() {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
      Utils.toast('Semua cache dihapus','success');
      await this.refreshCache();
    } catch(e) { Utils.toast('Error: '+e.message,'error'); }
  },
};

/* ═══════════════════════════════════════════════════
   MENU TOGGLE
═══════════════════════════════════════════════════ */
function menuToggle(force) {
  const fab  = document.getElementById('fab');
  const menu = document.getElementById('nav-menu');
  const open = typeof force==='boolean' ? force : !menu.classList.contains('open');
  fab.classList.toggle('open', open);
  menu.classList.toggle('open', open);
  fab.setAttribute('aria-expanded', open);
}

/* ═══════════════════════════════════════════════════
   APP MAIN
═══════════════════════════════════════════════════ */
const App = {
  async init() {
    await this.registerSW();
    await PermissionManager.initAll();
    ImageViewer.init();
    this.bindEvents();
    this.updateOfflineBar();
    window.addEventListener('online',  () => { State.set('online',true);  this.updateOfflineBar(); });
    window.addEventListener('offline', () => { State.set('online',false); this.updateOfflineBar(); });
  },

  async registerSW() {
    if(!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope:'./' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if(sw.state==='installed' && navigator.serviceWorker.controller)
            Utils.toast('Update tersedia — muat ulang untuk versi baru','info',6000);
        });
      });
    } catch(e) { console.warn('[SW]', e); }
  },

  bindEvents() {
    // ── FAB
    document.getElementById('fab').addEventListener('click', e => { e.stopPropagation(); menuToggle(); });

    // ── Nav menu items (SPA nav)
    document.getElementById('nav-menu').addEventListener('click', e => {
      const item = e.target.closest('[data-spa]');
      if (item) { menuToggle(false); ViewSwitcher.showSpa(item.dataset.spa); }
    });

    // ── Close menu on outside click
    document.addEventListener('click', e => {
      if (!document.getElementById('fab').contains(e.target) &&
          !document.getElementById('nav-menu').contains(e.target)) {
        menuToggle(false);
      }
    });

    // ── Navbar 3D buttons → open iframe
    document.querySelectorAll('.open-page-btn[data-url]').forEach(btn => {
      btn.addEventListener('click', () => {
        ViewSwitcher.showIframe(btn.dataset.url, btn.dataset.label || 'Halaman');
      });
    });

    // ── Landing quick-access tiles: external URL
    document.addEventListener('click', e => {
      const tile = e.target.closest('.quick-item[data-url]');
      if (tile) ViewSwitcher.showIframe(tile.dataset.url, '');
    });

    // ── Landing SPA tiles
    document.addEventListener('click', e => {
      const tile = e.target.closest('.quick-item[data-spa]');
      if (tile) ViewSwitcher.showSpa(tile.dataset.spa);
    });

    // ── Back to home
    document.getElementById('btn-back-home').addEventListener('click', () => {
      ViewSwitcher.showLanding();
    });

    // ── Browser history
    window.addEventListener('popstate', e => {
      const s = e.state;
      if (!s || s.view === 'landing') ViewSwitcher.showLanding();
      else if (s.view === 'iframe') ViewSwitcher.showIframe(s.url, s.label);
      else if (s.view === 'spa')    ViewSwitcher.showSpa(s.path);
    });

    // ── Install prompt
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); State.set('installPrompt', e);
      document.getElementById('install-banner').classList.add('show');
    });
    document.getElementById('btn-install').addEventListener('click', async () => {
      const p = State.get('installPrompt'); if(!p) return;
      p.prompt();
      const { outcome } = await p.userChoice;
      if(outcome==='accepted') {
        Utils.toast('ProPWA berhasil diinstall! 🎉','success',5000);
        document.getElementById('install-banner').classList.remove('show');
      }
      State.set('installPrompt', null);
    });
    document.getElementById('btn-install-dismiss').addEventListener('click', () => {
      document.getElementById('install-banner').classList.remove('show');
    });
    window.addEventListener('appinstalled', () => {
      Utils.toast('ProPWA sudah terinstall 🎉','success',5000);
      document.getElementById('install-banner').classList.remove('show');
    });
  },

  updateOfflineBar() {
    document.getElementById('offline-bar').classList.toggle('show', !navigator.onLine);
  },
};
