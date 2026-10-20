/* ==========================================================================
   Ruta Erasmus · js/expenses.js
   Gastos compartidos: quién pagó qué, balances y liquidación de deudas.
   Requiere que app.js se cargue antes (expone window.RutaErasmus)

   Estructura guardada en el estado:
   state.expenses[tripId] = {
     members: [{ id, name }],
     items:   [{ id, title, amount, payerId, splitIds, createdAt, settlement }]
   }
   Los importes se guardan en céntimos (enteros) para evitar errores de redondeo.
   ========================================================================== */
(function () {
  'use strict';

  var api = window.RutaErasmus;
  if (!api) {
    console.error('expenses.js necesita que app.js se cargue antes.');
    return;
  }

  var money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  var uncheckedIds = {};

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

  function euros(cents) { return money.format(cents / 100); }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ---------- Datos ---------- */
  function currentTrip() { return api.getSelectedTrip(); }

  function getData(tripId, create) {
    var state = api.getState();
    if (!state.expenses || typeof state.expenses !== 'object' || Array.isArray(state.expenses)) {
      if (!create) { return null; }
      state.expenses = {};
    }
    var data = state.expenses[tripId];
    if (!data) {
      if (!create) { return null; }
      data = state.expenses[tripId] = { members: [], items: [] };
    }
    if (!Array.isArray(data.members)) { data.members = []; }
    if (!Array.isArray(data.items)) { data.items = []; }
    return data;
  }

  function emptyData() { return { members: [], items: [] }; }

  function cleanupOrphans() {
    var state = api.getState();
    if (!state.expenses || typeof state.expenses !== 'object') { return; }
    var valid = {};
    state.trips.forEach(function (trip) { valid[trip.id] = true; });
    var changed = false;
    Object.keys(state.expenses).forEach(function (id) {
      if (!valid[id]) {
        delete state.expenses[id];
        changed = true;
      }
    });
    if (changed) { api.save(); }
  }

  function memberName(data, id) {
    for (var i = 0; i < data.members.length; i++) {
      if (data.members[i].id === id) { return data.members[i].name; }
    }
    return 'Persona eliminada';
  }

  function memberInUse(data, id) {
    return data.items.some(function (item) {
      return item.payerId === id || item.splitIds.indexOf(id) !== -1;
    });
  }

  /* ---------- Cálculo ---------- */
  /* Reparte un importe en céntimos entre n personas; el resto se asigna de uno en uno. */
  function splitCents(amount, count) {
    var base = Math.floor(amount / count);
    var rest = amount - base * count;
    var shares = [];
    for (var i = 0; i < count; i++) { shares.push(base + (i < rest ? 1 : 0)); }
    return shares;
  }

  /* Balance por persona: lo que pagó menos lo que le corresponde. Positivo = le deben. */
  function computeBalances(data) {
    var balances = {};
    data.members.forEach(function (member) { balances[member.id] = 0; });

    data.items.forEach(function (item) {
      if (balances[item.payerId] !== undefined) { balances[item.payerId] += item.amount; }
      var shares = splitCents(item.amount, item.splitIds.length);
      item.splitIds.forEach(function (id, index) {
        if (balances[id] !== undefined) { balances[id] -= shares[index]; }
      });
    });

    return balances;
  }

  /* Pagos mínimos para saldar: el mayor deudor paga al mayor acreedor. */
  function computeSettlements(balances) {
    var creditors = [];
    var debtors = [];

    Object.keys(balances).forEach(function (id) {
      if (balances[id] > 0) { creditors.push({ id: id, amount: balances[id] }); }
      if (balances[id] < 0) { debtors.push({ id: id, amount: -balances[id] }); }
    });

    function byAmount(a, b) { return b.amount - a.amount; }
    creditors.sort(byAmount);
    debtors.sort(byAmount);

    var payments = [];
    var i = 0;
    var j = 0;

    while (i < creditors.length && j < debtors.length) {
      var pay = Math.min(creditors[i].amount, debtors[j].amount);
      payments.push({ from: debtors[j].id, to: creditors[i].id, amount: pay });
      creditors[i].amount -= pay;
      debtors[j].amount -= pay;
      if (creditors[i].amount === 0) { i += 1; }
      if (debtors[j].amount === 0) { j += 1; }
    }

    return payments;
  }

  /* ---------- Render ---------- */
  function renderMembers(data, trip) {
    var list = $('memberList');
    if (!trip) {
      list.innerHTML = '<li class="empty">Crea o selecciona un viaje en la pestaña Inicio.</li>';
      return;
    }
    if (!data.members.length) {
      list.innerHTML = '<li class="empty">Añade al menos dos personas.</li>';
      return;
    }
    list.innerHTML = data.members.map(function (member) {
      return '<li>' + esc(member.name) +
        ' <button type="button" class="link-btn" data-action="remove-member" data-id="' + esc(member.id) +
        '" aria-label="Quitar a ' + esc(member.name) + '">×</button></li>';
    }).join('');
  }

  function renderForm(data) {
    var select = $('expensePayer');
    var previous = select.value;

    if (!data.members.length) {
      select.innerHTML = '<option value="">Añade compañeros</option>';
      $('expenseSplit').innerHTML = '<span class="muted small">Aún no hay compañeros.</span>';
      return;
    }

    select.innerHTML = data.members.map(function (member) {
      return '<option value="' + esc(member.id) + '">' + esc(member.name) + '</option>';
    }).join('');
    if (previous && data.members.some(function (m) { return m.id === previous; })) { select.value = previous; }

    $('expenseSplit').innerHTML = data.members.map(function (member) {
      var checked = uncheckedIds[member.id] ? '' : ' checked';
      return '<label><input type="checkbox" value="' + esc(member.id) + '"' + checked + '> ' + esc(member.name) + '</label>';
    }).join('');
  }

  function renderExpenses(data) {
    var list = $('expenseList');
    if (!data.items.length) {
      list.innerHTML = '<li class="empty">Aún no hay gastos.</li>';
      return;
    }

    var items = data.items.slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
    });

    list.innerHTML = items.map(function (item) {
      var who = item.splitIds.map(function (id) { return memberName(data, id); }).join(', ');
      var meta = item.settlement
        ? 'De ' + esc(memberName(data, item.payerId)) + ' a ' + esc(who)
        : 'Pagó ' + esc(memberName(data, item.payerId)) + ' · Entre ' + esc(who);

      return '<li class="item">' +
        '<div class="item__main">' +
          '<div class="item__title">' + esc(item.title) + (item.settlement ? ' <span class="tag">Pago</span>' : '') + '</div>' +
          '<div class="item__meta">' + meta + ' · ' + esc(formatDate(item.createdAt)) + '</div>' +
        '</div>' +
        '<div class="item__actions">' +
          '<span class="amount">' + esc(euros(item.amount)) + '</span>' +
          '<button type="button" class="btn btn--danger btn--small" data-action="delete-expense" data-id="' + esc(item.id) + '">Eliminar</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function renderBalances(data) {
    var balanceList = $('balanceList');
    var settleList = $('settleList');

    if (!data.items.length || !data.members.length) {
      balanceList.innerHTML = '<li class="empty">Sin gastos registrados.</li>';
      settleList.innerHTML = '<li class="empty">No hay pagos pendientes.</li>';
      return;
    }

    var balances = computeBalances(data);
    var total = data.items.reduce(function (sum, item) { return item.settlement ? sum : sum + item.amount; }, 0);

    var html = '<li class="item"><span class="muted">Total gastado</span><span class="amount">' + esc(euros(total)) + '</span></li>';
    data.members.forEach(function (member) {
      var value = balances[member.id] || 0;
      var label = 'Al día';
      var css = 'amount';
      if (value > 0) { label = 'Recibe ' + euros(value); css += ' amount--positive'; }
      if (value < 0) { label = 'Debe ' + euros(-value); css += ' amount--negative'; }
      html += '<li class="item"><span>' + esc(member.name) + '</span><span class="' + css + '">' + esc(label) + '</span></li>';
    });
    balanceList.innerHTML = html;

    var payments = computeSettlements(balances);
    if (!payments.length) {
      settleList.innerHTML = '<li class="empty">No hay pagos pendientes.</li>';
      return;
    }

    settleList.innerHTML = payments.map(function (payment) {
      return '<li class="item">' +
        '<div class="item__main">' + esc(memberName(data, payment.from)) + ' paga <strong>' + esc(euros(payment.amount)) +
        '</strong> a ' + esc(memberName(data, payment.to)) + '</div>' +
        '<div class="item__actions">' +
          '<button type="button" class="btn btn--ghost btn--small" data-action="settle" data-from="' + esc(payment.from) +
          '" data-to="' + esc(payment.to) + '" data-amount="' + payment.amount + '">Registrar pago</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function render() {
    var trip = currentTrip();
    var data = trip ? (getData(trip.id, false) || emptyData()) : emptyData();
    renderMembers(data, trip);
    renderForm(data);
    renderExpenses(data);
    renderBalances(data);
  }

  /* ---------- Eventos ---------- */
  function requireTrip() {
    var trip = currentTrip();
    if (!trip) { api.toast('Primero crea un viaje en la pestaña Inicio.'); }
    return trip;
  }

  $('memberForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var trip = requireTrip();
    if (!trip) { return; }

    var name = $('memberName').value.trim().slice(0, 30);
    if (!name) { return; }

    var data = getData(trip.id, true);
    var duplicate = data.members.some(function (member) { return normalize(member.name) === normalize(name); });
    if (duplicate) {
      api.toast('Ya hay un compañero con ese nombre.');
      return;
    }

    data.members.push({ id: uid(), name: name });
    api.save();
    event.target.reset();
    render();
    $('memberName').focus();
  });

  $('memberList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action="remove-member"]');
    var trip = currentTrip();
    if (!button || !trip) { return; }

    var data = getData(trip.id, false);
    if (!data) { return; }
    var id = button.dataset.id;

    if (memberInUse(data, id)) {
      api.toast('Esa persona tiene gastos asociados. Elimina antes esos gastos.');
      return;
    }

    data.members = data.members.filter(function (member) { return member.id !== id; });
    delete uncheckedIds[id];
    api.save();
    render();
  });

  $('expenseSplit').addEventListener('change', function (event) {
    var box = event.target;
    if (!box || box.type !== 'checkbox') { return; }
    if (box.checked) { delete uncheckedIds[box.value]; } else { uncheckedIds[box.value] = true; }
  });

  $('expenseForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var trip = requireTrip();
    if (!trip) { return; }

    var data = getData(trip.id, true);
    if (data.members.length < 2) {
      api.toast('Añade al menos dos compañeros.');
      return;
    }

    var amount = Math.round(parseFloat($('expenseAmount').value) * 100);
    if (isNaN(amount) || amount <= 0) {
      api.toast('El importe debe ser mayor que cero.');
      return;
    }

    var payerId = $('expensePayer').value;
    var splitIds = Array.prototype.map.call(
      $('expenseSplit').querySelectorAll('input[type="checkbox"]:checked'),
      function (box) { return box.value; }
    );

    if (!payerId || !splitIds.length) {
      api.toast('Elige quién pagó y entre quién se reparte.');
      return;
    }

    data.items.push({
      id: uid(),
      title: $('expenseTitle').value.trim().slice(0, 80),
      amount: amount,
      payerId: payerId,
      splitIds: splitIds,
      createdAt: new Date().toISOString(),
      settlement: false
    });

    api.save();
    uncheckedIds = {};
    event.target.reset();
    render();
    api.toast('Gasto registrado.');
  });

  $('expenseList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action="delete-expense"]');
    var trip = currentTrip();
    if (!button || !trip) { return; }

    var data = getData(trip.id, false);
    if (!data) { return; }
    var id = button.dataset.id;
    var item = data.items.filter(function (entry) { return entry.id === id; })[0];
    if (!item) { return; }

    if (window.confirm('¿Eliminar "' + item.title + '"?')) {
      data.items = data.items.filter(function (entry) { return entry.id !== id; });
      api.save();
      render();
      api.toast('Gasto eliminado.');
    }
  });

  $('settleList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action="settle"]');
    var trip = currentTrip();
    if (!button || !trip) { return; }

    var data = getData(trip.id, false);
    if (!data) { return; }

    var from = button.dataset.from;
    var to = button.dataset.to;
    var amount = parseInt(button.dataset.amount, 10);
    if (!from || !to || isNaN(amount) || amount <= 0) { return; }

    data.items.push({
      id: uid(),
      title: 'Pago: ' + memberName(data, from) + ' → ' + memberName(data, to),
      amount: amount,
      payerId: from,
      splitIds: [to],
      createdAt: new Date().toISOString(),
      settlement: true
    });

    api.save();
    render();
    api.toast('Pago registrado.');
  });

  document.addEventListener('tripchange', function () {
    uncheckedIds = {};
    cleanupOrphans();
    render();
  });

  /* ---------- Arranque ---------- */
  cleanupOrphans();
  render();
})();
