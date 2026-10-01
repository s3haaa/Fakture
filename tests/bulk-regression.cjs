const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/js/app.js'), 'utf8');
const selectionCode = source.slice(source.lastIndexOf('activateInlineBulk=function(route){'), source.indexOf('\nfunction clientChoices'));
const proformaCode = fs.readFileSync(path.join(__dirname, '../app/js/proformas.js'), 'utf8').split('// Reuse the shared table selection and confirmation workflow.')[1];

function fixture(route, records, visible) {
  const cells = [], checks = [], messages = [], menu = { remove() { this.visible = false; } };
  const classes = () => ({ values: new Set(), add(x) { this.values.add(x); }, remove(...xs) { xs.forEach(x => this.values.delete(x)); }, toggle(x, on) { on ? this.add(x) : this.remove(x); } });
  function row(data) {
    return { dataset: data, classList: classes(), hasAttribute: name => name === 'data-bulk-key' && data.bulkKey !== undefined,
      querySelector: () => ({ textContent: data.label || 'Duplicate name' }),
      insertAdjacentHTML(_, html) {
        const match = html.match(/value="([^"]*)"/);
        const check = match && { value: match[1], checked: false, closest: () => this };
        if (check) checks.push(check);
        cells.push({ owner: this, remove() { cells.splice(cells.indexOf(this), 1); if (check) checks.splice(checks.indexOf(check), 1); } });
      }
    };
  }
  const rows = visible.map(row), header = row({});
  const table = { classList: classes(), querySelector: sel => sel === 'thead tr' ? header : checks[0], querySelectorAll: () => rows };
  const count = {};
  const context = vm.createContext({
    inlineBulkRoute: '', esc: String, toast: x => messages.push(x),
    inlineBulkConfig: () => ({ read: () => records, key: (item, i) => route === 'offers' ? String(item.id) : String(i), label: x => x.name || x.number }),
    inlineBulkRowLabel: (_, row) => row.dataset.label || 'Duplicate name', inlineBulkActions: () => '', applyInlineBulk: () => {},
    getProformas: () => records, saveProformas: next => { records = next; }, renderProformas: () => {},
    confirmDestructive: (_, __, apply) => { context.confirm = apply; },
    $: id => id === 'viewContainer' ? { querySelector: () => table, querySelectorAll: () => rows } : id === 'bulkFloatingMenu' ? menu : count,
    document: { body: { insertAdjacentHTML() { menu.visible = true; } }, querySelectorAll: selector => {
      if (selector === '.inline-bulk-check') return checks;
      if (selector === '.inline-bulk-check:checked') return checks.filter(x => x.checked);
      if (selector === '.bulk-select-cell,.bulk-card-select') return [...cells];
      return [table, ...rows];
    } }
  });
  vm.runInContext(selectionCode, context);
  if (route === 'proformas') vm.runInContext(proformaCode, context);
  return { context, rows, checks, cells, table, menu, messages, records: () => records, activate: () => context.activateInlineBulk(route) };
}

// Offer numbers are buttons, not strong elements; use the stable row ID.
const offerRecords = [1, 2, 3, 4].map(id => ({ id, number: `P-${id}` }));
const offers = fixture('offers', offerRecords, [4, 2, 1, 3].map(id => ({ offerId: String(id) })));
offers.activate();
assert.deepEqual(offers.checks.map(x => x.value), ['4', '2', '1', '3']);
assert.equal(offers.menu.visible, true);
assert.equal(offers.messages.length, 0);
offers.activate();
assert.equal(offers.checks.length, 0);
offers.activate();
assert.equal(offers.checks.length, 4);
const filteredOffers = fixture('offers', offerRecords, [{ offerId: '2' }]);
filteredOffers.activate();
assert.deepEqual(filteredOffers.checks.map(x => x.value), ['2']);

// Identical descriptions and reordered/filtered expenses must select by ID.
const expenses = fixture('expenses', [{ id: 'a', name: 'Duplicate name' }, { id: 'b', name: 'Duplicate name' }], [{ bulkKey: 'b' }, { bulkKey: 'a' }]);
expenses.activate();
assert.deepEqual(expenses.checks.map(x => x.value), ['1', '0']);
assert.equal(expenses.cells.length, 3);
expenses.activate();
assert.equal(expenses.cells.length, 0);
assert.equal(expenses.table.classList.values.has('bulk-mode'), false);
expenses.activate();
assert.equal(expenses.checks.length, 2);

// Mixed app documents and attachments retain a cell in every row, but only attachments can be selected.
const documents = fixture('documents', [{ name: 'Duplicate name' }, { name: 'Duplicate name' }], [{}, { bulkKey: '1' }, { bulkKey: '0' }]);
documents.activate();
assert.equal(documents.cells.length, 4);
assert.deepEqual(documents.checks.map(x => x.value), ['1', '0']);
const filtered = fixture('documents', [{ name: 'Hidden attachment' }], [{}]);
filtered.activate();
assert.equal(filtered.cells.length, 0);
assert.equal(filtered.menu.visible, false);

// Proforma actions reuse selection while protecting converted records and non-draft deletion.
const proformas = fixture('proformas', [
  { id: 'd', number: 'PF-1', status: 'draft' },
  { id: 's', number: 'PF-2', status: 'sent' },
  { id: 'c', number: 'PF-3', status: 'converted', invoiceId: 'invoice-1' }
], [{ proformaId: 'd' }, { proformaId: 's' }, { proformaId: 'c' }]);
proformas.activate();
assert.deepEqual(proformas.checks.map(x => x.value), ['d', 's']);
proformas.checks.forEach(x => x.checked = true);
proformas.context.applyInlineBulk('delete');
assert.equal(proformas.records().length, 3, 'Deletion requires confirmation');
proformas.context.confirm();
assert.deepEqual(proformas.records().map(x => x.id), ['s', 'c']);
proformas.activate();
proformas.checks[0].checked = true;
proformas.context.applyInlineBulk('accepted');
assert.equal(proformas.records()[0].status, 'accepted');
assert.equal(proformas.records()[1].status, 'converted');
assert.equal(proformas.records()[1].invoiceId, 'invoice-1');
console.log('PASS: duplicate descriptions, mixed rows, repeated toggles, empty filter, proforma confirmation and protected records');
