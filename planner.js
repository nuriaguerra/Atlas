/* ==========================================================================
   Ruta Erasmus · js/planner.js
   Itinerario hora por hora y presupuesto por categoría
   Requiere que app.js se cargue antes (expone window.RutaErasmus)
   ========================================================================== */
(function () {
  'use strict';

  var api = window.RutaErasmus;
  if (!api) {
    console.error('planner.js necesita que app.js se cargue antes.');
    return;
  }

  var CATEGORIES = [
    { id: 'ver', label: 'Qué ver' },
    { id: 'comer', label: 'Comer' },
    { id: 'transporte', label: 'Transporte' },
    { id: 'alojamiento', label: 'Alojamiento' },
    { id: 'recordatorio', label: 'Recordatorio' },
    { id: 'otros', label: 'Otros' }
  ];

  var money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  var selectedDay = 'all';
  var loadedTripId = null;

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

  function categoryLabel(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) { return CATEGORIES[i].label; }
    }
    return 'Otros';
  }

  function dateOnly(iso) { return String(iso).slice(0, 10); }

  function parseDay(day) { return new Date(day + 'T00:00:00'); }

  function dayNumber(day, trip) {
    var diff = parseDay(day) - parseDay(dateOnly(trip.start));
    return Math.round(diff / 86400000) + 1;
  }

  function dayLabel(day) {
    var text = parseDay(day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /* ---------- Datos ---------- */
  function currentTrip() { return api.getSelectedTrip(); }

  function getPlan(tripId, create) {
    var state = api.getState();
    if (!state.plans || typeof state.plans !== 'object' || Array.isArray(state.plans)) {
      if (!create) { return null; }
      state.plans = {};
    }
    var plan = state.plans[tripId];
    if (!plan) {
      if (!create) { return null; }
      plan = state.plans[tripId] = { items: [], budget: 0 };
    }
    if (!Array.isArray(plan.items)) { plan.items = []; }
    plan.budget = Number(plan.budget) || 0;
    return plan;
  }

  function cleanupOrphans() {
    var state = api.getState();
    if (!state.plans || typeof state.plans !== 'object') { return; }
    var valid = {};
    state.trips.forEach(function (trip) { valid[trip.id] = true; });
    var changed = false;
    Object.keys(state.plans).forEach(function (id) {
      if (!valid[id]) {
        delete state.plans[id];
        changed = true;
      }
    });
    if (changed) { api.save(); }
  }

  function sortedItems(plan) {
    return plan.items.slice().sort(function (a, b) {
      var left = a.date + ' ' + a.time;
      var right = b.date + ' ' + b.time;
      return left < right ? -1 : (left > right ? 1 : 0);
    });
  }

  function daysOf(items) {
    var seen = {};
    var days = [];
    items.forEach(function (item) {
      if (!seen[item.date]) {
        seen[item.date] = true;
        days.push(item.date);
      }
    });
    return days;
  }

  /* ---------- Formulario ---------- */
  function prepareForm(trip) {
    var dateInput = $('planDate');
    if (!trip) {
      dateInput.removeAttribute('min');
      dateInput.removeAttribute('max');
      return;
    }
    var min = dateOnly(trip.start);
    var max = dateOnly(trip.end);
    dateInput.min = min;
    dateInput.max = max;
    if (!dateInput.value || dateInput.value < min || dateInput.value > max) {
      dateInput.value = min;
    }
  }

  /* ---------- Render ---------- */
  function renderChips(days, trip) {
    var box = $('dayChips');
    if (!trip || !days.length) {
      box.innerHTML = '';
      return;
    }
    var html = '<button type="button" class="chip' + (selectedDay === 'all' ? ' is-active' : '') +
      '" data-day="all" aria-pressed="' + (selectedDay === 'all') + '">Todos</button>';
    days.forEach(function (day) {
      var active = selectedDay === day;
      html += '<button type="button" class="chip' + (active ? ' is-active' : '') + '" data-day="' + esc(day) +
        '" aria-pressed="' + active + '">Día ' + dayNumber(day, trip) + '</button>';
    });
    box.innerHTML = html;
  }

  function renderTimeline(items, trip) {
    var list = $('timeline');

    if (!trip) {
      list.innerHTML = '<li class="empty">Crea o selecciona un viaje en la pestaña Inicio para planificar su itinerario.</li>';
      return;
    }
    if (!items.length) {
      list.innerHTML = '<li class="empty">El itinerario está vacío. Añade tu primera actividad.</li>';
      return;
    }

    var visible = items.filter(function (item) { return selectedDay === 'all' || item.date === selectedDay; });
    var html = '';
    var lastDay = null;

    visible.forEach(function (item) {
      if (item.date !== lastDay) {
        lastDay = item.date;
        var dayTotal = items.reduce(function (sum, other) {
          return other.date === item.date ? sum + (Number(other.cost) || 0) : sum;
        }, 0);
        html += '<li class="timeline__day">Día ' + dayNumber(item.date, trip) + ' · ' + esc(dayLabel(item.date)) +
          (dayTotal > 0 ? ' <span class="muted">· ' + esc(money.format(dayTotal)) + '</span>' : '') + '</li>';
      }

      var cost = Number(item.cost) || 0;
      html += '<li class="item' + (item.done ? ' is-done' : '') + '">' +
        '<div class="item__main">' +
          '<div class="item__title"><span class="timeline__time">' + esc(item.time) + '</span>' + esc(item.title) +
          ' <span class="tag">' + esc(categoryLabel(item.category)) + '</span></div>' +
          (item.notes ? '<div class="item__meta">' + esc(item.notes) + '</div>' : '') +
        '</div>' +
        '<div class="item__actions">' +
          (cost > 0 ? '<span class="amount">' + esc(money.format(cost)) + '</span>' : '') +
          '<button type="button" class="btn btn--ghost btn--small" data-action="toggle-done" data-id="' + esc(item.id) +
          '" aria-pressed="' + (item.done ? 'true' : 'false') + '">' + (item.done ? 'Deshacer' : 'Hecho') + '</button>' +
          '<button type="button" class="btn btn--danger btn--small" data-action="delete-item" data-id="' + esc(item.id) + '">Eliminar</button>' +
        '</div>' +
      '</li>';
    });

    list.innerHTML = html;
  }

  function renderBudget(plan) {
    var totals = {};
    var spent = 0;

    plan.items.forEach(function (item) {
      var cost = Number(item.cost) || 0;
      totals[item.category] = (totals[item.category] || 0) + cost;
      spent += cost;
    });

    $('budgetSpent').textContent = money.format(spent);

    var bar = $('budgetProgress');
    var ratio = plan.budget > 0 ? spent / plan.budget : 0;
    bar.style.width = Math.min(100, ratio * 100) + '%';
    bar.classList.toggle('is-over', plan.budget > 0 && spent > plan.budget);

    var list = $('budgetList');
    if (spent <= 0) {
      list.innerHTML = '<li class="empty">Añade actividades con coste para ver el desglose.</li>';
      return;
    }

    var html = '';
    CATEGORIES.forEach(function (category) {
      var value = totals[category.id] || 0;
      if (value <= 0) { return; }
      var share = (value / spent) * 100;
      html += '<li>' +
        '<div class="item"><span>' + esc(category.label) + ' <span class="muted small">(' + Math.round(share) + ' %)</span></span>' +
        '<span class="amount">' + esc(money.format(value)) + '</span></div>' +
        '<div class="progress" aria-hidden="true"><div class="progress__bar" style="width:' + share + '%"></div></div>' +
      '</li>';
    });

    if (plan.budget > 0) {
      var left = plan.budget - spent;
      html += '<li><div class="item"><span>' + (left >= 0 ? 'Presupuesto restante' : 'Te pasas del presupuesto') + '</span>' +
        '<span class="amount ' + (left >= 0 ? 'amount--positive' : 'amount--negative') + '">' +
        esc(money.format(Math.abs(left))) + '</span></div></li>';
    }

    list.innerHTML = html;
  }

  function render() {
    var trip = currentTrip();
    var plan = trip ? (getPlan(trip.id, false) || { items: [], budget: 0 }) : { items: [], budget: 0 };
    var tripId = trip ? trip.id : null;

    if (tripId !== loadedTripId) {
      loadedTripId = tripId;
      selectedDay = 'all';
      $('budgetTotal').value = plan.budget || 0;
    }

    $('budgetTotal').disabled = !trip;

    var items = sortedItems(plan);
    var days = daysOf(items);
    if (selectedDay !== 'all' && days.indexOf(selectedDay) === -1) { selectedDay = 'all'; }

    prepareForm(trip);
    renderChips(days, trip);
    renderTimeline(items, trip);
    renderBudget(plan);
  }

  /* ---------- Eventos ---------- */
  $('planForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var trip = currentTrip();
    if (!trip) {
      api.toast('Primero crea un viaje en la pestaña Inicio.');
      return;
    }

    var cost = parseFloat($('planCost').value);
    var item = {
      id: uid(),
      date: $('planDate').value,
      time: $('planTime').value,
      category: $('planCategory').value,
      title: $('planTitle').value.trim(),
      cost: isNaN(cost) || cost < 0 ? 0 : Math.round(cost * 100) / 100,
      notes: $('planNotes').value.trim(),
      done: false
    };

    if (!item.date || !item.time || !item.title) {
      api.toast('Completa día, hora y título.');
      return;
    }

    getPlan(trip.id, true).items.push(item);
    api.save();

    event.target.reset();
    $('planDate').value = item.date;
    $('planCategory').value = item.category;
    render();
    api.toast('Actividad añadida.');
  });

  $('budgetTotal').addEventListener('input', function (event) {
    var trip = currentTrip();
    if (!trip) { return; }
    var plan = getPlan(trip.id, true);
    plan.budget = Math.max(0, parseFloat(event.target.value) || 0);
    api.save();
    renderBudget(plan);
  });

  $('dayChips').addEventListener('click', function (event) {
    var chip = event.target.closest('[data-day]');
    if (!chip) { return; }
    selectedDay = chip.dataset.day;
    render();
  });

  $('timeline').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    var trip = currentTrip();
    if (!button || !trip) { return; }

    var plan = getPlan(trip.id, false);
    if (!plan) { return; }
    var id = button.dataset.id;
    var item = plan.items.filter(function (entry) { return entry.id === id; })[0];
    if (!item) { return; }

    if (button.dataset.action === 'toggle-done') {
      item.done = !item.done;
      api.save();
      render();
    }

    if (button.dataset.action === 'delete-item') {
      if (window.confirm('¿Eliminar "' + item.title + '" del itinerario?')) {
        plan.items = plan.items.filter(function (entry) { return entry.id !== id; });
        api.save();
        render();
        api.toast('Actividad eliminada.');
      }
    }
  });

  document.addEventListener('tripchange', function () {
    cleanupOrphans();
    render();
  });

  /* ---------- Arranque ---------- */
  cleanupOrphans();
  render();
})();
