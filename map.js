/* ==========================================================================
   Ruta Erasmus · js/map.js
   Mapa interactivo (Leaflet), lugares visitados y deseados,
   y estadísticas de países y continentes.
   Requiere Leaflet y que app.js se cargue antes (expone window.RutaErasmus)
   ========================================================================== */
(function () {
  'use strict';

  var api = window.RutaErasmus;
  if (!api) {
    console.error('map.js necesita que app.js se cargue antes.');
    return;
  }

  var TOTAL_COUNTRIES = 195;
  var TOTAL_CONTINENTS = 7;
  var DEFAULT_CENTER = [30, 10];

  /* ---------- Países (193 miembros de la ONU + Vaticano + Palestina) ---------- */
  var DATA = {
    'Europa': 'Albania|Alemania|Andorra|Austria|Bélgica|Bielorrusia|Bosnia y Herzegovina|Bulgaria|Chipre|Croacia|Dinamarca|Eslovaquia|Eslovenia|España|Estonia|Finlandia|Francia|Grecia|Hungría|Irlanda|Islandia|Italia|Letonia|Liechtenstein|Lituania|Luxemburgo|Macedonia del Norte|Malta|Moldavia|Mónaco|Montenegro|Noruega|Países Bajos|Polonia|Portugal|Reino Unido|República Checa|Rumanía|Rusia|San Marino|Serbia|Suecia|Suiza|Ucrania|Vaticano',
    'Asia': 'Afganistán|Arabia Saudita|Armenia|Azerbaiyán|Bangladés|Baréin|Bután|Birmania|Brunéi|Camboya|Catar|China|Corea del Norte|Corea del Sur|Emiratos Árabes Unidos|Filipinas|Georgia|India|Indonesia|Irak|Irán|Israel|Japón|Jordania|Kazajistán|Kirguistán|Kuwait|Laos|Líbano|Malasia|Maldivas|Mongolia|Nepal|Omán|Pakistán|Palestina|Singapur|Siria|Sri Lanka|Tailandia|Tayikistán|Timor Oriental|Turkmenistán|Turquía|Uzbekistán|Vietnam|Yemen',
    'África': 'Angola|Argelia|Benín|Botsuana|Burkina Faso|Burundi|Cabo Verde|Camerún|Chad|Comoras|Congo|Costa de Marfil|Egipto|Eritrea|Esuatini|Etiopía|Gabón|Gambia|Ghana|Guinea|Guinea-Bisáu|Guinea Ecuatorial|Kenia|Lesoto|Liberia|Libia|Madagascar|Malaui|Malí|Marruecos|Mauricio|Mauritania|Mozambique|Namibia|Níger|Nigeria|República Centroafricana|República Democrática del Congo|Ruanda|Santo Tomé y Príncipe|Senegal|Seychelles|Sierra Leona|Somalia|Sudáfrica|Sudán|Sudán del Sur|Tanzania|Togo|Túnez|Uganda|Yibuti|Zambia|Zimbabue',
    'América del Norte': 'Antigua y Barbuda|Bahamas|Barbados|Belice|Canadá|Costa Rica|Cuba|Dominica|El Salvador|Estados Unidos|Granada|Guatemala|Haití|Honduras|Jamaica|México|Nicaragua|Panamá|República Dominicana|San Cristóbal y Nieves|San Vicente y las Granadinas|Santa Lucía|Trinidad y Tobago',
    'América del Sur': 'Argentina|Bolivia|Brasil|Chile|Colombia|Ecuador|Guyana|Paraguay|Perú|Surinam|Uruguay|Venezuela',
    'Oceanía': 'Australia|Fiyi|Islas Marshall|Islas Salomón|Kiribati|Micronesia|Nauru|Nueva Zelanda|Palaos|Papúa Nueva Guinea|Samoa|Tonga|Tuvalu|Vanuatu'
  };

  /* Nombres alternativos (sin tildes ni mayúsculas) → nombre oficial de la lista */
  var ALIASES = {
    'spain': 'España', 'germany': 'Alemania', 'france': 'Francia', 'italy': 'Italia',
    'united kingdom': 'Reino Unido', 'uk': 'Reino Unido', 'great britain': 'Reino Unido', 'gran bretana': 'Reino Unido',
    'inglaterra': 'Reino Unido', 'england': 'Reino Unido', 'escocia': 'Reino Unido', 'scotland': 'Reino Unido',
    'gales': 'Reino Unido', 'wales': 'Reino Unido', 'irlanda del norte': 'Reino Unido', 'northern ireland': 'Reino Unido',
    'united states': 'Estados Unidos', 'united states of america': 'Estados Unidos', 'usa': 'Estados Unidos',
    'us': 'Estados Unidos', 'eeuu': 'Estados Unidos', 'ee.uu.': 'Estados Unidos', 'ee. uu.': 'Estados Unidos',
    'estados unidos de america': 'Estados Unidos',
    'czechia': 'República Checa', 'chequia': 'República Checa', 'czech republic': 'República Checa',
    'netherlands': 'Países Bajos', 'the netherlands': 'Países Bajos', 'holanda': 'Países Bajos',
    'switzerland': 'Suiza', 'poland': 'Polonia', 'belgium': 'Bélgica', 'greece': 'Grecia', 'sweden': 'Suecia',
    'denmark': 'Dinamarca', 'hungary': 'Hungría', 'romania': 'Rumanía', 'russia': 'Rusia', 'ukraine': 'Ucrania',
    'norway': 'Noruega', 'finland': 'Finlandia', 'iceland': 'Islandia', 'ireland': 'Irlanda', 'croatia': 'Croacia',
    'slovakia': 'Eslovaquia', 'slovenia': 'Eslovenia', 'lithuania': 'Lituania', 'latvia': 'Letonia', 'estonia': 'Estonia',
    'belarus': 'Bielorrusia', 'moldova': 'Moldavia', 'cyprus': 'Chipre', 'luxembourg': 'Luxemburgo',
    'north macedonia': 'Macedonia del Norte', 'macedonia': 'Macedonia del Norte', 'bosnia': 'Bosnia y Herzegovina',
    'bosnia and herzegovina': 'Bosnia y Herzegovina', 'vatican': 'Vaticano', 'vatican city': 'Vaticano',
    'ciudad del vaticano': 'Vaticano',
    'turkey': 'Turquía', 'turkiye': 'Turquía', 'japan': 'Japón', 'south korea': 'Corea del Sur', 'corea': 'Corea del Sur',
    'north korea': 'Corea del Norte', 'thailand': 'Tailandia', 'philippines': 'Filipinas', 'malaysia': 'Malasia',
    'myanmar': 'Birmania', 'myanmar (birmania)': 'Birmania', 'burma': 'Birmania', 'cambodia': 'Camboya',
    'viet nam': 'Vietnam', 'singapore': 'Singapur', 'pakistan': 'Pakistán', 'iran': 'Irán', 'iraq': 'Irak',
    'jordan': 'Jordania', 'lebanon': 'Líbano', 'syria': 'Siria', 'saudi arabia': 'Arabia Saudita', 'qatar': 'Catar',
    'united arab emirates': 'Emiratos Árabes Unidos', 'uae': 'Emiratos Árabes Unidos', 'emiratos': 'Emiratos Árabes Unidos',
    'kazakhstan': 'Kazajistán', 'uzbekistan': 'Uzbekistán', 'azerbaijan': 'Azerbaiyán', 'east timor': 'Timor Oriental',
    'timor-leste': 'Timor Oriental', 'bangladesh': 'Bangladés', 'palestine': 'Palestina',
    'morocco': 'Marruecos', 'egypt': 'Egipto', 'tunisia': 'Túnez', 'algeria': 'Argelia', 'south africa': 'Sudáfrica',
    'kenya': 'Kenia', 'ethiopia': 'Etiopía', 'ivory coast': 'Costa de Marfil', "cote d'ivoire": 'Costa de Marfil',
    'cape verde': 'Cabo Verde', 'swaziland': 'Esuatini', 'eswatini': 'Esuatini', 'mauritius': 'Mauricio',
    'democratic republic of the congo': 'República Democrática del Congo', 'dr congo': 'República Democrática del Congo',
    'rd congo': 'República Democrática del Congo',
    'canada': 'Canadá', 'mexico': 'México', 'cuba': 'Cuba', 'dominican republic': 'República Dominicana',
    'trinidad and tobago': 'Trinidad y Tobago', 'saint lucia': 'Santa Lucía',
    'brazil': 'Brasil', 'peru': 'Perú', 'new zealand': 'Nueva Zelanda'
  };

  var COUNTRIES = [];
  var INDEX = {};

  function normalize(text) {
    return String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  Object.keys(DATA).forEach(function (continent) {
    DATA[continent].split('|').forEach(function (name) {
      var country = { name: name, continent: continent };
      COUNTRIES.push(country);
      INDEX[normalize(name)] = country;
    });
  });
  COUNTRIES.sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });

  function matchCountry(text) {
    var key = normalize(text);
    if (!key) { return null; }
    if (INDEX[key]) { return INDEX[key]; }
    if (ALIASES[key]) { return INDEX[normalize(ALIASES[key])] || null; }
    return null;
  }

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

  function percent(part, total) {
    var value = total ? (part / total) * 100 : 0;
    return (Math.round(value * 10) / 10).toString().replace('.', ',') + ' %';
  }

  function places() {
    var state = api.getState();
    if (!Array.isArray(state.places)) { state.places = []; }
    return state.places;
  }

  function continentOf(place) {
    var match = matchCountry(place.country);
    return match ? match.continent : place.continent;
  }

  /* ---------- Estado del módulo ---------- */
  var map = null;
  var markerLayer = null;
  var mapView = 'visited';
  var lastSignature = '';

  /* ---------- Mapa ---------- */
  function initMap() {
    var container = $('worldMap');

    if (!window.L) {
      container.innerHTML = '<p class="notice">No se pudo cargar el mapa. Comprueba tu conexión a internet y recarga la página.</p>';
      return;
    }

    map = L.map(container, { worldCopyJump: true, minZoom: 2 }).setView(DEFAULT_CENTER, 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    map.on('click', function (event) {
      var lat = event.latlng.lat;
      var lng = ((((event.latlng.lng + 180) % 360) + 360) % 360) - 180;
      $('placeLat').value = lat.toFixed(5);
      $('placeLng').value = lng.toFixed(5);
      api.toast('Coordenadas copiadas al formulario.');
      reverseGeocode(lat, lng);
    });
  }

  function reverseGeocode(lat, lng) {
    if (!window.fetch) { return; }
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) { controller.abort(); } }, 6000);
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=es&lat=' + lat + '&lon=' + lng;

    fetch(url, controller ? { signal: controller.signal } : {})
      .then(function (response) { return response.json(); })
      .then(function (data) {
        clearTimeout(timer);
        if (!data || !data.address) { return; }
        var address = data.address;
        var city = address.city || address.town || address.village || address.municipality || address.county || '';
        if (city && !$('placeName').value) { $('placeName').value = city; }
        if (address.country && !$('placeCountry').value) {
          $('placeCountry').value = address.country;
          syncContinent();
        }
      })
      .catch(function () { clearTimeout(timer); });
  }

  function pinIcon(status) {
    return L.divIcon({
      className: '',
      html: '<div class="pin' + (status === 'wishlist' ? ' pin--wishlist' : '') + '"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -10]
    });
  }

  function renderMarkers(fit) {
    if (!map) { return; }
    markerLayer.clearLayers();
    var bounds = [];

    places().forEach(function (place) {
      if (place.status !== mapView) { return; }
      L.marker([place.lat, place.lng], { icon: pinIcon(place.status), title: place.name })
        .bindPopup('<strong>' + esc(place.name) + '</strong><br>' + esc(place.country) + ' · ' + esc(continentOf(place)))
        .addTo(markerLayer);
      bounds.push([place.lat, place.lng]);
    });

    if (!fit) { return; }
    if (bounds.length === 1) {
      map.setView(bounds[0], 5);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
    } else {
      map.setView(DEFAULT_CENTER, 2);
    }
  }

  /* ---------- Estadísticas ---------- */
  function renderStats() {
    var countries = {};
    var continents = {};
    var cities = 0;

    places().forEach(function (place) {
      if (place.status !== 'visited') { return; }
      var match = matchCountry(place.country);
      countries[match ? normalize(match.name) : 'x:' + normalize(place.country)] = true;
      continents[normalize(continentOf(place))] = true;
      cities += 1;
    });

    var countryCount = Math.min(Object.keys(countries).length, TOTAL_COUNTRIES);
    var continentCount = Math.min(Object.keys(continents).length, TOTAL_CONTINENTS);

    $('statCountries').textContent = percent(countryCount, TOTAL_COUNTRIES);
    $('statCountriesDetail').textContent = countryCount + ' de ' + TOTAL_COUNTRIES + ' países';
    $('statCountriesBar').style.width = (countryCount / TOTAL_COUNTRIES) * 100 + '%';
    $('statContinents').textContent = percent(continentCount, TOTAL_CONTINENTS);
    $('statContinentsDetail').textContent = continentCount + ' de ' + TOTAL_CONTINENTS + ' continentes';
    $('statContinentsBar').style.width = (continentCount / TOTAL_CONTINENTS) * 100 + '%';
    $('statCities').textContent = String(cities);
  }

  /* ---------- Lista y selector de vista ---------- */
  function renderList() {
    var list = $('placeList');
    var all = places();

    if (!all.length) {
      list.innerHTML = '<li class="empty">Todavía no has añadido lugares.</li>';
      return;
    }

    list.innerHTML = all.map(function (place) {
      var visited = place.status === 'visited';
      return '<li class="item">' +
        '<div class="item__main">' +
          '<div class="item__title">' + esc(place.name) + ' <span class="tag">' + (visited ? 'Visitado' : 'Por visitar') + '</span></div>' +
          '<div class="item__meta">' + esc(place.country) + ' · ' + esc(continentOf(place)) + '</div>' +
        '</div>' +
        '<div class="item__actions">' +
          '<button type="button" class="btn btn--ghost btn--small" data-action="focus-place" data-id="' + esc(place.id) + '">Ver en mapa</button>' +
          '<button type="button" class="btn btn--ghost btn--small" data-action="toggle-place" data-id="' + esc(place.id) + '">' + (visited ? 'Pasar a deseos' : 'Marcar visitado') + '</button>' +
          '<button type="button" class="btn btn--danger btn--small" data-action="delete-place" data-id="' + esc(place.id) + '">Eliminar</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function renderToggle() {
    var counts = { visited: 0, wishlist: 0 };
    var labels = { visited: 'Visitados', wishlist: 'Deseos' };

    places().forEach(function (place) {
      if (counts[place.status] !== undefined) { counts[place.status] += 1; }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-mapview]'), function (button) {
      var view = button.dataset.mapview;
      var active = view === mapView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.textContent = labels[view] + ' (' + counts[view] + ')';
    });
  }

  function signature() {
    return places().map(function (place) { return place.id + ':' + place.status; }).join(',');
  }

  function renderAll(fit) {
    lastSignature = signature();
    renderToggle();
    renderStats();
    renderList();
    renderMarkers(fit);
  }

  function setView(view, fit) {
    mapView = view;
    renderToggle();
    renderMarkers(fit);
  }

  /* ---------- Formulario ---------- */
  function buildCountryList() {
    var datalist = document.createElement('datalist');
    datalist.id = 'countryList';
    datalist.innerHTML = COUNTRIES.map(function (country) {
      return '<option value="' + esc(country.name) + '"></option>';
    }).join('');
    document.body.appendChild(datalist);
    $('placeCountry').setAttribute('list', 'countryList');
  }

  function syncContinent() {
    var match = matchCountry($('placeCountry').value);
    if (match) { $('placeContinent').value = match.continent; }
  }

  $('placeCountry').addEventListener('input', syncContinent);
  $('placeCountry').addEventListener('change', syncContinent);

  $('placeForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var lat = parseFloat($('placeLat').value);
    var lng = parseFloat($('placeLng').value);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      api.toast('Las coordenadas no son válidas.');
      return;
    }

    var typedCountry = $('placeCountry').value.trim();
    var match = matchCountry(typedCountry);

    var place = {
      id: uid(),
      name: $('placeName').value.trim(),
      country: match ? match.name : typedCountry,
      continent: match ? match.continent : $('placeContinent').value,
      lat: lat,
      lng: lng,
      status: $('placeStatus').value
    };

    places().push(place);
    api.save();
    mapView = place.status;
    renderAll(true);
    event.target.reset();

    api.toast(match ? 'Lugar guardado.' : 'Lugar guardado. El país no está en la lista y se contará aparte.');
  });

  $('placeList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) { return; }

    var id = button.dataset.id;
    var place = places().filter(function (entry) { return entry.id === id; })[0];
    if (!place) { return; }

    if (button.dataset.action === 'focus-place') {
      setView(place.status, false);
      if (map) {
        map.setView([place.lat, place.lng], 6);
        $('worldMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    if (button.dataset.action === 'toggle-place') {
      place.status = place.status === 'visited' ? 'wishlist' : 'visited';
      api.save();
      renderAll(false);
    }

    if (button.dataset.action === 'delete-place') {
      if (window.confirm('¿Eliminar "' + place.name + '"?')) {
        var state = api.getState();
        state.places = state.places.filter(function (entry) { return entry.id !== id; });
        api.save();
        renderAll(false);
        api.toast('Lugar eliminado.');
      }
    }
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-mapview]'), function (button) {
    button.addEventListener('click', function () { setView(button.dataset.mapview, true); });
  });

  /* ---------- Eventos globales ---------- */
  document.addEventListener('tabchange', function (event) {
    if (event.detail.tab === 'map' && map) {
      setTimeout(function () {
        map.invalidateSize();
        renderMarkers(true);
      }, 60);
    }
  });

  document.addEventListener('tripchange', function () {
    if (signature() !== lastSignature) { renderAll(true); }
  });

  window.addEventListener('resize', function () {
    if (map) { map.invalidateSize(); }
  });

  /* ---------- Arranque ---------- */
  buildCountryList();
  initMap();
  renderAll(true);
})();
