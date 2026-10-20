/* ==========================================================================
   Ruta Erasmus · app.js
   Pestañas, almacenamiento local, viajes, cuenta atrás y mapa interactivo
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'rutaErasmus.v1';

  /* ---------- Utilidades ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms) {
    if (ms <= 0) { return '0 min'; }
    var total = Math.floor(ms / 60000);
    var days = Math.floor(total / 1440);
    var hours = Math.floor((total % 1440) / 60);
    var minutes = total % 60;
    var parts = [];
    if (days) { parts.push(days + ' d'); }
    if (hours) { parts.push(hours + ' h'); }
    if (minutes || !parts.length) { parts.push(minutes + ' min'); }
    return parts.join(' ');
  }

  var toastTimer = null;
  function toast(message) {
    var box = $('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 2800);
  }

  /* ---------- Almacenamiento ---------- */
  function defaults() {
    return { trips: [], places: [], selectedTripId: null };
  }

  function sanitize(data) {
    var base = defaults();
    if (!data || typeof data !== 'object') { return base; }
    Object.keys(data).forEach(function (key) { base[key] = data[key]; });
    if (!Array.isArray(base.trips)) { base.trips = []; }
    if (!Array.isArray(base.places)) { base.places = []; }
    return base;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { return sanitize(JSON.parse(raw)); }
    } catch (error) { /* almacenamiento no disponible o dañado */ }
    return defaults();
  }

  var state = load();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      toast('No se pudo guardar en este navegador.');
    }
  }

  /* ---------- Pestañas ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));

  function showTab(name, focus) {
    if (!$('panel-' + name)) { name = 'dashboard'; }
    tabs.forEach(function (tab) {
      var active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) { tab.focus(); }
    });
    panels.forEach(function (panel) {
      var active = panel.id === 'panel-' + name;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    try { history.replaceState(null, '', '#' + name); } catch (error) { /* ignorar */ }
    document.dispatchEvent(new CustomEvent('tabchange', { detail: { tab: name } }));
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { showTab(tab.dataset.tab, false); });
    tab.addEventListener('keydown', function (event) {
      var next = null;
      if (event.key === 'ArrowRight') { next = tabs[(index + 1) % tabs.length]; }
      if (event.key === 'ArrowLeft') { next = tabs[(index - 1 + tabs.length) % tabs.length]; }
      if (event.key === 'Home') { next = tabs[0]; }
      if (event.key === 'End') { next = tabs[tabs.length - 1]; }
      if (next) {
        event.preventDefault();
        showTab(next.dataset.tab, true);
      }
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-tab-link]'), function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      showTab(link.dataset.tabLink, false);
    });
  });

  /* ---------- Viajes ---------- */
  function sortedTrips() {
    return state.trips.slice().sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
  }

  function tripStatus(trip, now) {
    if (now < new Date(trip.start)) { return 'upcoming'; }
    if (now <= new Date(trip.end)) { return 'live'; }
    return 'past';
  }

  function findTrip(id) {
    for (var i = 0; i < state.trips.length; i++) {
      if (state.trips[i].id === id) { return state.trips[i]; }
    }
    return null;
  }

  function liveTrip(now) {
    var trips = sortedTrips();
    for (var i = 0; i < trips.length; i++) {
      if (tripStatus(trips[i], now) === 'live') { return trips[i]; }
    }
    return null;
  }

  function nextTrip(now) {
    var trips = sortedTrips();
    for (var i = 0; i < trips.length; i++) {
      if (tripStatus(trips[i], now) === 'upcoming') { return trips[i]; }
    }
    return null;
  }

  function ensureSelection() {
    if (state.selectedTripId && findTrip(state.selectedTripId)) { return; }
    var now = new Date();
    var pick = liveTrip(now) || nextTrip(now) || sortedTrips().pop() || null;
    state.selectedTripId = pick ? pick.id : null;
  }

  function renderTripLists() {
    var select = $('tripSelect');
    var list = $('tripList');
    var trips = sortedTrips();
    var now = new Date();

    if (!trips.length) {
      select.innerHTML = '<option value="">Sin viajes</option>';
      select.disabled = true;
      list.innerHTML = '<li class="empty">Aún no hay viajes guardados.</li>';
      return;
    }

    select.disabled = false;
    select.innerHTML = trips.map(function (trip) {
      var selected = trip.id === state.selectedTripId ? ' selected' : '';
      return '<option value="' + esc(trip.id) + '"' + selected + '>' + esc(trip.name) + '</option>';
    }).join('');

    var labels = { upcoming: 'Próximo', live: 'En curso', past: 'Finalizado' };
    list.innerHTML = trips.map(function (trip) {
      var status = tripStatus(trip, now);
      var current = trip.id === state.selectedTripId ? ' is-active-trip' : '';
      return '<li class="item' + current + '">' +
        '<div class="item__main">' +
          '<div class="item__title">' + esc(trip.name) + ' <span class="tag">' + labels[status] + '</span></div>' +
          '<div class="item__meta">' + esc(trip.origin) + ' → ' + esc(trip.destination) + ' · ' + esc(trip.transport) +
          ' · ' + (trip.type === 'erasmus' ? 'Erasmus' : 'Frecuentación') + '</div>' +
          '<div class="item__meta">' + esc(formatDate(trip.start)) + ' – ' + esc(formatDate(trip.end)) + '</div>' +
        '</div>' +
        '<div class="item__actions">' +
          '<button type="button" class="btn btn--ghost btn--small" data-action="select-trip" data-id="' + esc(trip.id) + '">Ver</button>' +
          '<button type="button" class="btn btn--danger btn--small" data-action="delete-trip" data-id="' + esc(trip.id) + '">Eliminar</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function renderActive(now) {
    var trip = liveTrip(now) || findTrip(state.selectedTripId);
    var badge = $('activeBadge');
    var progress = $('activeProgress');

    if (!trip) {
      badge.textContent = 'Inactivo';
      badge.classList.remove('is-live');
      $('activeDest').textContent = '—';
      $('activeTransport').textContent = '—';
      $('activeRemaining').textContent = '—';
      $('activeDates').textContent = '—';
      progress.style.width = '0%';
      return;
    }

    var start = new Date(trip.start);
    var arrival = new Date(trip.arrival);
    var end = new Date(trip.end);
    var status = tripStatus(trip, now);
    var remaining = '—';
    var ratio = 0;

    if (status === 'live') {
      remaining = now < arrival ? 'Llegas en ' + formatDuration(arrival - now) : 'Ya estás en destino';
      ratio = (now - start) / (end - start);
    } else if (status === 'upcoming') {
      remaining = 'Trayecto de ' + formatDuration(arrival - start);
    } else {
      ratio = 1;
    }

    badge.textContent = status === 'live' ? 'Viajando ahora' : (status === 'upcoming' ? 'Próximo' : 'Finalizado');
    badge.classList.toggle('is-live', status === 'live');
    $('activeDest').textContent = trip.destination;
    $('activeTransport').textContent = trip.transport;
    $('activeRemaining').textContent = remaining;
    $('activeDates').textContent = formatDate(trip.start) + ' – ' + formatDate(trip.end);
    progress.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
  }

  function renderCountdown(now) {
    var selected = findTrip(state.selectedTripId);
    var target = null;

    if (selected && tripStatus(selected, now) === 'upcoming') { target = selected; }
    else { target = nextTrip(now); }

    if (!target) {
      $('countdownTitle').textContent = 'Próximo viaje';
      $('countdownDest').textContent = state.trips.length ? 'No tienes viajes futuros. Crea uno nuevo.' : 'Crea un viaje para empezar la cuenta atrás.';
      $('cdDays').textContent = '0';
      $('cdHours').textContent = '00';
      $('cdMinutes').textContent = '00';
      $('cdSeconds').textContent = '00';
      return;
    }

    var diff = Math.max(0, new Date(target.start) - now);
    var totalSeconds = Math.floor(diff / 1000);
    $('countdownTitle').textContent = target.name;
    $('countdownDest').textContent = target.origin + ' → ' + target.destination + ' · ' + formatDate(target.start);
    $('cdDays').textContent = String(Math.floor(totalSeconds / 86400));
    $('cdHours').textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
    $('cdMinutes').textContent = pad(Math.floor((totalSeconds % 3600) / 60));
    $('cdSeconds').textContent = pad(totalSeconds % 60);
  }

  function renderTopbar(now) {
    var live = liveTrip(now);
    var next = nextTrip(now);
    var text = 'Sin viaje activo';
    if (live) {
      text = 'Viajando ahora: ' + live.destination;
    } else if (next) {
      var days = Math.ceil((new Date(next.start) - now) / 86400000);
      text = 'Próximo: ' + next.destination + (days <= 1 ? ' (menos de 1 día)' : ' en ' + days + ' días');
    }
    $('topbarStatus').textContent = text;
  }

  function tick() {
    var now = new Date();
    renderCountdown(now);
    renderActive(now);
    renderTopbar(now);
  }

  function renderTrips() {
    ensureSelection();
    renderTripLists();
    tick();
    document.dispatchEvent(new CustomEvent('tripchange'));
  }

  $('tripForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var start = $('tripStart').value;
    var arrival = $('tripArrival').value;
    var end = $('tripEnd').value;

    if (new Date(arrival) < new Date(start)) {
      toast('La llegada no puede ser anterior a la salida.');
      return;
    }
    if (new Date(end) < new Date(arrival)) {
      toast('El regreso no puede ser anterior a la llegada.');
      return;
    }

    var trip = {
      id: uid(),
      name: $('tripName').value.trim(),
      type: $('tripType').value,
      transport: $('tripTransport').value,
      origin: $('tripOrigin').value.trim(),
      destination: $('tripDestination').value.trim(),
      start: start,
      arrival: arrival,
      end: end
    };

    state.trips.push(trip);
    state.selectedTripId = trip.id;
    save();
    renderTrips();
    event.target.reset();
    toast('Viaje guardado.');
  });

  $('tripSelect').addEventListener('change', function (event) {
    if (!event.target.value) { return; }
    state.selectedTripId = event.target.value;
    save();
    renderTrips();
  });

  $('tripList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) { return; }
    var id = button.dataset.id;

    if (button.dataset.action === 'select-trip') {
      state.selectedTripId = id;
      save();
      renderTrips();
    }

    if (button.dataset.action === 'delete-trip') {
      var trip = findTrip(id);
      if (trip && window.confirm('¿Eliminar el viaje "' + trip.name + '"?')) {
        state.trips = state.trips.filter(function (t) { return t.id !== id; });
        if (state.selectedTripId === id) { state.selectedTripId = null; }
        save();
        renderTrips();
        toast('Viaje eliminado.');
      }
    }
  });

  /* ---------- Exportar e importar ---------- */
  $('exportData').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'ruta-erasmus-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('importData').addEventListener('click', function () { $('importFile').click(); });

  $('importFile').addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!window.confirm('Esto sustituirá los datos actuales. ¿Continuar?')) { return; }
        state = sanitize(data);
        save();
        renderTrips();
        toast('Copia importada correctamente.');
      } catch (error) {
        toast('El archivo no es una copia válida.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  /* ---------- API para otros módulos ---------- */
  window.RutaErasmus = {
    getState: function () { return state; },
    getSelectedTrip: function () { return findTrip(state.selectedTripId); },
    save: save,
    toast: toast
  };

  /* ---------- Arranque ---------- */
  var initialTab = location.hash.replace('#', '');
  showTab(initialTab, false);
  renderTrips();
  setInterval(tick, 1000);
})();
