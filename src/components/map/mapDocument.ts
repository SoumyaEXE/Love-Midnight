/**
 * The Leaflet document, as a static string.
 *
 * It is static on purpose. The WebView is mounted once with this exact HTML and
 * never re-sourced; every change - a new roster, a different distance filter, a
 * selection - arrives as a call into `window.__halo` via `injectJavaScript`.
 * Rebuilding the source string on prop change would reload the page, which
 * means a white flash, a re-fetch of every tile, and a lost viewport. Once is
 * the right number of times to load a map.
 *
 * The violet is not a tile style. CARTO's dark basemap is neutral grey, and
 * there is no hue in a grey to rotate, so the tile pane is pushed through
 * `sepia()` first to manufacture one and then rotated onto the app's violet.
 * That runs on the compositor and costs nothing per frame, which a per-tile
 * canvas recolour would not.
 *
 * Nothing here is templated from app state, so there is no injection surface in
 * this string. The data path (`__halo.render`) takes JSON and escapes every
 * value it writes into markup.
 */
export const MAP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body{margin:0;padding:0;height:100%;background:#0B0813;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    -webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
  #map{position:absolute;inset:0;background:#0B0813}

  /* Grey basemap -> the app's violet. sepia() manufactures a hue that
     hue-rotate() can then move; without it the rotation is a no-op. */
  .leaflet-tile-pane{
    filter:grayscale(1) brightness(1.18) sepia(.95) hue-rotate(226deg)
           saturate(2.9) brightness(.9) contrast(1.08);
  }
  .leaflet-container{background:#0B0813;outline:none}

  /* The discs glow rather than sit flat, which is what stops them reading as
     a target diagram. */
  .leaflet-overlay-pane svg{filter:drop-shadow(0 0 10px rgba(176,38,255,.45))}

  /* Edges melt into the app's substrate instead of stopping at a hard rect. */
  #vignette{position:absolute;inset:0;pointer-events:none;z-index:1200;
    background:radial-gradient(120% 92% at 50% 50%,
      rgba(7,6,10,0) 42%, rgba(7,6,10,.26) 68%, rgba(7,6,10,.82) 94%, rgba(7,6,10,.97) 100%)}

  /* --- self ------------------------------------------------------------ */
  .me{position:relative;width:54px;height:54px}
  .me-halo,.me-wave{position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%)}
  .me-halo{width:54px;height:54px;background:radial-gradient(circle,rgba(176,38,255,.55),rgba(176,38,255,0) 70%)}
  .me-wave{width:22px;height:22px;border:1.5px solid rgba(216,180,254,.75);
    animation:wave 2.8s cubic-bezier(.22,.61,.36,1) infinite}
  .me-wave.b{animation-delay:1.4s}
  .me-dot{position:absolute;left:50%;top:50%;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;
    border-radius:50%;background:linear-gradient(180deg,#E9D5FF,#A855F7);
    box-shadow:0 0 0 3px rgba(11,8,19,.85),0 0 16px rgba(176,38,255,.95)}
  @keyframes wave{0%{width:18px;height:18px;opacity:.85}100%{width:54px;height:54px;opacity:0}}
  .still .me-wave{animation:none;opacity:0}

  /* --- people ---------------------------------------------------------- */
  .pin{position:relative;width:78px;text-align:center;transition:opacity .22s ease}
  .av{width:42px;height:42px;margin:0 auto;border-radius:50%;overflow:hidden;background:#1B1428;
    border:1.5px solid rgba(232,206,255,.42);
    box-shadow:0 7px 18px rgba(0,0,0,.6),0 0 0 4px rgba(124,34,206,.20)}
  .av img{width:100%;height:100%;display:block}
  .nm{margin-top:5px;font-size:10.5px;font-weight:400;letter-spacing:.15px;
    color:rgba(255,255,255,.86);text-shadow:0 1px 4px rgba(0,0,0,.95)}
  .dot{position:absolute;left:50%;top:31px;margin-left:12px;width:9px;height:9px;border-radius:50%;
    background:#34D399;border:1.5px solid #0B0813}
  .pin.sel .av{border-color:#F3E8FF;box-shadow:0 0 0 5px rgba(168,85,247,.38),0 10px 24px rgba(0,0,0,.65)}
  .pin.sel .nm{color:#fff}
  .pin.dim{opacity:.3}

  /* --- chrome ---------------------------------------------------------- */
  #pill{position:absolute;left:12px;top:12px;z-index:1300;display:flex;align-items:center;gap:7px;
    padding:7px 13px;border-radius:999px;font-size:11.5px;letter-spacing:.2px;
    color:rgba(255,255,255,.78);background:rgba(17,12,26,.62);
    border:1px solid rgba(255,255,255,.10);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  #pill b{font-weight:500;color:#fff}
  #pill i{width:6px;height:6px;border-radius:50%;background:#A855F7;box-shadow:0 0 8px #A855F7;display:block}

  #ctl{position:absolute;right:12px;bottom:12px;z-index:1300;display:flex;flex-direction:column;gap:7px}
  #ctl button{width:36px;height:36px;padding:0;border-radius:12px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    color:rgba(255,255,255,.86);font-size:17px;font-weight:300;line-height:1;
    background:rgba(17,12,26,.68);border:1px solid rgba(255,255,255,.11);
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  #ctl button:active{background:rgba(168,85,247,.30);border-color:rgba(216,180,254,.45)}
  #ctl svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6;
    stroke-linecap:round;stroke-linejoin:round}

  .leaflet-marker-icon,.leaflet-overlay-pane{will-change:transform}
</style>
</head>
<body>
<div id="map"></div>
<div id="vignette"></div>
<div id="pill"><i></i><span id="pill-text"></span></div>
<div id="ctl">
  <button id="zin" aria-label="Zoom in">+</button>
  <button id="zout" aria-label="Zoom out">&#8722;</button>
  <button id="rec" aria-label="Recentre">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8"/><path d="M12 1.6v2.6M12 19.8v2.6M22.4 12h-2.6M4.2 12H1.6"/></svg>
  </button>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  var map = null;
  var state = null;
  var shapes = L.layerGroup();
  var pins = L.layerGroup();
  var selfMarker = null;
  var lastFitKey = null;

  function post(o) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function boot() {
    // Leaflet is a network dependency. If it did not arrive, say so instead of
    // leaving the host waiting on a 'ready' that will never come.
    if (typeof L === 'undefined') { post({ type: 'error', reason: 'leaflet' }); return; }

    map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      minZoom: 9,
      maxZoom: 17,
      // A one-finger drag should pan the map, not scroll the screen behind it.
      // The RN side stops the parent ScrollView while a touch is on the map.
      tap: false
    }).setView([40.7686, -73.9782], 13);

    // Injected by the host before the document loads, so the tile source and
    // its token live in app config rather than in this string. The fallback is
    // the keyless public CDN, which is what the default config resolves to.
    var tiles = window.__HALO_TILES || {};
    L.tileLayer(
      tiles.url || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 19,
        detectRetina: true,
        updateWhenIdle: false,
        keepBuffer: 3
      }
    ).addTo(map);

    shapes.addTo(map);
    pins.addTo(map);

    document.getElementById('zin').onclick = function () { map.zoomIn(1); };
    document.getElementById('zout').onclick = function () { map.zoomOut(1); };
    document.getElementById('rec').onclick = function () { fit(true); };

    post({ type: 'ready' });
  }

  function selfIcon(live) {
    return L.divIcon({
      className: '',
      html: '<div class="me' + (live ? '' : ' still') + '">' +
            '<span class="me-halo"></span>' +
            '<span class="me-wave"></span><span class="me-wave b"></span>' +
            '<span class="me-dot"></span></div>',
      iconSize: [54, 54],
      iconAnchor: [27, 27]
    });
  }

  function pinIcon(s) {
    var cls = 'pin' + (s.selected ? ' sel' : '') + (s.dim ? ' dim' : '');
    var img = s.avatar ? '<img src="' + esc(s.avatar) + '" alt=""/>' : '';
    return L.divIcon({
      className: '',
      html: '<div class="' + cls + '">' +
            '<div class="av">' + img + '</div>' +
            (s.online ? '<span class="dot"></span>' : '') +
            '<div class="nm">' + esc(s.name) + '</div>' +
            '</div>',
      iconSize: [78, 66],
      iconAnchor: [39, 21]
    });
  }

  function draw() {
    if (!map || !state) return;

    shapes.clearLayers();
    pins.clearLayers();

    if (selfMarker) map.removeLayer(selfMarker);
    selfMarker = L.marker([state.self.lat, state.self.lng], {
      icon: selfIcon(!!state.live),
      interactive: false,
      keyboard: false,
      zIndexOffset: 400
    }).addTo(map);

    for (var i = 0; i < state.subjects.length; i++) {
      (function (s) {
        var strength = s.dim ? 0.34 : 1;
        var lit = s.selected ? 1.6 : 1;

        // Flat stacked discs, largest first. Giving each disc its own
        // centre-to-rim gradient turned the map into a target diagram.
        shapes.addLayer(L.circle([s.lat, s.lng], {
          radius: s.area,
          stroke: true,
          color: 'rgba(216,180,254,' + (0.34 * strength * lit).toFixed(3) + ')',
          weight: s.selected ? 1.6 : 1,
          fillColor: '#A855F7',
          fillOpacity: 0.15 * strength * lit,
          interactive: false
        }));

        var m = L.marker([s.lat, s.lng], {
          icon: pinIcon(s),
          riseOnHover: true,
          zIndexOffset: s.selected ? 500 : 0,
          keyboard: false
        });
        m.on('click', function () { post({ type: 'select', id: s.id }); });
        pins.addLayer(m);
      })(state.subjects[i]);
    }

    var visible = state.subjects.filter(function (s) { return !s.dim; }).length;
    document.getElementById('pill-text').innerHTML =
      '<b>' + esc(state.label) + '</b> &middot; within ' + esc(state.reach) +
      ' &middot; ' + visible + (visible === 1 ? ' person' : ' people');

    if (state.fitKey !== lastFitKey) {
      lastFitKey = state.fitKey;
      fit(false);
    }
  }

  function fit(animate) {
    if (!map || !state) return;
    var live = state.subjects.filter(function (s) { return !s.dim; });
    if (!live.length) {
      map.setView([state.self.lat, state.self.lng], 14, { animate: !!animate });
      return;
    }
    var b = L.latLngBounds([[state.self.lat, state.self.lng]]);
    for (var i = 0; i < live.length; i++) {
      // toBounds() projects from the LatLng itself. Circle.getBounds() reads
      // this._map, so an unattached circle throws - which is what a detached
      // measuring circle would be.
      b.extend(L.latLng(live[i].lat, live[i].lng).toBounds(live[i].area * 2));
    }
    map.fitBounds(b, { padding: [34, 34], animate: !!animate, maxZoom: 15.5 });
  }

  window.__halo = {
    render: function (next) {
      state = next;
      draw();
    },
    recentre: function () { fit(true); }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
</script>
</body>
</html>`;
