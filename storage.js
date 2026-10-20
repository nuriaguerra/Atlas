/* ==========================================================================
   Ruta Erasmus · js/storage.js
   Gestión de localStorage, validación de datos y copias de seguridad JSON.
   Debe cargarse ANTES que app.js. Expone window.RutaStorage.

   Forma del estado:
   {
     version, selectedTripId,
     trips[], places[],
     plans{ [tripId]: { items[], budget } },
     expenses{ [tripId]: { members[], items[] } },
     recommendations[]
   }
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'rutaErasmus.v1';
  var VERSION = 1;
  var APP_ID = 'ruta-erasmus';
  var MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  /* ---------- Disponibilidad de localStorage ---------- */
  var memoryRaw = null;
  var persistent = (function () {
    try {
      var probe = '__rutaErasmus.probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  })();

  function readRaw() {
    if (!persistent) { return memoryRaw; }
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }

  function writeRaw(raw) {
    if (!persistent) {
      memoryRaw = raw;
      return true;
    }
    try {
      window.localStorage.setItem(KEY, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ---------- Validadores ---------- */
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function isText(value) { return typeof value === 'string' && value.trim() !== ''; }
  function isDate(value) { return typeof value === 'string' && !isNaN(new Date(value).getTime()); }
  function isNumber(value) { return typeof value === 'number' && isFinite(value); }

  function clip(value, max) { return String(value == null ? '' : value).slice(0, max); }

  function uniqueById(list) {
    var seen = {};
    return list.filter(function (item) {
      if (seen[item.id]) { return false; }
      seen[item.id] = true;
      return true;
    });
  }

  function cleanTrip(raw) {
    if (!isObject(raw) || !isText(raw.id) || !isText(raw.name) || !isText(raw.origin) || !isText(raw.destination)) { return null; }
    if (!isDate(raw.start) || !isDate(raw.arrival) || !isDate(raw.end)) { return null; }
    return {
      id: clip(raw.id, 64),
      name: clip(raw.name, 120),
      type: raw.type === 'frecuentacion' ? 'frecuentacion' : 'erasmus',
      transport: isText(raw.transport) ? clip(raw.transport, 40) : 'Avión',
      origin: clip(raw.origin, 120),
      destination: clip(raw.destination, 120),
      start: raw.start,
      arrival: raw.arrival,
      end: raw.end
    };
  }

  function cleanPlace(raw) {
    if (!isObject(raw) || !isText(raw.id) || !isText(raw.name) || !isText(raw.country)) { return null; }
    if (!isNumber(raw.lat) || !isNumber(raw.lng) || Math.abs(raw.lat) > 90 || Math.abs(raw.lng) > 180) { return null; }
    return {
      id: clip(raw.id, 64),
      name: clip(raw.name, 120),
      country: clip(raw.country, 120),
      continent: isText(raw.continent) ? clip(raw.continent, 40) : 'Europa',
      lat: raw.lat,
      lng: raw.lng,
      status: raw.status === 'wishlist' ? 'wishlist' : 'visited'
    };
  }

  function cleanPlanItem(raw) {
    if (!isObject(raw) || !isText(raw.id) || !isText(raw.title)) { return null; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') || !/^\d{2}:\d{2}$/.test(raw.time || '')) { return null; }
    return {
      id: clip(raw.id, 64),
      date: raw.date,
      time: raw.time,
      category: isText(raw.category) ? clip(raw.category, 20) : 'otros',
      title: clip(raw.title, 160),
      cost: isNumber(raw.cost) && raw.cost >= 0 ? raw.cost : 0,
      notes: clip(raw.notes, 1000),
      done: raw.done === true
    };
  }

  function cleanPlans(raw) {
    var result = {};
    if (!isObject(raw)) { return result; }
    Object.keys(raw).forEach(function (tripId) {
      var plan = raw[tripId];
      if (!isObject(plan)) { return; }
      var items = Array.isArray(plan.items) ? plan.items.map(cleanPlanItem).filter(Boolean) : [];
      result[tripId] = {
        items: uniqueById(items),
        budget: isNumber(plan.budget) && plan.budget >= 0 ? plan.budget : 0
      };
    });
    return result;
  }

  function cleanExpenses(raw) {
    var result = {};
    if (!isObject(raw)) { return result; }

    Object.keys(raw).forEach(function (tripId) {
      var group = raw[tripId];
      if (!isObject(group)) { return; }

      var members = Array.isArray(group.members) ? group.members.filter(function (m) {
        return isObject(m) && isText(m.id) && isText(m.name);
      }).map(function (m) { return { id: clip(m.id, 64), name: clip(m.name, 30) }; }) : [];
      members = uniqueById(members);

      var memberIds = {};
      members.forEach(function (m) { memberIds[m.id] = true; });

      var items = Array.isArray(group.items) ? group.items.filter(function (item) {
        return isObject(item) && isText(item.id) && isText(item.title) &&
          typeof item.amount === 'number' && isFinite(item.amount) && item.amount > 0 && Math.floor(item.amount) === item.amount &&
          isText(item.payerId) && memberIds[item.payerId] &&
          Array.isArray(item.splitIds) && item.splitIds.length > 0 &&
          item.splitIds.every(function (id) { return memberIds[id]; });
      }).map(function (item) {
        return {
          id: clip(item.id, 64),
          title: clip(item.title, 80),
          amount: item.amount,
          payerId: item.payerId,
          splitIds: item.splitIds.slice(),
          createdAt: isDate(item.createdAt) ? item.createdAt : new Date().toISOString(),
          settlement: item.settlement === true
        };
      }) : [];

      result[tripId] = { members: members, items: uniqueById(items) };
    });

    return result;
  }

  var RECO_CATEGORIES = ['comer', 'ver', 'ocio', 'naturaleza', 'otros'];

  function cleanRecommendation(raw) {
    if (!isObject(raw) || !isText(raw.id) || !isText(raw.place) || !isText(raw.city) ||
        !isText(raw.country) || !isText(raw.author) || !isText(raw.comment)) { return null; }
    var rating = parseInt(raw.rating, 10);
    return {
      id: clip(raw.id, 64),
      place: clip(raw.place, 80),
      city: clip(raw.city, 60),
      country: clip(raw.country, 60),
      category: RECO_CATEGORIES.indexOf(raw.category) !== -1 ? raw.category : 'otros',
      rating: isNaN(rating) ? 3 : Math.max(1, Math.min(5, rating)),
      author: clip(raw.author, 40),
      comment: clip(raw.comment, 500),
      createdAt: isDate(raw.createdAt) ? raw.createdAt : new Date().toISOString()
    };
  }

  /* ---------- Estado ---------- */
  function defaults() {
    return {
      version: VERSION,
      selectedTripId: null,
      trips: [],
      places: [],
      plans: {},
      expenses: {},
      recommendations: []
    };
  }

  /* Devuelve siempre un estado válido: descarta lo que no encaja y elimina claves desconocidas. */
  function sanitize(data) {
    var state = defaults();
    if (!isObject(data)) { return state; }

    state.trips = uniqueById((Array.isArray(data.trips) ? data.trips : []).map(cleanTrip).filter(Boolean));
    state.places = uniqueById((Array.isArray(data.places) ? data.places : []).map(cleanPlace).filter(Boolean));
    state.plans = cleanPlans(data.plans);
    state.expenses = cleanExpenses(data.expenses);
    state.recommendations = uniqueById(
      (Array.isArray(data.recommendations) ? data.recommendations : []).map(cleanRecommendation).filter(Boolean)
    );
    state.selectedTripId = isText(data.selectedTripId) ? data.selectedTripId : null;
    return state;
  }

  function load() {
    var raw = readRaw();
    if (!raw) { return defaults(); }
    try {
      return sanitize(JSON.parse(raw));
    } catch (error) {
      /* Datos dañados: se guarda una copia para poder recuperarlos a mano y se empieza de cero. */
      try { window.localStorage.setItem(KEY + '.corrupted', raw); } catch (ignore) { /* sin espacio */ }
      return defaults();
    }
  }

  function save(state) {
    try {
      state.version = VERSION;
      return writeRaw(JSON.stringify(state));
    } catch (error) {
      return false;
    }
  }

  function clear() {
    memoryRaw = null;
    if (!persistent) { return; }
    try { window.localStorage.removeItem(KEY); } catch (error) { /* ignorar */ }
  }

  /* ---------- Resumen ---------- */
  function summarize(state) {
    var activities = 0;
    var expenses = 0;
    Object.keys(state.plans || {}).forEach(function (id) { activities += state.plans[id].items.length; });
    Object.keys(state.expenses || {}).forEach(function (id) { expenses += state.expenses[id].items.length; });

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    return [
      plural(state.trips.length, 'viaje', 'viajes'),
      plural(state.places.length, 'lugar', 'lugares'),
      plural(activities, 'actividad', 'actividades'),
      plural(expenses, 'gasto', 'gastos'),
      plural(state.recommendations.length, 'recomendación', 'recomendaciones')
    ].join(', ');
  }

  /* ---------- Exportar ---------- */
  function dateStamp() {
    var now = new Date();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function exportData(state) {
    var payload = {
      app: APP_ID,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      data: sanitize(state)
    };
    return {
      filename: 'ruta-erasmus-' + dateStamp() + '.json',
      json: JSON.stringify(payload, null, 2)
    };
  }

  function download(state) {
    var file = exportData(state);
    var blob = new Blob([file.json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return file.filename;
  }

  /* ---------- Importar ---------- */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No se ha elegido ningún archivo.')); return; }
      if (file.size > MAX_IMPORT_BYTES) { reject(new Error('El archivo es demasiado grande (máximo 5 MB).')); return; }
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      reader.readAsText(file);
    });
  }

  /* Valida el texto de una copia y devuelve { ok, data, summary } o { ok: false, error }. */
  function parseImport(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, error: 'El archivo no es un JSON válido.' };
    }

    if (!isObject(parsed)) { return { ok: false, error: 'El archivo no contiene una copia de Ruta Erasmus.' }; }

    var inner = null;
    if (parsed.app === APP_ID && isObject(parsed.data)) {
      if (typeof parsed.version === 'number' && parsed.version > VERSION) {
        return { ok: false, error: 'La copia es de una versión más reciente de la aplicación.' };
      }
      inner = parsed.data;
    } else if (Array.isArray(parsed.trips) || Array.isArray(parsed.places)) {
      inner = parsed; /* copias antiguas sin envoltorio */
    }

    if (!inner) { return { ok: false, error: 'El archivo no contiene una copia de Ruta Erasmus.' }; }

    var data = sanitize(inner);
    return { ok: true, data: data, summary: summarize(data) };
  }

  /* ---------- Combinar ---------- */
  function mergeLists(current, incoming) {
    var seen = {};
    current.forEach(function (item) { seen[item.id] = true; });
    return current.concat(incoming.filter(function (item) { return !seen[item.id]; }));
  }

  /* Añade lo que falta de la copia sin borrar ni modificar nada de lo actual. */
  function merge(current, incoming) {
    var result = sanitize(current);

    result.trips = mergeLists(result.trips, incoming.trips);
    result.places = mergeLists(result.places, incoming.places);
    result.recommendations = mergeLists(result.recommendations, incoming.recommendations);

    Object.keys(incoming.plans).forEach(function (tripId) {
      var theirs = incoming.plans[tripId];
      var mine = result.plans[tripId];
      if (!mine) { result.plans[tripId] = theirs; return; }
      mine.items = mergeLists(mine.items, theirs.items);
      if (!mine.budget) { mine.budget = theirs.budget; }
    });

    Object.keys(incoming.expenses).forEach(function (tripId) {
      var theirs = incoming.expenses[tripId];
      var mine = result.expenses[tripId];
      if (!mine) { result.expenses[tripId] = theirs; return; }
      mine.members = mergeLists(mine.members, theirs.members);
      mine.items = mergeLists(mine.items, theirs.items);
    });

    if (!result.selectedTripId) { result.selectedTripId = incoming.selectedTripId; }
    return sanitize(result);
  }

  /* ---------- Cambios desde otra pestaña ---------- */
  function onExternalChange(callback) {
    window.addEventListener('storage', function (event) {
      if (event.key === KEY && event.newValue) { callback(load()); }
    });
  }

  window.RutaStorage = {
    KEY: KEY,
    VERSION: VERSION,
    isPersistent: function () { return persistent; },
    defaults: defaults,
    sanitize: sanitize,
    load: load,
    save: save,
    clear: clear,
    summarize: summarize,
    exportData: exportData,
    download: download,
    readFile: readFile,
    parseImport: parseImport,
    merge: merge,
    onExternalChange: onExternalChange
  };
})();
