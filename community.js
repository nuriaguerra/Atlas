/* ==========================================================================
   Ruta Erasmus · js/community.js
   Recomendaciones de la comunidad.
   - Modo local (por defecto): se guardan en este navegador.
   - Modo Supabase: se leen y publican en una tabla compartida.
   Requiere que app.js se cargue antes (expone window.RutaErasmus)

   --------------------------------------------------------------------------
   CÓMO ACTIVAR SUPABASE
   1. Crea un proyecto en https://supabase.com
   2. En el editor SQL ejecuta:

      create table public.recommendations (
        id          bigint generated always as identity primary key,
        place       text not null check (char_length(place)   between 1 and 80),
        city        text not null check (char_length(city)    between 1 and 60),
        country     text not null check (char_length(country) between 1 and 60),
        category    text not null check (category in ('comer','ver','ocio','naturaleza','otros')),
        rating      smallint not null check (rating between 1 and 5),
        author      text not null check (char_length(author)  between 1 and 40),
        comment     text not null check (char_length(comment) between 1 and 500),
        created_at  timestamptz not null default now()
      );

      alter table public.recommendations enable row level security;

      create policy "Lectura pública" on public.recommendations
        for select using (true);

      create policy "Publicación pública" on public.recommendations
        for insert with check (true);

   3. En Project Settings → API copia la "Project URL" y la clave "anon public".
   4. Pega ambas en COMMUNITY_CONFIG (abajo) y cambia provider a 'supabase'.

   Usa solo la clave anon (pública). Nunca pongas la clave service_role aquí.
   Sin políticas de actualización ni borrado, nadie puede modificar ni eliminar
   recomendaciones desde la web: solo leer y publicar.
   ========================================================================== */
(function () {
  'use strict';

  var api = window.RutaErasmus;
  if (!api) {
    console.error('community.js necesita que app.js se cargue antes.');
    return;
  }

  /* ---------- Configuración ---------- */
  var COMMUNITY_CONFIG = {
    provider: 'local',          // 'local' o 'supabase'
    supabase: {
      url: '',                  // https://TU-PROYECTO.supabase.co
      anonKey: '',              // clave pública anon
      table: 'recommendations',
      limit: 200
    },
    minSecondsBetweenPosts: 20  // freno básico contra publicaciones repetidas (modo remoto)
  };

  var CATEGORIES = {
    comer: 'Comer y beber',
    ver: 'Qué ver',
    ocio: 'Ocio y noche',
    naturaleza: 'Naturaleza',
    otros: 'Otros'
  };

  var LIMITS = { place: 80, city: 60, country: 60, author: 40, comment: 500 };
  var AUTHOR_KEY = 'rutaErasmus.author';

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

  function normalize(text) {
    return String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function formatDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) { return ''; }
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function clip(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }

  /* Convierte cualquier registro (local o remoto) a un formato común y seguro. */
  function sanitizeRecord(raw) {
    var rating = parseInt(raw.rating, 10);
    var category = CATEGORIES[raw.category] ? raw.category : 'otros';
    return {
      id: String(raw.id),
      place: clip(raw.place, LIMITS.place),
      city: clip(raw.city, LIMITS.city),
      country: clip(raw.country, LIMITS.country),
      category: category,
      rating: isNaN(rating) ? 3 : Math.max(1, Math.min(5, rating)),
      author: clip(raw.author, LIMITS.author),
      comment: clip(raw.comment, LIMITS.comment),
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString()
    };
  }

  function stars(rating) {
    return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
  }

  /* ---------- Proveedor local ---------- */
  var localProvider = {
    name: 'local',
    canDelete: true,

    list: function () {
      var state = api.getState();
      if (!Array.isArray(state.recommendations)) { state.recommendations = []; }
      return Promise.resolve(state.recommendations.map(sanitizeRecord));
    },

    add: function (record) {
      var state = api.getState();
      if (!Array.isArray(state.recommendations)) { state.recommendations = []; }
      var saved = sanitizeRecord({
        id: uid(),
        place: record.place,
        city: record.city,
        country: record.country,
        category: record.category,
        rating: record.rating,
        author: record.author,
        comment: record.comment,
        createdAt: new Date().toISOString()
      });
      state.recommendations.push(saved);
      api.save();
      return Promise.resolve(saved);
    },

    remove: function (id) {
      var state = api.getState();
      state.recommendations = (state.recommendations || []).filter(function (item) { return item.id !== id; });
      api.save();
      return Promise.resolve();
    }
  };

  /* ---------- Proveedor Supabase (API REST, sin librerías) ---------- */
  var supabaseProvider = {
    name: 'supabase',
    canDelete: false,

    headers: function (extra) {
      var cfg = COMMUNITY_CONFIG.supabase;
      var base = {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json'
      };
      Object.keys(extra || {}).forEach(function (key) { base[key] = extra[key]; });
      return base;
    },

    endpoint: function (query) {
      var cfg = COMMUNITY_CONFIG.supabase;
      return cfg.url.replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(cfg.table) + (query || '');
    },

    list: function () {
      var cfg = COMMUNITY_CONFIG.supabase;
      var query = '?select=id,place,city,country,category,rating,author,comment,created_at' +
        '&order=created_at.desc&limit=' + (cfg.limit || 200);

      return fetch(this.endpoint(query), { headers: this.headers() })
        .then(function (response) {
          if (!response.ok) { throw new Error('HTTP ' + response.status); }
          return response.json();
        })
        .then(function (rows) { return rows.map(sanitizeRecord); });
    },

    add: function (record) {
      var body = JSON.stringify([{
        place: record.place,
        city: record.city,
        country: record.country,
        category: record.category,
        rating: record.rating,
        author: record.author,
        comment: record.comment
      }]);

      return fetch(this.endpoint(''), {
        method: 'POST',
        headers: this.headers({ 'Prefer': 'return=representation' }),
        body: body
      })
        .then(function (response) {
          if (!response.ok) { throw new Error('HTTP ' + response.status); }
          return response.json();
        })
        .then(function (rows) { return sanitizeRecord(rows[0]); });
    },

    remove: function () {
      return Promise.reject(new Error('El borrado remoto no está habilitado.'));
    }
  };

  /* Para añadir otro servicio (por ejemplo Firebase), crea un objeto con
     list(), add(record), remove(id), name y canDelete, y devuélvelo en pickProvider(). */
  function pickProvider() {
    var cfg = COMMUNITY_CONFIG.supabase;
    var ready = COMMUNITY_CONFIG.provider === 'supabase' && cfg.url && cfg.anonKey && /^https:\/\//.test(cfg.url);
    return ready ? supabaseProvider : localProvider;
  }

  var provider = pickProvider();

  /* ---------- Estado del módulo ---------- */
  var records = [];
  var loading = false;
  var loadError = false;
  var lastPostAt = 0;

  /* ---------- Render ---------- */
  function renderNotice() {
    var notice = $('dbNotice');
    if (provider.name === 'supabase') {
      notice.textContent = loadError
        ? 'No se pudo conectar con la base de datos de la comunidad. Inténtalo de nuevo más tarde.'
        : 'Conectado a la base de datos de la comunidad. Las recomendaciones que publiques serán visibles para todos.';
    } else if (COMMUNITY_CONFIG.provider === 'supabase') {
      notice.textContent = 'Supabase está activado pero falta la URL (https) o la clave anon en js/community.js. Se usa el modo local.';
    } else {
      notice.textContent = 'Modo local: las recomendaciones se guardan solo en este navegador. La conexión con Supabase se activa en la configuración de js/community.js.';
    }
  }

  function render() {
    var list = $('recoList');
    var filter = normalize($('recoFilter').value);

    renderNotice();

    if (loading) {
      list.innerHTML = '<li class="empty">Cargando recomendaciones…</li>';
      return;
    }

    var sorted = records.slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
    });

    var visible = sorted.filter(function (item) {
      if (!filter) { return true; }
      var haystack = normalize([item.place, item.city, item.country, CATEGORIES[item.category], item.comment].join(' '));
      return haystack.indexOf(filter) !== -1;
    });

    if (!visible.length) {
      list.innerHTML = '<li class="empty">' + (filter ? 'Ninguna recomendación coincide con el filtro.' : 'Aún no hay recomendaciones.') + '</li>';
      return;
    }

    list.innerHTML = visible.map(function (item) {
      return '<li class="item">' +
        '<div class="item__main">' +
          '<div class="item__title">' + esc(item.place) + ' <span class="tag">' + esc(CATEGORIES[item.category]) + '</span></div>' +
          '<div class="item__meta">' + esc(item.city) + ', ' + esc(item.country) + ' · ' +
            '<span class="rating" role="img" aria-label="' + item.rating + ' de 5">' + stars(item.rating) + '</span></div>' +
          '<p>' + esc(item.comment) + '</p>' +
          '<div class="item__meta">' + esc(item.author) + (item.createdAt ? ' · ' + esc(formatDate(item.createdAt)) : '') + '</div>' +
        '</div>' +
        (provider.canDelete
          ? '<div class="item__actions"><button type="button" class="btn btn--danger btn--small" data-action="delete-reco" data-id="' + esc(item.id) + '">Eliminar</button></div>'
          : '') +
      '</li>';
    }).join('');
  }

  function refresh() {
    loading = true;
    loadError = false;
    render();

    provider.list()
      .then(function (items) {
        records = items;
      })
      .catch(function () {
        records = [];
        loadError = true;
      })
      .then(function () {
        loading = false;
        render();
      });
  }

  /* ---------- Eventos ---------- */
  function rememberAuthor(name) {
    try { localStorage.setItem(AUTHOR_KEY, name); } catch (error) { /* ignorar */ }
  }

  function recallAuthor() {
    try { return localStorage.getItem(AUTHOR_KEY) || ''; } catch (error) { return ''; }
  }

  $('recoForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.target;
    var button = form.querySelector('button[type="submit"]');

    var record = {
      place: clip($('recoPlace').value, LIMITS.place),
      city: clip($('recoCity').value, LIMITS.city),
      country: clip($('recoCountry').value, LIMITS.country),
      category: $('recoCategory').value,
      rating: parseInt($('recoRating').value, 10),
      author: clip($('recoAuthor').value, LIMITS.author),
      comment: clip($('recoComment').value, LIMITS.comment)
    };

    if (!record.place || !record.city || !record.country || !record.author || !record.comment) {
      api.toast('Completa todos los campos.');
      return;
    }

    if (provider.name !== 'local') {
      var elapsed = (Date.now() - lastPostAt) / 1000;
      if (elapsed < COMMUNITY_CONFIG.minSecondsBetweenPosts) {
        api.toast('Espera unos segundos antes de publicar otra recomendación.');
        return;
      }
    }

    button.disabled = true;

    provider.add(record)
      .then(function () {
        lastPostAt = Date.now();
        rememberAuthor(record.author);
        form.reset();
        $('recoAuthor').value = record.author;
        api.toast('Recomendación publicada.');
        refresh();
      })
      .catch(function () {
        api.toast('No se pudo publicar. Revisa tu conexión e inténtalo de nuevo.');
      })
      .then(function () {
        button.disabled = false;
      });
  });

  $('recoFilter').addEventListener('input', render);

  $('recoList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action="delete-reco"]');
    if (!button || !provider.canDelete) { return; }

    var id = button.dataset.id;
    var item = records.filter(function (entry) { return entry.id === id; })[0];
    if (!item) { return; }

    if (window.confirm('¿Eliminar la recomendación de "' + item.place + '"?')) {
      provider.remove(id).then(function () {
        api.toast('Recomendación eliminada.');
        refresh();
      });
    }
  });

  document.addEventListener('tripchange', function () {
    if (provider.name === 'local') { refresh(); }
  });

  /* ---------- Arranque ---------- */
  $('recoAuthor').value = recallAuthor();
  refresh();
})();
