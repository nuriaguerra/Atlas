/* ==========================================================================
   Ruta Erasmus · js/assistant.js
   Clima (Open-Meteo), recomendador de ropa y equipaje, y enlaces de vuelos.
   Requiere que app.js se cargue antes (expone window.RutaErasmus)

   Servicios usados (gratuitos, sin clave de API):
   - Geocodificación: geocoding-api.open-meteo.com
   - Previsión (16 días): api.open-meteo.com
   - Histórico (clima típico del mes): archive-api.open-meteo.com
   Datos meteorológicos de Open-Meteo.com (licencia CC BY 4.0).
   ========================================================================== */
(function () {
  'use strict';

  var api = window.RutaErasmus;
  if (!api) {
    console.error('assistant.js necesita que app.js se cargue antes.');
    return;
  }

  var MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  var ENDPOINTS = {
    geocode: 'https://geocoding-api.open-meteo.com/v1/search',
    forecast: 'https://api.open-meteo.com/v1/forecast',
    archive: 'https://archive-api.open-meteo.com/v1/archive'
  };

  /* Códigos meteorológicos WMO que devuelve Open-Meteo */
  var WEATHER_CODES = {
    0: 'Despejado', 1: 'Casi despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
    45: 'Niebla', 48: 'Niebla con escarcha',
    51: 'Llovizna débil', 53: 'Llovizna', 55: 'Llovizna intensa', 56: 'Llovizna helada', 57: 'Llovizna helada',
    61: 'Lluvia débil', 63: 'Lluvia', 65: 'Lluvia fuerte', 66: 'Lluvia helada', 67: 'Lluvia helada fuerte',
    71: 'Nieve débil', 73: 'Nieve', 75: 'Nieve fuerte', 77: 'Granizo fino',
    80: 'Chubascos débiles', 81: 'Chubascos', 82: 'Chubascos fuertes', 85: 'Chubascos de nieve', 86: 'Chubascos de nieve fuertes',
    95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta fuerte con granizo'
  };

  /* Aeropuertos principales (ciudad sin tildes → código IATA) para los enlaces de Skyscanner */
  var AIRPORTS = {};
  ('madrid:MAD,barcelona:BCN,valencia:VLC,sevilla:SVQ,seville:SVQ,malaga:AGP,bilbao:BIO,palma:PMI,palma de mallorca:PMI,' +
   'alicante:ALC,granada:GRX,santiago de compostela:SCQ,zaragoza:ZAZ,tenerife:TFS,las palmas:LPA,gran canaria:LPA,ibiza:IBZ,' +
   'lisboa:LIS,lisbon:LIS,oporto:OPO,porto:OPO,faro:FAO,paris:CDG,londres:LHR,london:LHR,dublin:DUB,edimburgo:EDI,edinburgh:EDI,' +
   'amsterdam:AMS,bruselas:BRU,brussels:BRU,berlin:BER,munich:MUC,frankfurt:FRA,hamburgo:HAM,hamburg:HAM,colonia:CGN,cologne:CGN,' +
   'viena:VIE,vienna:VIE,zurich:ZRH,ginebra:GVA,geneva:GVA,roma:FCO,rome:FCO,milan:MXP,milano:MXP,bolonia:BLQ,bologna:BLQ,' +
   'napoles:NAP,naples:NAP,venecia:VCE,venice:VCE,florencia:FLR,florence:FLR,turin:TRN,niza:NCE,nice:NCE,lyon:LYS,marsella:MRS,' +
   'marseille:MRS,toulouse:TLS,burdeos:BOD,bordeaux:BOD,praga:PRG,prague:PRG,budapest:BUD,varsovia:WAW,warsaw:WAW,warszawa:WAW,' +
   'bialystok:WAW,cracovia:KRK,krakow:KRK,cracow:KRK,gdansk:GDN,breslavia:WRO,wroclaw:WRO,poznan:POZ,katowice:KTW,lublin:LUZ,' +
   'rzeszow:RZE,vilna:VNO,vilnius:VNO,riga:RIX,tallin:TLL,tallinn:TLL,copenhague:CPH,copenhagen:CPH,estocolmo:ARN,stockholm:ARN,' +
   'oslo:OSL,helsinki:HEL,reikiavik:KEF,reykjavik:KEF,atenas:ATH,athens:ATH,estambul:IST,istanbul:IST,bucarest:OTP,bucharest:OTP,' +
   'sofia:SOF,belgrado:BEG,belgrade:BEG,zagreb:ZAG,split:SPU,dubrovnik:DBV,liubliana:LJU,ljubljana:LJU,bratislava:BTS,malta:MLA,' +
   'la valeta:MLA,marrakech:RAK,casablanca:CMN,el cairo:CAI,cairo:CAI,nueva york:JFK,new york:JFK,tokio:HND,tokyo:HND')
    .split(',').forEach(function (pair) {
      var parts = pair.split(':');
      AIRPORTS[parts[0]] = parts[1];
    });

  /* ---------- Utilidades ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalize(text) {
    return String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function isoDate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function average(list) {
    if (!list.length) { return null; }
    return list.reduce(function (sum, value) { return sum + value; }, 0) / list.length;
  }

  function fetchJson(url) {
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) { controller.abort(); } }, 12000);

    return fetch(url, controller ? { signal: controller.signal } : {})
      .then(function (response) {
        clearTimeout(timer);
        if (!response.ok) { throw new Error('HTTP ' + response.status); }
        return response.json();
      })
      .then(function (data) {
        if (data && data.error) { throw new Error(data.reason || 'Error del servicio'); }
        return data;
      })
      .catch(function (error) {
        clearTimeout(timer);
        throw error;
      });
  }

  /* ---------- Open-Meteo ---------- */
  function geocode(query) {
    var parts = query.split(',');
    var name = parts[0].trim();
    var hint = normalize(parts.slice(1).join(' '));
    var url = ENDPOINTS.geocode + '?name=' + encodeURIComponent(name) + '&count=10&language=es&format=json';

    return fetchJson(url).then(function (data) {
      var results = data.results || [];
      if (!results.length) { return null; }

      var pick = results[0];
      if (hint) {
        for (var i = 0; i < results.length; i++) {
          var r = results[i];
          if (normalize(r.country || '').indexOf(hint) !== -1 ||
              normalize(r.admin1 || '').indexOf(hint) !== -1 ||
              String(r.country_code || '').toLowerCase() === hint) {
            pick = r;
            break;
          }
        }
      }

      return { name: pick.name, country: pick.country || '', lat: pick.latitude, lng: pick.longitude };
    });
  }

  function fetchForecast(place) {
    var url = ENDPOINTS.forecast + '?latitude=' + place.lat + '&longitude=' + place.lng +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max' +
      '&forecast_days=16&timezone=auto';
    return fetchJson(url).then(function (data) { return data.daily || null; });
  }

  function fetchHistory(place) {
    var year = new Date().getFullYear();
    var url = ENDPOINTS.archive + '?latitude=' + place.lat + '&longitude=' + place.lng +
      '&start_date=' + (year - 3) + '-01-01&end_date=' + (year - 1) + '-12-31' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto';
    return fetchJson(url).then(function (data) { return data.daily || null; });
  }

  /* Estadísticas del clima típico de un mes (media de los últimos tres años) */
  function climateStats(daily, month) {
    if (!daily || !daily.time) { return null; }
    var highs = [];
    var lows = [];
    var winds = [];
    var rainy = 0;
    var counted = 0;

    for (var i = 0; i < daily.time.length; i++) {
      if (parseInt(daily.time[i].slice(5, 7), 10) - 1 !== month) { continue; }
      if (daily.temperature_2m_max[i] != null) { highs.push(daily.temperature_2m_max[i]); }
      if (daily.temperature_2m_min[i] != null) { lows.push(daily.temperature_2m_min[i]); }
      if (daily.wind_speed_10m_max[i] != null) { winds.push(daily.wind_speed_10m_max[i]); }
      if (daily.precipitation_sum[i] != null) {
        counted += 1;
        if (daily.precipitation_sum[i] >= 1) { rainy += 1; }
      }
    }

    if (!highs.length || !lows.length) { return null; }
    return {
      tMax: average(highs),
      tMin: average(lows),
      rainShare: counted ? (rainy / counted) * 100 : 0,
      wind: winds.length ? average(winds) : 0,
      uv: null
    };
  }

  /* Estadísticas de los primeros n días de la previsión */
  function forecastStats(daily, count) {
    if (!daily || !daily.time) { return null; }
    var n = Math.min(count, daily.time.length);
    var highs = [];
    var lows = [];
    var rainy = 0;
    var counted = 0;
    var wind = 0;
    var uv = 0;

    for (var i = 0; i < n; i++) {
      if (daily.temperature_2m_max[i] != null) { highs.push(daily.temperature_2m_max[i]); }
      if (daily.temperature_2m_min[i] != null) { lows.push(daily.temperature_2m_min[i]); }
      if (daily.precipitation_sum[i] != null) {
        counted += 1;
        if (daily.precipitation_sum[i] >= 1) { rainy += 1; }
      }
      if (daily.wind_speed_10m_max[i] != null) { wind = Math.max(wind, daily.wind_speed_10m_max[i]); }
      if (daily.uv_index_max[i] != null) { uv = Math.max(uv, daily.uv_index_max[i]); }
    }

    if (!highs.length || !lows.length) { return null; }
    return {
      tMax: average(highs),
      tMin: average(lows),
      rainShare: counted ? (rainy / counted) * 100 : 0,
      wind: wind,
      uv: uv
    };
  }

  /* ---------- Recomendador de ropa y equipaje ---------- */
  function buildAdvice(stats, days) {
    var clothes = [];
    var shoes = [];
    var protection = [];
    var weatherGear = [];
    var tMax = stats.tMax;
    var tMin = stats.tMin;

    if (tMax >= 30) {
      clothes.push('Camisetas ligeras de algodón o lino', 'Pantalones cortos o faldas ligeras', 'Un pantalón largo fino para visitas y cenas');
      shoes.push('Sandalias cómodas', 'Zapatillas transpirables');
    } else if (tMax >= 22) {
      clothes.push('Camisetas y camisas de manga corta', 'Pantalones ligeros');
      if (tMin < 16) { clothes.push('Una sudadera fina para la noche'); }
      shoes.push('Zapatillas cómodas');
    } else if (tMax >= 15) {
      clothes.push('Camisetas de manga larga', 'Jersey o sudadera', 'Pantalón largo', 'Chaqueta ligera');
      shoes.push('Zapatillas o botines');
    } else if (tMax >= 8) {
      clothes.push('Jersey grueso o forro polar', 'Chaqueta o abrigo ligero', 'Pantalón largo', 'Bufanda fina');
      shoes.push('Calzado cerrado', 'Calcetines gruesos');
    } else if (tMax >= 0) {
      clothes.push('Abrigo de invierno', 'Capas térmicas', 'Jersey de lana', 'Gorro, bufanda y guantes');
      shoes.push('Botas con buen aislamiento');
    } else {
      clothes.push('Abrigo muy aislante o plumas', 'Ropa térmica interior', 'Calcetines de lana', 'Gorro, bufanda y guantes gruesos');
      shoes.push('Botas impermeables con suela antideslizante');
    }

    if (tMin <= 5 && tMax >= 15) { clothes.push('Una capa extra para mañanas y noches frías'); }
    if (tMax - tMin >= 12) { clothes.push('Ropa por capas: el día y la noche son muy distintos'); }

    if (tMax >= 22 || (stats.uv !== null && stats.uv >= 5)) { protection.push('Gafas de sol', 'Protector solar'); }
    if (tMax >= 26) { protection.push('Gorra o sombrero', 'Botella reutilizable para el agua'); }
    if (tMax <= 5) { protection.push('Crema hidratante y bálsamo labial'); }

    if (stats.rainShare >= 30) { weatherGear.push('Paraguas compacto', 'Chubasquero ligero', 'Calzado que aguante la lluvia'); }
    if (stats.wind >= 35) { weatherGear.push('Cortavientos'); }

    var tops = Math.min(days, 7);
    var underwear = Math.min(days + 1, 8);
    var bottoms = days <= 3 ? 2 : (days <= 7 ? 3 : 4);
    var quantities = [
      'Camisetas o tops: ' + tops,
      'Pantalones o faldas: ' + bottoms,
      'Ropa interior y calcetines: ' + underwear + ' de cada'
    ];
    if (days > 7) { quantities.push('Plan de lavado: una colada por semana'); }

    var essentials = [
      'DNI o pasaporte',
      'Tarjeta sanitaria europea (dentro de la UE)',
      'Cargador y batería externa',
      'Adaptador de enchufe (según el país)',
      'Botiquín básico y medicación personal',
      'Copia digital de documentos y reservas'
    ];

    var groups = [
      { title: 'Ropa', items: clothes },
      { title: 'Calzado', items: shoes },
      { title: 'Protección', items: protection },
      { title: 'Lluvia y viento', items: weatherGear },
      { title: 'Cantidades orientativas', items: quantities },
      { title: 'Imprescindibles', items: essentials }
    ];

    return groups.filter(function (group) { return group.items.length > 0; });
  }

  function renderAdvice(groups) {
    $('clothesList').innerHTML = groups.map(function (group) {
      return '<li class="group">' + esc(group.title) + '</li>' + group.items.map(function (item) {
        return '<li>' + esc(item) + '</li>';
      }).join('');
    }).join('');
  }

  /* ---------- Render del clima ---------- */
  function setBox(html) { $('weatherBox').innerHTML = html; }

  function degrees(value) { return Math.round(value) + '°'; }

  function statsLine(stats) {
    return 'Máx. ' + degrees(stats.tMax) + ' · Mín. ' + degrees(stats.tMin) +
      ' · Lluvia en el ' + Math.round(stats.rainShare) + ' % de los días' +
      (stats.wind ? ' · Viento hasta ' + Math.round(stats.wind) + ' km/h' : '');
  }

  function forecastGrid(daily) {
    var html = '<div class="weather__grid">';
    var count = Math.min(7, daily.time.length);

    for (var i = 0; i < count; i++) {
      var date = new Date(daily.time[i] + 'T00:00:00');
      var label = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
      var text = WEATHER_CODES[daily.weather_code[i]] || 'Sin datos';
      var rain = daily.precipitation_probability_max && daily.precipitation_probability_max[i] != null
        ? '<div class="small">Lluvia ' + Math.round(daily.precipitation_probability_max[i]) + ' %</div>' : '';

      html += '<div>' +
        '<strong>' + esc(label) + '</strong>' +
        '<div class="weather__temp">' + degrees(daily.temperature_2m_max[i]) + '</div>' +
        '<div class="muted small">mín. ' + degrees(daily.temperature_2m_min[i]) + '</div>' +
        '<div class="small">' + esc(text) + '</div>' + rain +
      '</div>';
    }

    return html + '</div>';
  }

  var requestId = 0;

  function runWeather(query, month, days) {
    var current = ++requestId;
    setBox('<p class="muted">Consultando el clima…</p>');
    $('clothesList').innerHTML = '';

    geocode(query)
      .then(function (place) {
        if (current !== requestId) { return null; }
        if (!place) {
          setBox('<p>No se encontró «' + esc(query) + '». Prueba con otro nombre o añade el país, por ejemplo «Lisboa, Portugal».</p>');
          return null;
        }

        return Promise.all([
          fetchForecast(place).catch(function () { return null; }),
          fetchHistory(place).catch(function () { return null; })
        ]).then(function (results) {
          if (current !== requestId) { return; }
          showResults(place, results[0], results[1], month, days);
        });
      })
      .catch(function () {
        if (current !== requestId) { return; }
        setBox('<p>No se pudo consultar el clima. Comprueba tu conexión e inténtalo de nuevo.</p>');
      });
  }

  function showResults(place, forecast, history, month, days) {
    var monthName = MONTHS_ES[month];
    var currentMonth = new Date().getMonth();
    var typical = climateStats(history, month);
    var stats = null;
    var basis = '';

    if (month === currentMonth && forecast) {
      var n = Math.min(days, 16);
      stats = forecastStats(forecast, n);
      basis = 'Sugerencias basadas en la previsión de los próximos ' + n + ' días.';
    }
    if (!stats && typical) {
      stats = typical;
      basis = 'Sugerencias basadas en el clima típico de ' + monthName.toLowerCase() + ' (media de los últimos 3 años).';
    }
    if (!stats && forecast) {
      stats = forecastStats(forecast, 16);
      basis = 'No hay datos históricos: las sugerencias usan la previsión de los próximos 16 días.';
    }

    if (!stats) {
      setBox('<p>No hay datos meteorológicos disponibles para este destino.</p>');
      return;
    }

    var html = '<p><strong>' + esc(place.name) + (place.country ? ', ' + esc(place.country) : '') + '</strong></p>';
    if (forecast) { html += '<p class="muted small">Previsión de los próximos días</p>' + forecastGrid(forecast); }
    if (typical) { html += '<p class="small">Clima típico de ' + esc(monthName.toLowerCase()) + ': ' + esc(statsLine(typical)) + '.</p>'; }
    html += '<p class="muted small">' + esc(basis) + '</p>';
    html += '<p class="muted small">Datos meteorológicos: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a></p>';

    setBox(html);
    renderAdvice(buildAdvice(stats, days));
  }

  /* ---------- Vuelos ---------- */
  function resolveAirport(text) {
    var clean = String(text).trim();
    if (/^[a-z]{3}$/i.test(clean)) { return clean.toUpperCase(); }
    return AIRPORTS[normalize(clean)] || null;
  }

  /* Primer día del mes elegido; si ya pasó, se usa mañana. */
  function targetDate(year, month) {
    var first = new Date(year, month, 1);
    var tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return first < tomorrow ? tomorrow : first;
  }

  function flightInfo() {
    var info = $('flightInfo');
    if (!info) {
      info = document.createElement('p');
      info.id = 'flightInfo';
      info.className = 'muted small';
      info.setAttribute('aria-live', 'polite');
      $('flightForm').appendChild(info);
    }
    return info;
  }

  function updateFlightLinks() {
    var from = $('flightFrom').value.trim();
    var to = $('flightTo').value.trim();
    var month = parseInt($('flightMonth').value, 10);
    var year = parseInt($('flightYear').value, 10);
    var sky = $('linkSkyscanner');
    var google = $('linkGoogleFlights');
    var cheapest = $('linkCheapestMonth');
    var info = flightInfo();

    if (!from || !to || isNaN(month) || isNaN(year)) {
      sky.href = 'https://www.skyscanner.es/';
      google.href = 'https://www.google.com/travel/flights';
      cheapest.href = 'https://www.google.com/travel/flights';
      info.textContent = 'Escribe origen y destino para generar los enlaces.';
      return;
    }

    var iso = isoDate(targetDate(year, month));
    var query = 'Flights from ' + from + ' to ' + to;
    var suffix = '&hl=es&curr=EUR';

    google.href = 'https://www.google.com/travel/flights?q=' + encodeURIComponent(query + ' on ' + iso) + suffix;
    cheapest.href = 'https://www.google.com/travel/flights?q=' + encodeURIComponent(query) + suffix;

    var fromCode = resolveAirport(from);
    var toCode = resolveAirport(to);
    var notes = ['Google Flights busca el ' + iso + '.'];

    if (fromCode && toCode) {
      var yymmdd = iso.slice(2).replace(/-/g, '');
      sky.href = 'https://www.skyscanner.es/transporte/vuelos/' + fromCode.toLowerCase() + '/' + toCode.toLowerCase() + '/' + yymmdd + '/?adultsv2=1&cabinclass=economy';
      notes.push('Skyscanner usa los aeropuertos ' + fromCode + ' → ' + toCode + ' (escribe un código IATA de 3 letras para cambiarlos).');
    } else {
      sky.href = 'https://www.skyscanner.es/';
      notes.push('Para abrir Skyscanner con tu búsqueda escribe códigos IATA de 3 letras, por ejemplo WAW o LIS.');
    }

    notes.push('«Mes más barato» abre Google Flights sin fecha fija: usa el calendario de precios del buscador para comparar meses.');
    info.textContent = notes.join(' ');
  }

  /* ---------- Formularios ---------- */
  function fillSelect(select, options, selected) {
    select.innerHTML = options.map(function (option) {
      return '<option value="' + option.value + '"' + (option.value === selected ? ' selected' : '') + '>' + esc(option.label) + '</option>';
    }).join('');
  }

  function monthOptions() {
    return MONTHS_ES.map(function (name, index) { return { value: index, label: name }; });
  }

  function buildSelects() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    var years = [];
    var tripYear = null;
    var trip = api.getSelectedTrip();
    if (trip) { tripYear = new Date(trip.start).getFullYear(); }

    var firstYear = Math.min(now.getFullYear(), tripYear || now.getFullYear());
    for (var y = firstYear; y <= now.getFullYear() + 2; y++) { years.push({ value: y, label: String(y) }); }

    fillSelect($('clothesMonth'), monthOptions(), now.getMonth());
    fillSelect($('flightMonth'), monthOptions(), next.getMonth());
    fillSelect($('flightYear'), years, next.getFullYear());
    $('clothesMonth').value = now.getMonth();
    $('flightMonth').value = next.getMonth();
    $('flightYear').value = next.getFullYear();
  }

  var lastTripId = null;

  function tripDays(trip) {
    var start = new Date(trip.start.slice(0, 10) + 'T00:00:00');
    var end = new Date(trip.end.slice(0, 10) + 'T00:00:00');
    return Math.max(1, Math.min(60, Math.round((end - start) / 86400000) + 1));
  }

  function applyTripDefaults() {
    var trip = api.getSelectedTrip();
    if (!trip || trip.id === lastTripId) { return; }
    lastTripId = trip.id;

    var start = new Date(trip.start);
    $('clothesCity').value = trip.destination;
    $('clothesMonth').value = start.getMonth();
    $('clothesDays').value = tripDays(trip);
    $('flightFrom').value = trip.origin;
    $('flightTo').value = trip.destination;
    $('flightMonth').value = start.getMonth();

    var yearSelect = $('flightYear');
    if (!Array.prototype.some.call(yearSelect.options, function (o) { return parseInt(o.value, 10) === start.getFullYear(); })) {
      var option = document.createElement('option');
      option.value = start.getFullYear();
      option.textContent = String(start.getFullYear());
      yearSelect.insertBefore(option, yearSelect.firstChild);
    }
    yearSelect.value = start.getFullYear();
  }

  $('clothesForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var city = $('clothesCity').value.trim();
    var month = parseInt($('clothesMonth').value, 10);
    var days = parseInt($('clothesDays').value, 10);

    if (!city) { return; }
    if (isNaN(days) || days < 1) { days = 1; }
    if (days > 60) { days = 60; }

    runWeather(city, month, days);
  });

  ['flightFrom', 'flightTo', 'flightMonth', 'flightYear'].forEach(function (id) {
    $(id).addEventListener('input', updateFlightLinks);
    $(id).addEventListener('change', updateFlightLinks);
  });

  ['linkSkyscanner', 'linkGoogleFlights', 'linkCheapestMonth'].forEach(function (id) {
    $(id).addEventListener('click', function (event) {
      if (!$('flightFrom').value.trim() || !$('flightTo').value.trim()) {
        event.preventDefault();
        api.toast('Escribe origen y destino para buscar vuelos.');
      }
    });
  });

  document.addEventListener('tripchange', function () {
    applyTripDefaults();
    updateFlightLinks();
  });

  /* ---------- Arranque ---------- */
  buildSelects();
  applyTripDefaults();
  updateFlightLinks();
})();
