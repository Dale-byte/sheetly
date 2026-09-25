const CONSTANTS = {
  DB_NAME: 'SheetlyDB',
  DB_VERSION: 1,
  STORAGE_KEY: 'sheetly_data',
  SCHEMA_VERSION: 1
};

const generateId = () => {
  try {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
  } catch (e) {
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2);
  }
};

const formatCurrency = (amount, symbol = null) => {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const sym = symbol || appState.settings.currencySymbol || 'R';
  const decimals = appState.settings.showCents !== false ? 2 : 0;
  return `${sym}${num.toLocaleString('en-ZA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

const formatDate = (isoString) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
};

// XSS safety helpers. All user-provided text (item names, note titles, tags,
// subsection names, template names, category names, etc.) MUST pass through
// esc() before being embedded in an HTML template literal, and through jsAttr()
// when embedded inside an on* attribute's JS string.
const esc = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
const jsAttr = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/&/g, '\\x26')
    .replace(/"/g, '&quot;');
};

let db = null;
let appState = {
  settings: { currencySymbol: 'R', theme: 'light', defaultView: 'dashboard', defaultTemplate: '', sheetFormat: 'month-year', showCents: true, backupReminder: false, grossIncome: 0, deductions: 0, schemaVersion: CONSTANTS.SCHEMA_VERSION },
  sheets: [],
  groups: [],
  items: [],
  recurringItems: [],
  categories: [],
  templates: [],
  tags: [],
  debts: [],
  payslips: [],
  currentSheetId: null,
  activeView: 'dashboard'
};

const DEFAULT_GROUPS = [
  { name: 'Expenses', type: 'section', parentId: null, sortOrder: 0 },
  { name: 'Debit orders', type: 'subsection', parentId: null, sortOrder: 1 },
  { name: 'Costs', type: 'subsection', parentId: null, sortOrder: 2 },
  { name: 'Variable', type: 'subsection', parentId: null, sortOrder: 3 },
  { name: 'New payments', type: 'subsection', parentId: null, sortOrder: 4 },
  { name: 'Current Buffer', type: 'summary', parentId: null, sortOrder: 5 },
  { name: 'Total Buffer', type: 'summary', parentId: null, sortOrder: 6 },
  { name: 'Recurring', type: 'recurring', parentId: null, sortOrder: 7 }
];

const DEFAULT_ITEMS = [
  { groupName: 'Current Buffer', name: 'Current Buffer', amountTotal: 5000, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Debit orders', name: 'Home Loan', amountTotal: 1800, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Debit orders', name: 'Car Finance', amountTotal: 850, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Debit orders', name: 'Life Insurance', amountTotal: 250, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Debit orders', name: 'Capitec Savings', amountTotal: 0, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Costs', name: 'Rates & Taxes', amountTotal: 350, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Costs', name: 'Electricity', amountTotal: 200, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Costs', name: 'Water', amountTotal: 120, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Costs', name: 'Internet', amountTotal: 400, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Costs', name: 'Security', amountTotal: 300, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Variable', name: 'Groceries', amountTotal: 1200, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Variable', name: 'Fuel', amountTotal: 600, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'Variable', name: 'Entertainment', amountTotal: 300, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'New payments', name: 'New Item 1', amountTotal: 0, amountBreakdown: '', itemType: 'normal', active: true },
  { groupName: 'New payments', name: 'New Item 2', amountTotal: 0, amountBreakdown: '', itemType: 'normal', active: true }
];

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONSTANTS.DB_NAME, CONSTANTS.DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('sheets')) {
        database.createObjectStore('sheets', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('groups')) {
        database.createObjectStore('groups', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('items')) {
        database.createObjectStore('items', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('recurring')) {
        database.createObjectStore('recurring', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('categories')) {
        database.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('templates')) {
        database.createObjectStore('templates', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('tags')) {
        database.createObjectStore('tags', { keyPath: 'id' });
      }
    };
  });
};

const saveToDB = async (storeName, data) => {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllFromDB = async (storeName) => {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const deleteFromDB = async (storeName, id) => {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const clearDB = async () => {
  if (!db) await openDB();
  const stores = ['settings', 'sheets', 'groups', 'items', 'recurring', 'categories', 'templates', 'tags'];
  for (const storeName of stores) {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

const fallbackToLocalStorage = () => {
  try {
    const data = localStorage.getItem(CONSTANTS.STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      appState = { ...appState, ...parsed };
      return true;
    }
  } catch (e) {
    console.error('localStorage fallback failed', e);
  }
  return false;
};

const saveToLocalStorage = () => {
  try {
    localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify({
      settings: appState.settings,
      sheets: appState.sheets,
      groups: appState.groups,
      items: appState.items,
      recurringItems: appState.recurringItems,
      categories: appState.categories,
      templates: appState.templates,
      tags: appState.tags,
      debts: appState.debts || [],
      payslips: appState.payslips || [],
      currentSheetId: appState.currentSheetId
    }));
  } catch (e) {}
};

const loadData = async () => {
  // Try localStorage first
  var data = localStorage.getItem(CONSTANTS.STORAGE_KEY);
  if (data) {
    try {
      var parsed = JSON.parse(data);
      if (parsed.sheets && parsed.sheets.length > 0) {
        appState = { ...appState, ...parsed };
        if (appState.groups) {
          var hasTotalBuffer = false;
          for (var i = 0; i < appState.groups.length; i++) {
            if (appState.groups[i].name === 'Total Buffer') hasTotalBuffer = true;
          }
          var newGroups = [];
          for (var i = 0; i < appState.groups.length; i++) {
            var g = appState.groups[i];
            if (g.name === 'New Buffer' || g.name === 'Total (Buffer/Variable)') {
              if (!hasTotalBuffer) {
                g.name = 'Total Buffer';
                hasTotalBuffer = true;
                newGroups.push(g);
              }
            } else {
              newGroups.push(g);
            }
          }
          appState.groups = newGroups;
        }
        
        // Deduplicate items: keep only first item per groupId+name combo
        if (appState.items && appState.items.length > 0) {
          var seen = {};
          var uniqueItems = [];
          for (var i = 0; i < appState.items.length; i++) {
            var it = appState.items[i];
            var key = it.groupId + '|' + it.name;
            if (!seen[key]) {
              seen[key] = true;
              uniqueItems.push(it);
            }
          }
          appState.items = uniqueItems;
        }
        if (!appState.currentSheetId || !appState.sheets.some(s => s.id === appState.currentSheetId)) {
          appState.currentSheetId = appState.sheets[0].id;
        }
        console.log('Loaded from localStorage');
        return;
      }
    } catch (e) {
      console.log('localStorage error', e);
    }
  }
  
  // Try IndexedDB
  try {
    await openDB();
    var settings = await getAllFromDB('settings');
    var sheets = await getAllFromDB('sheets');
    var groups = await getAllFromDB('groups');
    var items = await getAllFromDB('items');
    var recurringItems = await getAllFromDB('recurring');
    var categories = await getAllFromDB('categories');
    var templates = await getAllFromDB('templates');
    var tags = await getAllFromDB('tags');
    
    if (settings.length > 0) appState.settings = settings[0];
    appState.sheets = sheets || [];
    appState.groups = groups || [];
    appState.items = items || [];
    appState.recurringItems = recurringItems || [];
    appState.categories = categories || [];
    appState.templates = templates || [];
    appState.tags = tags || [];
    
    if (appState.groups.length > 0) {
      var hasTotalBuffer = false;
      for (var i = 0; i < appState.groups.length; i++) {
        if (appState.groups[i].name === 'Total Buffer') hasTotalBuffer = true;
      }
      // Rename first occurrence, remove others
      var newGroups = [];
      for (var i = 0; i < appState.groups.length; i++) {
        var g = appState.groups[i];
        if (g.name === 'New Buffer' || g.name === 'Total (Buffer/Variable)') {
          if (!hasTotalBuffer) {
            g.name = 'Total Buffer';
            hasTotalBuffer = true;
            newGroups.push(g);
          }
        } else {
          newGroups.push(g);
        }
      }
      appState.groups = newGroups;
    }
    
    // Deduplicate items from IndexedDB
    if (appState.items && appState.items.length > 0) {
      var seen = {};
      var uniqueItems = [];
      for (var i = 0; i < appState.items.length; i++) {
        var it = appState.items[i];
        var key = it.groupId + '|' + it.name;
        if (!seen[key]) {
          seen[key] = true;
          uniqueItems.push(it);
        }
      }
      appState.items = uniqueItems;
    }
    
    if (appState.sheets.length > 0) {
      if (!appState.currentSheetId || !appState.sheets.some(s => s.id === appState.currentSheetId)) {
        appState.currentSheetId = appState.sheets[0].id;
      }
    } else {
      await createDefaultData();
    }
  } catch (e) {
    console.log('IndexedDB error', e);
    await createDefaultData();
  }
};

const saveData = async () => {
  // Always save to localStorage first as reliable backup
  saveToLocalStorage();
  
  // Then try IndexedDB
  try {
    await saveToDB('settings', { ...appState.settings, id: appState.settings.id || 'default' });
    for (const sheet of appState.sheets) {
      await saveToDB('sheets', sheet);
    }
    for (const group of appState.groups) {
      await saveToDB('groups', group);
    }
    for (const item of appState.items) {
      await saveToDB('items', item);
    }
    for (const ri of appState.recurringItems) {
      await saveToDB('recurring', ri);
    }
    for (const category of appState.categories) {
      await saveToDB('categories', category);
    }
    for (const template of appState.templates) {
      await saveToDB('templates', template);
    }
    for (const tag of appState.tags) {
      await saveToDB('tags', tag);
    }
  } catch (e) {
    console.error('IndexedDB save failed, data saved to localStorage only', e);
  }
};

const calculateTotals = (sheetId) => {
  const sheetItems = appState.items.filter(i => i.sheetId === sheetId && i.active);
  const groups = appState.groups.filter(g => g.sheetId === sheetId);
  
  const grossIncome = appState.settings.grossIncome || 0;
  const deductions = appState.settings.deductions || 0;
  const nettIncome = grossIncome - deductions;
  
  const totals = {
    grossIncome,
    deductions,
    nettIncome,
    subsections: {}
  };
  
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i];
    var groupItems = sheetItems.filter(function(item) { return item.groupId === group.id && item.active; });
    var sum = 0;
    for (var j = 0; j < groupItems.length; j++) {
      sum += groupItems[j].amountTotal || 0;
    }
    
    if (group.type === 'subsection') {
      totals.subsections[group.name] = sum;
    }
  }
  
  const variable = totals.subsections['Variable'] || 0;
  
  totals.totalExpenses = Object.values(totals.subsections).reduce(function(a, b) { return a + b; }, 0);
  totals.currentBuffer = nettIncome - totals.totalExpenses;
  
  var capitecSavings = 0;
  for (var ci = 0; ci < sheetItems.length; ci++) {
    if (sheetItems[ci].name === 'Capitec Savings' && sheetItems[ci].active) {
      capitecSavings = sheetItems[ci].amountTotal || 0;
      break;
    }
  }
  totals.capitecSavings = capitecSavings;
  totals.totalBuffer = totals.currentBuffer + capitecSavings + variable;
  
  return totals;
};

const createDefaultData = async () => {
  const sheetId = generateId();
  const now = new Date().toISOString();
  
  const sheet = {
    id: sheetId,
    name: 'Monthly Budget',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    templateId: null,
    notes: '',
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  
  appState.sheets.push(sheet);
  appState.currentSheetId = sheetId;
  
  const groupIdMap = {};
  for (const dg of DEFAULT_GROUPS) {
    const group = {
      id: generateId(),
      sheetId,
      name: dg.name,
      type: dg.type,
      parentId: null,
      sortOrder: dg.sortOrder,
      active: true
    };
    appState.groups.push(group);
    groupIdMap[dg.name] = group.id;
  }
  
  for (const di of DEFAULT_ITEMS) {
    const item = {
      id: generateId(),
      sheetId,
      groupId: groupIdMap[di.groupName],
      name: di.name,
      amountTotal: di.amountTotal,
      amountBreakdown: di.amountBreakdown,
      itemType: di.itemType,
      formulaKey: null,
      active: di.active,
      notes: '',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    };
    appState.items.push(item);
  }
  
  const template = {
    id: generateId(),
    name: 'Default Budget',
    description: 'Standard monthly budget template',
    groups: DEFAULT_GROUPS.map(g => ({ ...g })),
    items: DEFAULT_ITEMS.map(i => ({ ...i })),
    createdAt: now,
    updatedAt: now
  };
  appState.templates.push(template);
  
  await saveData();
};

const showHelpTooltip = function(elem, text) {
  var existing = document.querySelector('.tooltip-popup');
  if (existing) existing.remove();
  
  var tooltip = document.createElement('div');
  tooltip.className = 'tooltip-popup';
  tooltip.textContent = text;
  tooltip.style.cssText = 'position:absolute;background:#333;color:#fff;padding:8px 12px;border-radius:4px;font-size:12px;z-index:1000;max-width:250px;white-space:nowrap;';
  
  var rect = elem.getBoundingClientRect();
  tooltip.style.left = (rect.left + window.scrollX) + 'px';
  tooltip.style.top = (rect.bottom + window.scrollY + 5) + 'px';
  
  document.body.appendChild(tooltip);
  
  setTimeout(function() {
    tooltip.addEventListener('click', function() { tooltip.remove(); });
    document.addEventListener('click', function handler(e) {
      if (!tooltip.contains(e.target) && e.target !== elem) {
        tooltip.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
};

window.showHelpTooltip = showHelpTooltip;

const showToast = (message, duration = 3000) => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), duration);
};

const toggleDropdown = (e, id) => {
  e.preventDefault();
  e.stopPropagation();
  var dropdown = document.getElementById(id);
  if (dropdown.classList.contains('show')) {
    dropdown.classList.remove('show');
  } else {
    document.querySelectorAll('.dropdown-menu').forEach(function(d) { d.classList.remove('show'); });
    dropdown.classList.add('show');
  }
};

const handleDropdownClick = (e, callback) => {
  e.preventDefault();
  hideDropdowns();
  callback();
  return false;
};

const hideDropdowns = () => {
  document.querySelectorAll('.dropdown-menu').forEach(function(d) { d.classList.remove('show'); });
};

window.toggleDropdown = toggleDropdown;
window.hideDropdowns = hideDropdowns;
window.handleDropdownClick = handleDropdownClick;

const showModal = (title, bodyHtml, footerHtml, wide = false) => {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal').classList.toggle('wide', wide);
  document.getElementById('modal-overlay').classList.remove('hidden');
};

const hideModal = () => {
  document.getElementById('modal-overlay').classList.add('hidden');
};

const navigate = (view) => {
  appState.activeView = view;
  window.location.hash = view;
  renderCurrentView();
};

const renderCurrentView = () => {
  const view = appState.activeView;
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === view);
  });
  document.getElementById('breadcrumb').textContent = view.charAt(0).toUpperCase() + view.slice(1).replace('-', ' ');
  
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'budget-sheet': renderBudgetSheet(); break;
    case 'debts': renderDebts(); break;
    case 'payslip': renderPayslip(); break;
    case 'categories': renderNotes(); break;
    case 'templates': renderTemplates(); break;
    case 'settings': renderSettings(); break;
    case 'help': renderHelp(); break;
    default: renderDashboard();
  }
};

const renderDashboard = () => {
  const container = document.getElementById('view-container');
  const sheet = appState.sheets.find(s => s.id === appState.currentSheetId);
  const totals = calculateTotals(appState.currentSheetId);
  const groups = appState.groups.filter(g => g.sheetId === appState.currentSheetId);
  const symbol = appState.settings.currencySymbol;
  const settings = appState.settings;
  
  const grossIncome = settings.grossIncome || 0;
  const deductions = settings.deductions || 0;
  const nettIncome = grossIncome - deductions;
  const totalExpenses = totals.totalExpenses;
  const netCash = nettIncome - totalExpenses;
  
  let topActions = `<button class="btn btn-primary" onclick="navigate('budget-sheet')">Edit Budget</button>`;
  topActions += `<button class="btn btn-secondary" onclick="exportData()">Export</button>`;
  document.getElementById('top-actions').innerHTML = topActions;
  
  const largestGroup = Object.entries(totals.subsections).sort((a, b) => b[1] - a[1])[0];
  
  container.innerHTML = `
    <h1>Dashboard</h1>
    
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Income</h2>
      </div>
      <div class="summary-grid income-summary-grid">
        <div class="summary-card">
          <div class="summary-card-label">Gross Income</div>
          <div class="summary-card-value">${formatCurrency(grossIncome, symbol)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">Deductions</div>
          <div class="summary-card-value negative">-${formatCurrency(deductions, symbol)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">Nett Income</div>
          <div class="summary-card-value positive">${formatCurrency(nettIncome, symbol)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">Total Expenses</div>
          <div class="summary-card-value">${formatCurrency(totalExpenses, symbol)}</div>
        </div>
      </div>
      <div class="mt-md" style="padding-top:var(--spacing-md);border-top:1px solid var(--color-border);">
        <div class="flex-between">
          <span><strong>Net Cash (Nett - Expenses)</strong></span>
          <span class="summary-card-value ${netCash >= 0 ? 'positive' : 'negative'}">${formatCurrency(netCash, symbol)}</span>
        </div>
      </div>
    </div>
    
    <div class="card mt-md">
      <div class="card-header">
        <h2 class="card-title">Budget Summary</h2>
      </div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-card-label">Current Buffer (remaining) <span class="help-icon" onclick="showHelpTooltip(this, 'Nett Income - Total Expenses')">?</span></div>
          <div class="summary-card-value ${totals.currentBuffer >= 0 ? 'positive' : 'negative'}">${formatCurrency(totals.currentBuffer, symbol)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-label">Total Buffer <span class="help-icon" onclick="showHelpTooltip(this, 'Current Buffer + Capitec Savings + Variable')">?</span></div>
          <div class="summary-card-value ${totals.totalBuffer >= 0 ? 'positive' : 'negative'}">${formatCurrency(totals.totalBuffer, symbol)}</div>
        </div>
      </div>
    </div>

    ${(() => {
      const debts = Array.isArray(appState.debts) ? appState.debts : [];
      const totalBalance = debts.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
      const totalLimit = debts.reduce((s, d) => s + (parseFloat(d.limit) || 0), 0);
      const totalMin = debts.reduce((s, d) => s + (parseFloat(d.minPayment) || 0), 0);
      const totalPaid = debts.reduce((s, d) => s + (d.payments || []).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0), 0);
      const util = totalLimit > 0 ? Math.min(100, (totalBalance / totalLimit) * 100) : 0;
      const highest = debts.slice().sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0))[0];
      return `
      <div class="card mt-md">
        <div class="card-header">
          <h2 class="card-title">Debts</h2>
          <button class="btn btn-secondary" onclick="navigate('debts')">Manage</button>
        </div>
        ${debts.length === 0 ? `
          <div style="color:var(--text-muted,#666)">No debts tracked yet. <a href="#debts" onclick="navigate('debts');return false;">Add one</a> to see it here.</div>
        ` : `
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-card-label">Total Balance</div>
              <div class="summary-card-value negative">${formatCurrency(totalBalance, symbol)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-card-label">Total Credit Limit</div>
              <div class="summary-card-value">${formatCurrency(totalLimit, symbol)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-card-label">Minimum Due</div>
              <div class="summary-card-value">${formatCurrency(totalMin, symbol)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-card-label">Total Paid</div>
              <div class="summary-card-value positive">${formatCurrency(totalPaid, symbol)}</div>
            </div>
          </div>
          ${totalLimit > 0 ? `
            <div class="mt-md">
              <div class="flex-between" style="margin-bottom:6px"><span>Overall utilisation</span><span><strong>${util.toFixed(1)}%</strong></span></div>
              <div style="background:var(--color-border);height:8px;border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${util}%;background:${util > 80 ? '#dc2626' : util > 50 ? '#f59e0b' : '#10b981'}"></div>
              </div>
            </div>
          ` : ''}
          ${highest ? `<div class="mt-md"><strong>Largest debt:</strong> ${esc(highest.name || 'Unnamed')} (${formatCurrency(parseFloat(highest.balance) || 0, symbol)})</div>` : ''}
        `}
      </div>`;
    })()}

    
    <div class="card mt-md">
      <div class="card-header">
        <h2 class="card-title">Subsection Breakdown</h2>
      </div>
      <div class="summary-grid">
        ${Object.entries(totals.subsections).map(([name, value]) => `
          <div class="summary-card">
            <div class="summary-card-label">${esc(name)}</div>
            <div class="summary-card-value">${formatCurrency(value, symbol)}</div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div class="card mt-md">
      <div class="card-header">
        <h2 class="card-title">Insights</h2>
      </div>
      <div>${largestGroup ? `<div><strong>Largest category:</strong> ${esc(largestGroup[0])} (${formatCurrency(largestGroup[1], symbol)})</div>` : '<div>No data</div>'}</div>
      <div class="mt-md"><strong>Savings:</strong> ${formatCurrency(netCash, symbol)}</div>
    </div>
  `;
};

const editIncomePrompt = () => {
  const settings = appState.settings;
  showModal('Edit Income', `
    <div class="form-group">
      <label class="form-label">Gross Income</label>
      <input type="number" class="form-input currency" id="gross-income" value="${settings.grossIncome || 0}">
    </div>
    <div class="form-group">
      <label class="form-label">Deductions (PAYE, UIF, etc)</label>
      <input type="number" class="form-input currency" id="deductions" value="${settings.deductions || 0}">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmEditIncome()">Save</button>`);
};

const confirmEditIncome = () => {
  const grossIncome = parseFloat(document.getElementById('gross-income').value) || 0;
  const deductions = parseFloat(document.getElementById('deductions').value) || 0;
  appState.settings.grossIncome = grossIncome;
  appState.settings.deductions = deductions;
  saveData();
  hideModal();
  if (appState.activeView === 'budget-sheet') {
    renderBudgetSheet();
  } else {
    renderDashboard();
  }
  showToast('Income updated');
};

window.editIncomePrompt = editIncomePrompt;
window.confirmEditIncome = confirmEditIncome;

const renderBudgetSheet = () => {
  const container = document.getElementById('view-container');
  const sheet = appState.sheets.find(s => s.id === appState.currentSheetId);
  const groups = appState.groups.filter(g => g.sheetId === appState.currentSheetId).sort((a, b) => a.sortOrder - b.sortOrder);
  const items = appState.items.filter(i => i.sheetId === appState.currentSheetId);
  const symbol = appState.settings.currencySymbol;
  const totals = calculateTotals(appState.currentSheetId);
  
  let topActions = `<div class="dropdown">
    <button class="btn btn-secondary dropdown-toggle" onclick="toggleDropdown(event, 'add-dropdown')">Add &#9662;</button>
    <div class="dropdown-menu" id="add-dropdown">
      <a href="#" onclick="return handleDropdownClick(event, function() { addItemPrompt(); })">Add Item</a>
      <a href="#" onclick="return handleDropdownClick(event, function() { addSubsectionPrompt(); })">Add Subsection</a>
      <a href="#" onclick="return handleDropdownClick(event, function() { duplicateSheet(); })">Duplicate Sheet</a>
    </div>
  </div>`;
  topActions += `<div class="dropdown">
    <button class="btn btn-secondary dropdown-toggle" onclick="toggleDropdown(event, 'export-dropdown')">Export &#9662;</button>
    <div class="dropdown-menu" id="export-dropdown">
      <a href="#" onclick="return handleDropdownClick(event, function() { exportToExcel(); })">Excel</a>
      <a href="#" onclick="return handleDropdownClick(event, function() { exportToPDF(); })">PDF</a>
    </div>
  </div>`;
  topActions += `<button class="btn btn-primary" onclick="saveCurrentAsTemplate()">Save as Template</button>`;
  document.getElementById('top-actions').innerHTML = topActions;
  
  let html = `<h1>Budget Sheet</h1>`;
  html += `<p class="mb-md"><strong>${esc(sheet ? sheet.name : 'Untitled')}</strong> - ${sheet ? esc(sheet.month + '/' + sheet.year) : ''}</p>`;
  
  const grossIncome = appState.settings.grossIncome || 0;
  const deductions = appState.settings.deductions || 0;
  const nettIncome = grossIncome - deductions;
  html += `<div class="card mb-md">
    <div class="flex-between">
      <div>
        <span style="color:var(--color-text-muted);">Gross:</span> <strong>${formatCurrency(grossIncome, symbol)}</strong>
        <span style="margin-left:var(--spacing-md);color:var(--color-text-muted);">Deductions:</span> <span class="negative">-${formatCurrency(deductions, symbol)}</span>
        <span style="margin-left:var(--spacing-md);color:var(--color-text-muted);">Nett:</span> <strong class="positive">${formatCurrency(nettIncome, symbol)}</strong>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="editIncomePrompt()">Edit Income</button>
    </div>
  </div>`;
  html += `<div class="card mb-md">
    <div class="flex-between">
      <span><strong>Total Expenses</strong></span>
      <span class="summary-card-value negative">${formatCurrency(totals.totalExpenses, symbol)}</span>
    </div>
  </div>`;
  html += `<div class="table-container card"><table class="data-table budget-table" id="budget-table"><thead><tr><th>Item</th><th>Amount</th><th>Breakdown</th><th></th></tr></thead><tbody>`;
  
  let currentSection = '';
  
  for (var gi = 0; gi < groups.length; gi++) {
    var group = groups[gi];
    var groupItems = [];
    var groupTotal = 0;
    for (var ii = 0; ii < items.length; ii++) {
      if (items[ii].groupId === group.id) {
        groupItems.push(items[ii]);
        if (items[ii].active) {
          groupTotal += items[ii].amountTotal || 0;
        }
      }
    }
    
    if (group.type === 'section') {
      if (currentSection) html += `</tbody></table></div>`;
      html += `<div class="card mt-md table-container"><table class="data-table budget-table"><thead><tr><th>${esc(group.name)}</th><th></th><th></th><th></th></tr></thead><tbody>`;
      currentSection = group.name;
    } else if (group.type === 'subsection') {
      html += `<tr class="subsection-header"><td>${esc(group.name)}</td><td class="numeric">${formatCurrency(groupTotal, symbol)}</td><td></td><td class="row-actions"><button class="btn btn-ghost btn-sm" onclick="addItemToGroup('${esc(group.id)}')" title="Add Item">+</button><button class="btn btn-ghost btn-sm" onclick="renameSubsection('${esc(group.id)}')" title="Rename">✎</button><button class="btn btn-ghost btn-sm" onclick="deleteSubsection('${esc(group.id)}')" title="Delete">×</button></td></tr>`;
      for (var li = 0; li < groupItems.length; li++) {
        var item = groupItems[li];
        var activeClass = item.active ? '' : 'inactive';
        html += `<tr class="${activeClass}" data-item-id="${esc(item.id)}">
          <td><input type="text" class="form-input" value="${esc(item.name)}" onchange="updateItemName('${esc(item.id)}', this.value)" style="border:none;background:transparent;width:100%;"></td>
          <td class="numeric"><input type="number" class="form-input currency" value="${esc(item.amountTotal)}" onchange="updateItemAmount('${esc(item.id)}', this.value)" style="width:120px;"></td>
          <td><input type="text" class="form-input" value="${esc(item.amountBreakdown || '')}" onchange="updateItemBreakdown('${esc(item.id)}', this.value)" placeholder="Breakdown..." style="border:none;background:transparent;width:100%;"></td>
          <td class="row-actions">
            <button class="btn btn-ghost btn-sm" onclick="toggleItemActive('${esc(item.id)}')" title="${item.active ? 'Deactivate' : 'Activate'}">${item.active ? '●' : '○'}</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteItem('${esc(item.id)}')" title="Delete">×</button>
          </td>
        </tr>`;
      }
    } else if (group.type === 'summary') {
      var calcValue = 0;
      var label = group.name;
      var helpText = '';
      if (group.name === 'Current Buffer') {
        calcValue = totals.currentBuffer;
        label = 'Current Buffer (remaining)';
        helpText = 'Nett Income - Total Expenses';
      } else if (group.name === 'Total Buffer') {
        calcValue = totals.totalBuffer;
        helpText = 'Current Buffer + Capitec Savings + Variable';
      }
      
      if (calcValue !== undefined) {
        html += `<tr class="calculated">
          <td>${esc(label)} <span class="help-icon" onclick="showHelpTooltip(this, '${jsAttr(helpText)}')">?</span></td>
          <td class="numeric">${formatCurrency(calcValue, symbol)}</td>
          <td></td>
          <td></td>
        </tr>`;
      }
    }
  }
  
  html += `</tbody></table></div>`;
  
  container.innerHTML = html;
};

const formatTime = (isoString) => {
  if (!isoString) return '';
  return isoString.substring(0, 16).replace('T', ' ');
};

const addItemToGroup = (groupId) => {
  const group = appState.groups.find(g => g.id === groupId);
  const now = new Date().toISOString();
  const item = {
    id: generateId(),
    sheetId: appState.currentSheetId,
    groupId,
    name: 'New Item',
    amountTotal: 0,
    amountBreakdown: '',
    itemType: 'normal',
    formulaKey: null,
    active: true,
    notes: '',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now
  };
  appState.items.push(item);
  saveData();
  renderBudgetSheet();
  showToast('Item added');
};

const renameSubsection = (groupId) => {
  const group = appState.groups.find(g => g.id === groupId);
  if (!group) return;
  
  showModal('Rename Subsection', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input type="text" class="form-input" id="subsection-name" value="${esc(group.name)}">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmRenameSubsection('${esc(groupId)}')">Save</button>`);
};

const confirmRenameSubsection = (groupId) => {
  const group = appState.groups.find(g => g.id === groupId);
  if (!group) return;
  
  const newName = document.getElementById('subsection-name').value.trim();
  if (!newName) {
    showToast('Please enter a name');
    return;
  }
  
  group.name = newName;
  saveData();
  hideModal();
  renderBudgetSheet();
  showToast('Subsection renamed');
};

const deleteSubsection = (groupId) => {
  const group = appState.groups.find(g => g.id === groupId);
  if (!group) return;
  
  const itemsInGroup = appState.items.filter(i => i.groupId === groupId);
  if (itemsInGroup.length > 0) {
    if (!confirm('This subsection has ' + itemsInGroup.length + ' item(s). Delete anyway?')) {
      return;
    }
  }
  
  if (!confirm('Delete subsection"' + group.name + '" and all its items?')) {
    return;
  }
  
  appState.items = appState.items.filter(i => i.groupId !== groupId);
  appState.groups = appState.groups.filter(g => g.id !== groupId);
  saveData();
  renderBudgetSheet();
  showToast('Subsection deleted');
};

const updateItemName = (itemId, name) => {
  const item = appState.items.find(i => i.id === itemId);
  if (item) {
    item.name = name;
    item.updatedAt = new Date().toISOString();
    saveData();
    renderBudgetSheet();
  }
};

const updateItemAmount = (itemId, amount) => {
  const item = appState.items.find(i => i.id === itemId);
  if (item) {
    item.amountTotal = parseFloat(amount) || 0;
    item.updatedAt = new Date().toISOString();
    saveData();
    renderBudgetSheet();
  }
};

const updateItemBreakdown = (itemId, breakdown) => {
  const item = appState.items.find(i => i.id === itemId);
  if (item) {
    item.amountBreakdown = breakdown;
    item.updatedAt = new Date().toISOString();
    saveData();
    renderBudgetSheet();
  }
};

const toggleItemActive = (itemId) => {
  const item = appState.items.find(i => i.id === itemId);
  if (item) {
    item.active = !item.active;
    item.updatedAt = new Date().toISOString();
    saveData();
    renderBudgetSheet();
    showToast(item.active ? 'Item activated' : 'Item deactivated');
  }
};

const deleteItem = (itemId) => {
  if (confirm('Delete this item?')) {
    appState.items = appState.items.filter(i => i.id !== itemId);
    saveData();
    renderBudgetSheet();
    showToast('Item deleted');
  }
};

const addNotePrompt = () => {
  noteTags.length = 0;
  const tags = appState.tags || [];
  tags.sort((a, b) => a.name.localeCompare(b.name));
  
  let tagsOptions = '';
  for (let i = 0; i < tags.length; i++) {
    tagsOptions += `<option value="${esc(tags[i].name)}">${esc(tags[i].name)}</option>`;
  }
  tagsOptions += '<option value="__new__">+ Add new tag</option>';
  
  showModal('Add Note', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input type="text" class="form-input" id="rec-name" placeholder="e.g., Spotify increase">
    </div>
    <div class="form-group">
      <label class="form-label">Amount</label>
      <input type="number" class="form-input currency" id="rec-amount" value="0">
    </div>
    <div class="form-group">
      <label class="form-label">Times</label>
      <input type="text" class="form-input" id="rec-times" placeholder="e.g., 12">
    </div>
    <div class="form-group">
      <label class="form-label">Frequency</label>
      <select class="form-select" id="rec-frequency">
        <option value="">Select...</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
        <option value="weekly">Weekly</option>
        <option value="once-off">Once-off</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <div class="flex-row" style="flex-wrap:wrap;gap:var(--spacing-xs);">
        <select class="form-select" id="rec-tag-select" onchange="addTagToNote()" style="flex:1;min-width:150px;">
          <option value="">Select tag...</option>
          ${tagsOptions}
          <option value="__new__">+ Add new tag</option>
        </select>
      </div>
      <div id="note-tags-list" class="flex-row" style="flex-wrap:wrap;gap:var(--spacing-xs);margin-top:var(--spacing-xs);"></div>
    </div>
    <div class="form-group">
      <label class="form-label">Details / Notes</label>
      <textarea class="form-textarea" id="rec-notes" rows="3" placeholder="e.g., Increases by 10% in June"></textarea>
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmAddNote()">Add</button>`);
};

const noteTags = [];

const addTagToNote = () => {
  const select = document.getElementById('rec-tag-select');
  const tag = select.value;
  
  if (tag === '__new__') {
    select.value = '';
    var newTag = prompt('Enter new tag name:');
    if (newTag && newTag.trim()) {
      newTag = newTag.trim();
      if (!appState.tags) appState.tags = [];
      var exists = appState.tags.some(t => t.name.toLowerCase() === newTag.toLowerCase());
      if (!exists) {
        appState.tags.push({ id: generateId(), name: newTag, color: '#3b82f6' });
        saveData();
        refreshTagOptions();
      }
      if (noteTags.indexOf(newTag) === -1) {
        noteTags.push(newTag);
        updateNoteTagsDisplay();
      }
    }
    return;
  }
  
  if (tag) {
    if (!appState.tags) appState.tags = [];
    var tagExists = appState.tags.some(t => t.name.toLowerCase() === tag.toLowerCase());
    if (!tagExists) {
      appState.tags.push({ id: generateId(), name: tag, color: '#3b82f6' });
      saveData();
      refreshTagOptions();
    }
    if (noteTags.indexOf(tag) === -1) {
      noteTags.push(tag);
      updateNoteTagsDisplay();
    }
  }
  select.value = '';
};

const refreshTagOptions = () => {
  const tags = appState.tags || [];
  tags.sort((a, b) => a.name.localeCompare(b.name));
  var options = '<option value="">Select tag...</option>';
  for (var i = 0; i < tags.length; i++) {
    options += '<option value="' + esc(tags[i].name) + '">' + esc(tags[i].name) + '</option>';
  }
  options += '<option value="__new__">+ Add new tag</option>';
  var selectEl = document.getElementById('rec-tag-select');
  if (selectEl) selectEl.innerHTML = options;
};

const updateNoteTagsDisplay = () => {
  const container = document.getElementById('note-tags-list');
  if (!container) return;
  var tags = appState.tags || [];
  var html = '';
  for (var i = 0; i < noteTags.length; i++) {
    var tagObj = tags.find(t => t.name === noteTags[i]);
    var color = tagObj ? tagObj.color : '#3b82f6';
    html += `<span class="tag" style="background:${esc(color)};">${esc(noteTags[i])} <span style="cursor:pointer;" onclick="removeTagFromNote('${jsAttr(noteTags[i])}')">×</span></span>`;
  }
  container.innerHTML = html;
};

const removeTagFromNote = (tag) => {
  noteTags.splice(noteTags.indexOf(tag), 1);
  updateNoteTagsDisplay();
};

window.addTagToNote = addTagToNote;
window.removeTagFromNote = removeTagFromNote;

const confirmAddNote = () => {
  const name = document.getElementById('rec-name').value;
  const amount = parseFloat(document.getElementById('rec-amount').value) || 0;
  const times = document.getElementById('rec-times').value;
  const frequency = document.getElementById('rec-frequency').value;
  const notes = document.getElementById('rec-notes').value;
  
  if (!name) {
    showToast('Please enter a title');
    return;
  }
  
  const item = {
    id: generateId(),
    name,
    amount,
    times,
    frequency,
    notes,
    active: true,
    tags: [...noteTags]
  };
  
  noteTags.length = 0;
  
  appState.recurringItems.push(item);
  saveData();
  hideModal();
  renderNotes();
  showToast('Note added');
};

const editNote = (id) => {
  const note = appState.recurringItems.find(r => r.id === id);
  if (!note) return;
  
  const tags = appState.tags || [];
  tags.sort((a, b) => a.name.localeCompare(b.name));
  
  let tagsOptions = '';
  for (let i = 0; i < tags.length; i++) {
    tagsOptions += `<option value="${esc(tags[i].name)}">${esc(tags[i].name)}</option>`;
  }
  
  let currentTags = note.tags || [];
  
  showModal('Edit Note', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input type="text" class="form-input" id="rec-name" value="${esc(note.name)}">
    </div>
    <div class="form-group">
      <label class="form-label">Amount</label>
      <input type="number" class="form-input currency" id="rec-amount" value="${esc(note.amount || 0)}">
    </div>
    <div class="form-group">
      <label class="form-label">Times</label>
      <input type="text" class="form-input" id="rec-times" value="${esc(note.times || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Frequency</label>
      <select class="form-select" id="rec-frequency">
        <option value="">Select...</option>
        <option value="monthly" ${note.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
        <option value="yearly" ${note.frequency === 'yearly' ? 'selected' : ''}>Yearly</option>
        <option value="weekly" ${note.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
        <option value="once-off" ${note.frequency === 'once-off' ? 'selected' : ''}>Once-off</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Tags</label>
      <div class="flex-row" style="flex-wrap:wrap;gap:var(--spacing-xs);">
        <select class="form-select" id="rec-tag-select" onchange="addTagToNoteEdit('${esc(id)}')" style="flex:1;min-width:150px;">
          <option value="">Select tag...</option>
          ${tagsOptions}
          <option value="__new__">+ Add new tag</option>
        </select>
      </div>
      <div id="note-tags-list" class="flex-row" style="flex-wrap:wrap;gap:var(--spacing-xs);margin-top:var(--spacing-xs);">
        ${currentTags.map(t => `<span class="tag">${esc(t)} <span style="cursor:pointer;" onclick="removeTagFromNoteEdit('${jsAttr(id)}', '${jsAttr(t)}')">×</span></span>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Details / Notes</label>
      <textarea class="form-textarea" id="rec-notes" rows="3">${esc(note.notes || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="toggle">
        <input type="checkbox" id="rec-active" ${note.active ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
      <span class="ml-sm">Active</span>
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmEditNote('${esc(id)}')">Save</button>`);
};

const addTagToNoteEdit = (noteId) => {
  const select = document.getElementById('rec-tag-select');
  const tag = select.value;
  const note = appState.recurringItems.find(r => r.id === noteId);
  if (!note) return;
  if (!note.tags) note.tags = [];
  
  if (tag === '__new__') {
    select.value = '';
    var newTag = prompt('Enter new tag name:');
    if (newTag && newTag.trim()) {
      newTag = newTag.trim();
      if (!appState.tags) appState.tags = [];
      var globalExists = appState.tags.some(t => t.name.toLowerCase() === newTag.toLowerCase());
      if (!globalExists) {
        appState.tags.push({ id: generateId(), name: newTag, color: '#3b82f6' });
        saveData();
        refreshTagOptionsEdit(noteId);
      }
      if (note.tags.indexOf(newTag) === -1) {
        note.tags.push(newTag);
        updateNoteTagsDisplayEdit();
      }
    }
    return;
  }
  
  if (tag) {
    if (!appState.tags) appState.tags = [];
    var globalExists = appState.tags.some(t => t.name.toLowerCase() === tag.toLowerCase());
    if (!globalExists) {
      appState.tags.push({ id: generateId(), name: tag, color: '#3b82f6' });
      saveData();
      refreshTagOptionsEdit(noteId);
    }
    if (note.tags.indexOf(tag) === -1) {
      note.tags.push(tag);
      updateNoteTagsDisplayEdit();
    }
  }
  select.value = '';
};

const refreshTagOptionsEdit = (noteId) => {
  const tags = appState.tags || [];
  tags.sort((a, b) => a.name.localeCompare(b.name));
  var options = '<option value="">Select tag...</option>';
  for (var i = 0; i < tags.length; i++) {
    options += '<option value="' + esc(tags[i].name) + '">' + esc(tags[i].name) + '</option>';
  }
  options += '<option value="__new__">+ Add new tag</option>';
  var selectEl = document.getElementById('rec-tag-select');
  if (selectEl) selectEl.innerHTML = options;
};

const updateNoteTagsDisplayEdit = () => {
  const container = document.getElementById('note-tags-list');
  if (!container) return;
  const noteId = container.closest('.modal-body').querySelector('[id^="rec-"]')?.closest('div') ? '' : '';
  var notes = document.querySelectorAll('#modal-body .tag');
};

const removeTagFromNoteEdit = (noteId, tag) => {
  const note = appState.recurringItems.find(r => r.id === noteId);
  if (!note || !note.tags) return;
  note.tags = note.tags.filter(t => t !== tag);
  const container = document.getElementById('note-tags-list');
  container.innerHTML = note.tags.map(t => `<span class="tag">${esc(t)} <span style="cursor:pointer;" onclick="removeTagFromNoteEdit('${jsAttr(noteId)}', '${jsAttr(t)}')">×</span></span>`).join('');
};

window.addTagToNoteEdit = addTagToNoteEdit;
window.removeTagFromNoteEdit = removeTagFromNoteEdit;

const confirmEditNote = (id) => {
  const note = appState.recurringItems.find(r => r.id === id);
  if (!note) return;
  
  note.name = document.getElementById('rec-name').value;
  note.amount = parseFloat(document.getElementById('rec-amount').value) || 0;
  note.times = document.getElementById('rec-times').value;
  note.frequency = document.getElementById('rec-frequency').value;
  note.notes = document.getElementById('rec-notes').value;
  note.active = document.getElementById('rec-active').checked;
  
  saveData();
  hideModal();
  renderNotes();
  showToast('Note saved');
};

const addSubsectionPrompt = () => {
  showModal('Add Subsection', `
    <div class="form-group">
      <label class="form-label">Subsection Name</label>
      <input type="text" class="form-input" id="add-subsection-name" placeholder="e.g., Savings, Investments">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmAddSubsection()">Add</button>`);
};

const confirmAddSubsection = () => {
  const name = document.getElementById('add-subsection-name').value;
  
  if (!name) {
    showToast('Please enter a name');
    return;
  }
  
  const existing = appState.groups.find(g => g.sheetId === appState.currentSheetId && g.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    showToast('A subsection with this name already exists');
    return;
  }
  
  const maxSortOrder = Math.max(...appState.groups.filter(g => g.sheetId === appState.currentSheetId).map(g => g.sortOrder || 0), 0);
  
  const group = {
    id: generateId(),
    sheetId: appState.currentSheetId,
    name,
    type: 'subsection',
    parentId: null,
    sortOrder: maxSortOrder + 1,
    active: true
  };
  appState.groups.push(group);
  saveData();
  hideModal();
  renderBudgetSheet();
  showToast('Subsection added');
};

const addItemPrompt = () => {
  const groups = appState.groups.filter(g => g.sheetId === appState.currentSheetId && g.type === 'subsection');
  let options = groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  
  const categories = appState.categories.filter(c => !c.archived);
  let catButtons = '';
  if (categories.length > 0) {
    catButtons = `<div class="form-group">
      <label class="form-label">Quick Add from Category</label>
      <div class="flex-row" style="flex-wrap:wrap;gap:var(--spacing-xs);">
        ${categories.map(c => `<button type="button" class="btn btn-secondary btn-sm" onclick="quickAddFromCategory('${esc(c.id)}')">${esc(c.name)}</button>`).join('')}
      </div>
    </div>`;
  }
  
  showModal('Add Budget Item', `
    ${catButtons}
    <div class="form-group">
      <label class="form-label">Subsection</label>
      <select class="form-select" id="add-item-group">${options}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Name</label>
      <input type="text" class="form-input" id="add-item-name" placeholder="Item name">
    </div>
    <div class="form-group">
      <label class="form-label">Amount</label>
      <input type="number" class="form-input currency" id="add-item-amount" value="0">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmAddItem()">Add</button>`);
};

const quickAddFromCategory = (categoryId) => {
  const category = appState.categories.find(c => c.id === categoryId);
  if (!category) return;
  
  const groups = appState.groups.filter(g => g.sheetId === appState.currentSheetId && g.type === 'subsection');
  const groupName = category.groupName || 'Variable';
  let group = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
  if (!group) group = groups[0];
  
  if (!group) {
    showToast('No subsections available');
    return;
  }
  
  const now = new Date().toISOString();
  const item = {
    id: generateId(),
    sheetId: appState.currentSheetId,
    groupId: group.id,
    name: category.name,
    amountTotal: category.defaultAmount,
    amountBreakdown: category.defaultBreakdown || '',
    itemType: 'normal',
    formulaKey: null,
    active: true,
    notes: '',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now
  };
  appState.items.push(item);
  saveData();
  hideModal();
  renderBudgetSheet();
  showToast('Added from category: ' + category.name);
};

const confirmAddItem = () => {
  const groupId = document.getElementById('add-item-group').value;
  const name = document.getElementById('add-item-name').value;
  const amount = parseFloat(document.getElementById('add-item-amount').value) || 0;
  
  if (!name) {
    showToast('Please enter a name');
    return;
  }
  
  const now = new Date().toISOString();
  const item = {
    id: generateId(),
    sheetId: appState.currentSheetId,
    groupId,
    name,
    amountTotal: amount,
    amountBreakdown: '',
    itemType: 'normal',
    formulaKey: null,
    active: true,
    notes: '',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now
  };
  appState.items.push(item);
  saveData();
  hideModal();
  renderBudgetSheet();
  showToast('Item added');
};

const duplicateSheet = async () => {
  const currentSheet = appState.sheets.find(s => s.id === appState.currentSheetId);
  const now = new Date().toISOString();
  
  const newSheetId = generateId();
  const newSheet = {
    ...currentSheet,
    id: newSheetId,
    name: currentSheet.name + ' (Copy)',
    createdAt: now,
    updatedAt: now
  };
  appState.sheets.push(newSheet);
  
  const groupIdMap = {};
  const oldGroups = appState.groups.filter(g => g.sheetId === currentSheet.id);
  for (const oldGroup of oldGroups) {
    const newGroup = { ...oldGroup, id: generateId(), sheetId: newSheetId };
    appState.groups.push(newGroup);
    groupIdMap[oldGroup.id] = newGroup.id;
  }
  
  const oldItems = appState.items.filter(i => i.sheetId === currentSheet.id);
  for (const oldItem of oldItems) {
    const newItem = { ...oldItem, id: generateId(), sheetId: newSheetId, groupId: groupIdMap[oldItem.groupId], createdAt: now, updatedAt: now };
    appState.items.push(newItem);
  }
  
  appState.currentSheetId = newSheetId;
  await saveData();
  renderBudgetSheet();
  showToast('Sheet duplicated');
};

const renderNotes = () => {
  const container = document.getElementById('view-container');
  const recurringItems = appState.recurringItems || [];
  const tags = appState.tags || [];
  tags.sort((a, b) => a.name.localeCompare(b.name));
  
  let topActions = `<button class="btn btn-secondary" onclick="addNotePrompt()">Add Note</button>`;
  topActions += `<button class="btn btn-secondary" onclick="manageTagsPrompt()">Manage Tags</button>`;
  document.getElementById('top-actions').innerHTML = topActions;
  
  let html = `<h1>Notes</h1>`;
  
  html += `<div class="card mb-md">
    <div class="flex-row" style="gap:var(--spacing-sm);flex-wrap:wrap;">
      <input type="text" class="form-input" id="notes-search" placeholder="Search notes..." style="flex:1;min-width:200px;" oninput="filterNotes()">
      <select class="form-select" id="notes-filter-tag" onchange="filterNotes()" style="width:auto;min-width:150px;">
        <option value="">All Tags</option>
        ${tags.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')}
      </select>
    </div>
  </div>`;
  
  let searchTerm = '';
  let filterTag = '';
  
  if (recurringItems.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-state-icon">📝</div>
      <div class="empty-state-title">No Notes</div>
      <p>Add notes for recurring amounts, upcoming changes, reminders.</p>
      <button class="btn btn-primary mt-md" onclick="addNotePrompt()">Add Note</button>
    </div>`;
  } else {
    html += `<div class="list" id="notes-list">`;
    for (const note of recurringItems) {
      const badgeClass = note.active ? 'badge-success' : 'badge-danger';
      const badgeText = note.active ? 'Active' : 'Inactive';
      let tagsHtml = '';
      if (note.tags && note.tags.length > 0) {
        tagsHtml = note.tags.map(t => {
          var tagObj = tags.find(tag => tag.name === t);
          var color = tagObj ? tagObj.color : '#3b82f6';
          return `<span class="tag" style="background:${esc(color)};">${esc(t)}</span>`;
        }).join(' ');
      }
      html += `<div class="list-item" data-note-id="${esc(note.id)}" data-note-name="${esc((note.name || '').toLowerCase())}" data-note-tags="${esc((note.tags || []).join(',').toLowerCase())}">
        <div class="list-item-content">
          <div class="list-item-title">${esc(note.name)}</div>
          <div class="list-item-subtitle">${esc(note.frequency || '')} ${note.times ? '× ' + esc(note.times) : ''} - ${esc(note.notes || 'No notes')}</div>
          <div class="mt-xs">${tagsHtml}</div>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
        <div class="list-item-actions">
          <button class="btn btn-ghost btn-sm" onclick="editNote('${esc(note.id)}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteRecurring('${esc(note.id)}')">Delete</button>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  
  container.innerHTML = html;
};

window.renderNotes = renderNotes;

const filterNotes = () => {
  const searchTerm = (document.getElementById('notes-search')?.value || '').toLowerCase();
  const filterTag = document.getElementById('notes-filter-tag')?.value || '';
  const listItems = document.querySelectorAll('#notes-list .list-item');
  
  for (let i = 0; i < listItems.length; i++) {
    const item = listItems[i];
    const noteName = item.getAttribute('data-note-name') || '';
    const noteTags = item.getAttribute('data-note-tags') || '';
    
    const matchesSearch = noteName.indexOf(searchTerm) !== -1;
    const matchesTag = !filterTag || noteTags.indexOf(filterTag.toLowerCase()) !== -1;
    
    if (matchesSearch && matchesTag) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  }
};

window.filterNotes = filterNotes;

const TAG_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Teal', value: '#14b8a6' }
];

const manageTagsPrompt = () => {
  const tags = appState.tags || [];
  tags.sort((a, b) => a.name.localeCompare(b.name));
  
  let tagsListHtml = '';
  if (tags.length === 0) {
    tagsListHtml = '<p>No tags yet. Add tags below.</p>';
  } else {
    tagsListHtml = '<table style="width:100%;border-collapse:collapse;">';
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      tagsListHtml += `<tr>
        <td style="padding:8px 4px;vertical-align:middle;">
          <span class="tag" style="background:${esc(t.color || '#3b82f6')};cursor:pointer;" onclick="editTagColor('${esc(i)}')" title="Click to change color">${esc(t.name)}</span>
        </td>
        <td style="padding:8px 4px;text-align:right;">
          <button class="btn btn-ghost btn-sm" onclick="deleteTag('${esc(i)}')">Delete</button>
        </td>
      </tr>`;
    }
    tagsListHtml += '</table>';
  }
  
  showModal('Manage Tags', `
    <div class="form-group">
      <label class="form-label">Existing Tags (click color to change)</label>
      ${tagsListHtml}
    </div>
    <div class="form-group mt-md">
      <label class="form-label">Add New Tag</label>
      <div class="flex-row" style="gap:var(--spacing-sm);align-items:center;">
        <input type="text" class="form-input" id="new-tag-name" placeholder="Tag name" style="flex:1;">
        <input type="color" id="new-tag-color" value="#3b82f6" style="width:50px;height:40px;padding:2px;border-radius:var(--radius-sm);border:1px solid var(--color-border);cursor:pointer;">
        <button class="btn btn-primary" onclick="addNewTag()">Add</button>
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Close</button>`);
};

const editTagColor = (tagIndex) => {
  const tags = appState.tags;
  const tag = tags[tagIndex];
  if (!tag) return;
  
  showModal('Change Tag Color', `
    <div class="form-group">
      <label class="form-label">${esc(tag.name)}</label>
      <div class="flex-row" style="gap:var(--spacing-sm);align-items:center;margin-bottom:var(--spacing-md);">
        <span class="tag" style="background:${esc(tag.color || '#3b82f6')};">${esc(tag.name)}</span>
      </div>
      <input type="color" id="tag-color-select" value="${esc(tag.color || '#3b82f6')}" style="width:100%;height:60px;padding:4px;border-radius:var(--radius-sm);border:1px solid var(--color-border);cursor:pointer;" onchange="updateTagColor(${tagIndex})">
      <div class="mt-md">
        <label class="form-label">Or choose a preset:</label>
        <div class="flex-row" style="flex-wrap:wrap;gap:var(--spacing-xs);margin-top:var(--spacing-xs);">
          ${TAG_COLORS.map(c => `<span style="width:30px;height:30px;background:${esc(c.value)};border-radius:50%;cursor:pointer;border:2px solid ${c.value === tag.color ? '#000' : 'transparent'};" onclick="updateTagColor(${tagIndex}, '${jsAttr(c.value)}')"></span>`).join('')}
        </div>
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="manageTagsPrompt()">Back</button>`);
};

const updateTagColor = (tagIndex, color) => {
  if (!color) {
    color = document.getElementById('tag-color-select').value;
  }
  appState.tags[tagIndex].color = color;
  saveData();
  
  var preview = document.querySelector('#modal-body .tag');
  if (preview) {
    preview.style.background = color;
  }
};

window.editTagColor = editTagColor;
window.updateTagColor = updateTagColor;

const addNewTag = () => {
  const tagName = document.getElementById('new-tag-name').value.trim();
  const tagColor = document.getElementById('new-tag-color').value;
  if (!tagName) {
    showToast('Please enter a tag name');
    return;
  }
  
  if (!appState.tags) appState.tags = [];
  
  const exists = appState.tags.some(t => t.name.toLowerCase() === tagName.toLowerCase());
  if (exists) {
    showToast('Tag already exists');
    return;
  }
  
  appState.tags.push({ id: generateId(), name: tagName, color: tagColor });
  saveData();
  manageTagsPrompt();
  showToast('Tag added: ' + tagName);
};

const deleteTag = (tagIndex) => {
  const tags = appState.tags || [];
  const tag = tags[tagIndex];
  if (!tag) return;
  
  if (!confirm('Delete tag "' + tag.name + '"?')) return;
  
  tags.splice(tagIndex, 1);
  
  const recurringItems = appState.recurringItems || [];
  for (let i = 0; i < recurringItems.length; i++) {
    var note = recurringItems[i];
    if (note.tags) {
      note.tags = note.tags.filter(t => t !== tag.name);
    }
  }
  
  saveData();
  manageTagsPrompt();
  showToast('Tag removed');
};

window.manageTagsPrompt = manageTagsPrompt;
window.addNewTag = addNewTag;
window.deleteTag = deleteTag;

const switchNotesTab = (tab) => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'notes') {
    document.getElementById('notes-section').classList.remove('hidden');
    document.getElementById('categories-section').classList.add('hidden');
  } else {
    document.getElementById('notes-section').classList.add('hidden');
    document.getElementById('categories-section').classList.remove('hidden');
  }
};

window.switchNotesTab = switchNotesTab;

const addCategoryPrompt = () => {
  showModal('Add Category', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input type="text" class="form-input" id="cat-name" placeholder="Category name">
    </div>
    <div class="form-group">
      <label class="form-label">Group</label>
      <input type="text" class="form-input" id="cat-group" placeholder="e.g., Debit orders">
    </div>
    <div class="form-group">
      <label class="form-label">Default Amount</label>
      <input type="number" class="form-input currency" id="cat-amount" value="0">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmAddCategory()">Add</button>`);
};

const confirmAddCategory = () => {
  const name = document.getElementById('cat-name').value;
  const groupName = document.getElementById('cat-group').value;
  const amount = parseFloat(document.getElementById('cat-amount').value) || 0;
  
  if (!name || !groupName) {
    showToast('Please fill in all fields');
    return;
  }
  
  const now = new Date().toISOString();
  const category = {
    id: generateId(),
    name,
    groupName,
    defaultAmount: amount,
    defaultBreakdown: '',
    archived: false,
    createdAt: now
  };
  appState.categories.push(category);
  saveData();
  hideModal();
  renderCategories();
  showToast('Category added');
};

const editCategory = (id) => {
  const cat = appState.categories.find(c => c.id === id);
  showModal('Edit Category', `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input type="text" class="form-input" id="cat-name" value="${esc(cat.name)}">
    </div>
    <div class="form-group">
      <label class="form-label">Group</label>
      <input type="text" class="form-input" id="cat-group" value="${esc(cat.groupName)}">
    </div>
    <div class="form-group">
      <label class="form-label">Default Amount</label>
      <input type="number" class="form-input currency" id="cat-amount" value="${esc(cat.defaultAmount)}">
    </div>
    <div class="form-group">
      <label class="toggle">
        <input type="checkbox" id="cat-archived" ${cat.archived ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
      <span class="ml-sm">Archived</span>
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmEditCategory('${esc(id)}')">Save</button>`);
};

const confirmEditCategory = (id) => {
  const cat = appState.categories.find(c => c.id === id);
  cat.name = document.getElementById('cat-name').value;
  cat.groupName = document.getElementById('cat-group').value;
  cat.defaultAmount = parseFloat(document.getElementById('cat-amount').value) || 0;
  cat.archived = document.getElementById('cat-archived').checked;
  saveData();
  hideModal();
  renderCategories();
  showToast('Category saved');
};

const deleteCategory = (id) => {
  if (confirm('Delete this category?')) {
    appState.categories = appState.categories.filter(c => c.id !== id);
    saveData();
    renderCategories();
    showToast('Category deleted');
  }
};

const renderTemplates = () => {
  const container = document.getElementById('view-container');
  const templates = appState.templates;
  
  let topActions = `<button class="btn btn-primary" onclick="createTemplatePrompt()">Create Template</button>`;
  document.getElementById('top-actions').innerHTML = topActions;
  
  let html = `<h1>Templates</h1>`;
  
  if (templates.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">No Templates</div>
      <p>Create reusable budget templates.</p>
    </div>`;
  } else {
    html += `<div class="list">`;
    for (const tmpl of templates) {
      html += `<div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${esc(tmpl.name)}</div>
          <div class="list-item-subtitle">${esc(tmpl.description || '')} - Created ${esc(formatDate(tmpl.createdAt))}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="showTemplatePreview('${esc(tmpl.id)}')">Preview</button>
          <button class="btn btn-primary btn-sm" onclick="createSheetFromTemplate('${esc(tmpl.id)}')">Use</button>
          <button class="btn btn-ghost btn-sm" onclick="duplicateTemplate('${esc(tmpl.id)}')">Copy</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteTemplate('${esc(tmpl.id)}')">Delete</button>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  
  container.innerHTML = html;
};

const showTemplatePreview = (templateId) => {
  const tmpl = appState.templates.find(t => t.id === templateId);
  if (!tmpl) return;
  
  const symbol = appState.settings.currencySymbol;
  const groups = tmpl.groups || [];
  const items = tmpl.items || [];
  
  let groupTotals = {};
  for (const item of items) {
    if (!groupTotals[item.groupName]) groupTotals[item.groupName] = 0;
    groupTotals[item.groupName] += item.amountTotal || 0;
  }
  
  let html = `<h2>${esc(tmpl.name)}</h2><p class="mb-md">${esc(tmpl.description || '')}</p>`;
  html += `<div class="card mb-md"><table class="data-table"><thead><tr><th>Subsection</th><th class="numeric">Items</th><th class="numeric">Total</th></tr></thead><tbody>`;
  
  for (const group of groups.filter(g => g.type === 'subsection')) {
    const count = items.filter(i => i.groupName === group.name).length;
    const total = groupTotals[group.name] || 0;
    html += `<tr><td>${esc(group.name)}</td><td class="numeric">${count}</td><td class="numeric">${formatCurrency(total, symbol)}</td></tr>`;
  }
  
  const grandTotal = Object.values(groupTotals).reduce((a, b) => a + b, 0);
  html += `<tr class="subtotal"><td><strong>Total</strong></td><td></td><td class="numeric"><strong>${formatCurrency(grandTotal, symbol)}</strong></td></tr>`;
  html += `</tbody></table></div>`;
  html += `<div style="margin-top:var(--spacing-lg);">`;
  html += `<h3>All Items</h3>`;
  html += `<div class="table-container" style="max-height:250px;overflow-y:auto;"><table class="data-table"><thead><tr><th>Item</th><th>Subsection</th><th class="numeric">Amount</th></tr></thead><tbody>`;
  for (const item of items) {
    html += `<tr><td>${esc(item.name)}</td><td>${esc(item.groupName)}</td><td class="numeric">${formatCurrency(item.amountTotal, symbol)}</td></tr>`;
  }
  html += `</tbody></table></div></div>`;
  
  showModal('Template Preview', html, `<button class="btn btn-secondary" onclick="hideModal()">Close</button><button class="btn btn-primary" onclick="hideModal();createSheetFromTemplate('${esc(templateId)}')">Use Template</button>`, true);
};

window.showTemplatePreview = showTemplatePreview;

const createTemplatePrompt = () => {
  showModal('Create Template', `
    <div class="form-group">
      <label class="form-label">Template Name</label>
      <input type="text" class="form-input" id="tmpl-name" placeholder="My Template">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input type="text" class="form-input" id="tmpl-desc" placeholder="Description">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmCreateTemplate()">Create</button>`);
};

const confirmCreateTemplate = () => {
  const name = document.getElementById('tmpl-name').value;
  const desc = document.getElementById('tmpl-desc').value;
  
  if (!name) {
    showToast('Please enter a name');
    return;
  }
  
  const now = new Date().toISOString();
  const template = {
    id: generateId(),
    name,
    description: desc,
    groups: [...DEFAULT_GROUPS],
    items: DEFAULT_ITEMS.map(i => ({ ...i })),
    createdAt: now,
    updatedAt: now
  };
  appState.templates.push(template);
  saveData();
  hideModal();
  renderTemplates();
  showToast('Template created');
};

const saveCurrentAsTemplate = () => {
  const sheet = appState.sheets.find(s => s.id === appState.currentSheetId);
  const groups = appState.groups.filter(g => g.sheetId === appState.currentSheetId);
  const items = appState.items.filter(i => i.sheetId === appState.currentSheetId);
  
  showModal('Save as Template', `
    <div class="form-group">
      <label class="form-label">Template Name</label>
      <input type="text" class="form-input" id="tmpl-name" placeholder="My Template" value="${esc(sheet ? sheet.name : 'My Budget')}">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <input type="text" class="form-input" id="tmpl-desc" placeholder="Description">
    </div>
    <div class="form-group">
      <label class="form-label">Include:</label>
      <div>${groups.length} subsections, ${items.length} items</div>
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmSaveCurrentAsTemplate()">Save</button>`);
};

const confirmSaveCurrentAsTemplate = () => {
  const name = document.getElementById('tmpl-name').value;
  const desc = document.getElementById('tmpl-desc').value;
  
  if (!name) {
    showToast('Please enter a name');
    return;
  }
  
  const groups = appState.groups.filter(g => g.sheetId === appState.currentSheetId);
  const items = appState.items.filter(i => i.sheetId === appState.currentSheetId);
  
  const groupIdMap = {};
  const templateGroups = [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    var newGroupId = generateId();
    groupIdMap[g.id] = newGroupId;
    templateGroups.push({
      id: newGroupId,
      name: g.name,
      type: g.type,
      parentId: null,
      sortOrder: g.sortOrder,
      active: true
    });
  }
  
  const templateItems = [];
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var grp = groups.find(function(g) { return g.id === it.groupId; });
    templateItems.push({
      groupName: grp ? grp.name : 'Variable',
      name: it.name,
      amountTotal: it.amountTotal,
      amountBreakdown: it.amountBreakdown,
      itemType: it.itemType,
      active: it.active,
      notes: it.notes || ''
    });
  }
  
  const now = new Date().toISOString();
  const template = {
    id: generateId(),
    name,
    description: desc,
    groups: templateGroups,
    items: templateItems,
    createdAt: now,
    updatedAt: now
  };
  appState.templates.push(template);
  saveData();
  hideModal();
  navigate('templates');
  showToast('Template saved from current budget');
};

window.saveCurrentAsTemplate = saveCurrentAsTemplate;
window.confirmSaveCurrentAsTemplate = confirmSaveCurrentAsTemplate;

const createSheetFromTemplate = async (templateId) => {
  const template = appState.templates.find(t => t.id === templateId);
  const now = new Date().toISOString();
  
  const sheetId = generateId();
  const sheet = {
    id: sheetId,
    name: template.name,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    templateId,
    notes: '',
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  appState.sheets.push(sheet);
  
  const groupIdMap = {};
  for (const tg of template.groups) {
    const group = { id: generateId(), sheetId, name: tg.name, type: tg.type, parentId: null, sortOrder: tg.sortOrder, active: true };
    appState.groups.push(group);
    groupIdMap[tg.name] = group.id;
  }
  
  for (const ti of template.items) {
    const item = {
      id: generateId(),
      sheetId,
      groupId: groupIdMap[ti.groupName],
      name: ti.name,
      amountTotal: ti.amountTotal,
      amountBreakdown: ti.amountBreakdown,
      itemType: ti.itemType,
      formulaKey: null,
      active: true,
      notes: ti.notes || '',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    };
    appState.items.push(item);
  }
  
  appState.currentSheetId = sheetId;
  await saveData();
  navigate('budget-sheet');
  showToast('Sheet created from template');
};

const duplicateTemplate = (id) => {
  const tmpl = appState.templates.find(t => t.id === id);
  const now = new Date().toISOString();
  const newTmpl = {
    ...tmpl,
    id: generateId(),
    name: tmpl.name + ' (Copy)',
    createdAt: now,
    updatedAt: now
  };
  appState.templates.push(newTmpl);
  saveData();
  renderTemplates();
  showToast('Template duplicated');
};

const deleteTemplate = (id) => {
  if (confirm('Delete this template?')) {
    appState.templates = appState.templates.filter(t => t.id !== id);
    saveData();
    renderTemplates();
    showToast('Template deleted');
  }
};

const renderReports = () => {
  const container = document.getElementById('view-container');
  const totals = calculateTotals(appState.currentSheetId);
  const symbol = appState.settings.currencySymbol;
  const maxTotal = Math.max(totals.debitOrders, totals.costs, totals.variable, totals.newPayments) || 1;
  
  let topActions = ``;
  document.getElementById('top-actions').innerHTML = topActions;
  
  container.innerHTML = `
    <h1>Reports</h1>
    <div class="card">
      <h2 class="card-title">Budget Summary</h2>
      <div class="report-bar">
        <div class="report-bar-label">Debit Orders</div>
        <div class="report-bar-track">
          <div class="report-bar-fill" style="width:${(totals.debitOrders / maxTotal) * 100}%">${Math.round((totals.debitOrders / maxTotal) * 100)}%</div>
        </div>
        <div class="report-bar-value">${formatCurrency(totals.debitOrders, symbol)}</div>
      </div>
      <div class="report-bar">
        <div class="report-bar-label">Costs</div>
        <div class="report-bar-track">
          <div class="report-bar-fill" style="width:${(totals.costs / maxTotal) * 100}%">${Math.round((totals.costs / maxTotal) * 100)}%</div>
        </div>
        <div class="report-bar-value">${formatCurrency(totals.costs, symbol)}</div>
      </div>
      <div class="report-bar">
        <div class="report-bar-label">Variable</div>
        <div class="report-bar-track">
          <div class="report-bar-fill" style="width:${(totals.variable / maxTotal) * 100}%">${Math.round((totals.variable / maxTotal) * 100)}%</div>
        </div>
        <div class="report-bar-value">${formatCurrency(totals.variable, symbol)}</div>
      </div>
      <div class="report-bar">
        <div class="report-bar-label">New Payments</div>
        <div class="report-bar-track">
          <div class="report-bar-fill" style="width:${(totals.newPayments / maxTotal) * 100}%">${Math.round((totals.newPayments / maxTotal) * 100)}%</div>
        </div>
        <div class="report-bar-value">${formatCurrency(totals.newPayments, symbol)}</div>
      </div>
    </div>
    
    <div class="card mt-md">
      <h2 class="card-title">Summary</h2>
      <table class="data-table">
        <tr><td>Total Expenses</td><td class="numeric">${formatCurrency(totals.totalExpenses, symbol)}</td></tr>
        <tr><td>Current Buffer (remaining)</td><td class="numeric">${formatCurrency(totals.currentBuffer, symbol)}</td></tr>
        <tr><td>Total Buffer</td><td class="numeric">${formatCurrency(totals.totalBuffer, symbol)}</td></tr>
      </table>
    </div>
  `;
};
  
const renderHelp = () => {
  const container = document.getElementById('view-container');
  document.getElementById('top-actions').innerHTML = '';
  
  container.innerHTML = `
    <h1>How Sheetly Works</h1>
    
    <div class="card mb-md" style="padding:var(--spacing-lg);">
      <h2 class="card-title" style="margin-bottom:var(--spacing-md);font-size:var(--font-size-lg);">Income Calculations</h2>
      <div style="display:grid;gap:var(--spacing-sm);">
        <div style="display:grid;grid-template-columns:minmax(110px,140px) 1fr;gap:var(--spacing-md);align-items:start;padding:var(--spacing-sm) 0;border-bottom:1px solid var(--color-border-subtle);"><strong>Gross Income</strong><span style="color:var(--color-text-muted);">Your total salary/income before any deductions</span></div>
        <div style="display:grid;grid-template-columns:minmax(110px,140px) 1fr;gap:var(--spacing-md);align-items:start;padding:var(--spacing-sm) 0;border-bottom:1px solid var(--color-border-subtle);"><strong>Deductions</strong><span style="color:var(--color-text-muted);">PAYE, UIF, medical aid, pension, etc.</span></div>
        <div style="display:grid;grid-template-columns:minmax(110px,140px) 1fr;gap:var(--spacing-md);align-items:start;padding:var(--spacing-sm) 0;"><strong>Nett Income</strong><span style="color:var(--color-text-muted);">Gross Income - Deductions</span></div>
      </div>
    </div>
    
    <div class="card mb-md" style="padding:var(--spacing-lg);">
      <h2 class="card-title" style="margin-bottom:var(--spacing-md);font-size:var(--font-size-lg);">Buffer Calculations</h2>
      <p style="color:var(--color-text-muted);margin-bottom:var(--spacing-md);font-size:var(--font-size-sm);">
        <strong>Buffer</strong> means everything outside the budget itself — money like savings that still belongs to this budget period but isn't earmarked for a specific expense line. It's what's left over and available within the same month.
      </p>
      <div style="display:grid;gap:var(--spacing-sm);">
        <div style="display:grid;grid-template-columns:minmax(140px,180px) 1fr;gap:var(--spacing-md);align-items:start;padding:var(--spacing-sm) 0;border-bottom:1px solid var(--color-border-subtle);"><strong>Total Expenses</strong><span style="color:var(--color-text-muted);">Sum of all active budget items</span></div>
        <div style="display:grid;grid-template-columns:minmax(140px,180px) 1fr;gap:var(--spacing-md);align-items:start;padding:var(--spacing-sm) 0;border-bottom:1px solid var(--color-border-subtle);"><strong>Current Buffer (remaining)</strong><span style="color:var(--color-text-muted);">Nett Income - Total Expenses</span></div>
        <div style="display:grid;grid-template-columns:minmax(140px,180px) 1fr;gap:var(--spacing-md);align-items:start;padding:var(--spacing-sm) 0;"><strong>Total Buffer</strong><span style="color:var(--color-text-muted);">Current Buffer + Capitec Savings + Variable</span></div>
      </div>
    </div>
    
    <div class="card mb-md" style="padding:var(--spacing-lg);">
      <h2 class="card-title" style="margin-bottom:var(--spacing-md);font-size:var(--font-size-lg);">Budget Structure</h2>
      <p style="margin-bottom:var(--spacing-md);">Your budget is organized into sections:</p>
      <div style="display:grid;gap:var(--spacing-sm);">
        <div style="padding:var(--spacing-sm);background:var(--color-bg);border-radius:var(--radius-sm);"><strong>Debit orders</strong> - Fixed monthly payments (home loan, car finance, insurance, Capitec Savings)</div>
        <div style="padding:var(--spacing-sm);background:var(--color-bg);border-radius:var(--radius-sm);"><strong>Costs</strong> - Regular bills (rates, electricity, water, internet, security)</div>
        <div style="padding:var(--spacing-sm);background:var(--color-bg);border-radius:var(--radius-sm);"><strong>Variable</strong> - Flexible spending (groceries, fuel, entertainment)</div>
        <div style="padding:var(--spacing-sm);background:var(--color-bg);border-radius:var(--radius-sm);"><strong>New payments</strong> - One-off or new recurring expenses</div>
      </div>
    </div>
    
    <div class="card mb-md" style="padding:var(--spacing-lg);">
      <h2 class="card-title" style="margin-bottom:var(--spacing-md);font-size:var(--font-size-lg);">Tips</h2>
      <ul style="padding-left:var(--spacing-lg);display:grid;gap:var(--spacing-sm);">
        <li>Toggle items on/off using the circle button (●/○) - inactive items aren't counted in totals</li>
        <li>Use the Breakdown field to note payment details</li>
        <li>Backups run automatically each month and are stored in the Documentation > Backups section</li>
        <li>Export to Excel for external records</li>
        <li>Save your current budget as a template to reuse later</li>
      </ul>
    </div>
  `;
};
  
const renderSettings = () => {
  const container = document.getElementById('view-container');
  const settings = appState.settings;
  const sheets = appState.sheets;
  const templates = appState.templates;
  const currentBuffer = calculateTotals(appState.currentSheetId).currentBuffer;
  const symbol = settings.currencySymbol;
  
  const totalItems = appState.items.length + appState.recurringItems.length + appState.categories.length;
  const storageEstimate = JSON.stringify(appState).length;
  const storageKB = (storageEstimate / 1024).toFixed(1);
  
  let topActions = ``;
  document.getElementById('top-actions').innerHTML = topActions;
  
  container.innerHTML = `
    <h1>Settings</h1>
    
    <div class="card">
      <h2 class="card-title">Preferences</h2>
      <div class="form-group">
        <label class="form-label">Currency Symbol</label>
        <select class="form-select" id="currency-symbol" onchange="updateSetting('currencySymbol', this.value)">
          <option value="R" ${settings.currencySymbol === 'R' ? 'selected' : ''}>R (ZAR)</option>
          <option value="$" ${settings.currencySymbol === '$' ? 'selected' : ''}>$ (USD)</option>
          <option value="€" ${settings.currencySymbol === '€' ? 'selected' : ''}>€ (EUR)</option>
          <option value="£" ${settings.currencySymbol === '£' ? 'selected' : ''}>£ (GBP)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Theme</label>
        <select class="form-select" id="theme" onchange="updateSetting('theme', this.value)">
          <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Default Template</label>
        <select class="form-select" id="default-template" onchange="updateSetting('defaultTemplate', this.value)">
          <option value="">None</option>
          ${templates.map(t => `<option value="${esc(t.id)}" ${settings.defaultTemplate === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Sheet Name Format</label>
        <select class="form-select" id="sheet-format" onchange="updateSetting('sheetFormat', this.value)">
          <option value="month-year" ${settings.sheetFormat === 'month-year' ? 'selected' : ''}>January 2026</option>
          <option value="short" ${settings.sheetFormat === 'short' ? 'selected' : ''}>Jan 2026</option>
          <option value="year-month" ${settings.sheetFormat === 'year-month' ? 'selected' : ''}>2026-01</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Number Format</label>
        <div class="flex-row">
          <label class="toggle">
            <input type="checkbox" id="show-cents" ${settings.showCents !== false ? 'checked' : ''} onchange="updateSetting('showCents', this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span class="ml-sm">Show cents</span>
        </div>
      </div>
    </div>
    


    
    <div class="card mt-md">
      <h2 class="card-title">Backups</h2>
      <p style="color:var(--text-muted,#666);font-size:var(--font-size-sm);margin:0 0 var(--spacing-sm) 0">
        Automatic monthly cloud backups of your budget. Open the Backups panel to download, import, or run a backup now.
      </p>
      <button class="btn btn-primary" onclick="openBackupsTab()">Open Backups</button>
    </div>

    <div class="card mt-md">
      <h2 class="card-title">Templates</h2>
      <p style="color:var(--text-muted,#666);font-size:var(--font-size-sm);margin:0 0 var(--spacing-sm) 0">
        Reusable blueprints for new budget sheets. Open the Templates panel to create, use or edit them.
      </p>
      <button class="btn btn-primary" onclick="openTemplatesTab()">Open Templates</button>
    </div>

    <div class="card mt-md">
      <h2 class="card-title">Data Management</h2>
      <div class="flex-row" style="flex-wrap:wrap;gap:var(--spacing-sm);">
        <button class="btn btn-secondary" onclick="exportData()">Export to JSON</button>
        <button class="btn btn-secondary" onclick="document.getElementById('import-file').click()">Import from JSON</button>
        <input type="file" id="import-file" class="hidden" accept=".json" onchange="importData(this)">
        <button class="btn btn-secondary" onclick="clearNotesOnly()">Clear All Notes</button>
        <button class="btn btn-danger" onclick="resetAllData()">Reset All Data</button>
      </div>
    </div>
    
    <details class="card mt-md" id="localstorage-section">
      <summary class="card-header" style="cursor:pointer;justify-content:flex-start;gap:8px;"><span class="arrow">&#9658;</span><h2 class="card-title" style="margin:0;">Browser LocalStorage <span id="localstorage-summary" style="color:var(--color-text-muted);font-size:var(--font-size-sm);font-weight:normal;"></span></h2></summary>
      <div style="padding:var(--spacing-md);">
        <div class="flex-row" style="margin-bottom:var(--spacing-md);">
          <button class="btn btn-secondary" onclick="refreshLocalStorageView()">Refresh</button>
          <span id="localstorage-status" style="color:var(--color-text-muted);font-size:var(--font-size-sm);"></span>
        </div>
        <div id="localstorage-list" style="font-size:var(--font-size-sm);max-height:300px;overflow-y:auto;"></div>
        <details style="margin-top:var(--spacing-md);">
          <summary style="cursor:pointer;font-weight:bold;"><span class="arrow">&#9658;</span>View sheetly_data content</summary>
          <div id="localstorage-content" style="margin-top:var(--spacing-sm);padding:var(--spacing-sm);background:var(--color-bg);border-radius:var(--radius-sm);font-size:11px;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;"></div>
        </details>
      </div>
    </details>
  `;
  
  document.documentElement.setAttribute('data-theme', settings.theme);
  


  
  refreshLocalStorageView();
};

const refreshLocalStorageView = function() {
  var allKeys = Object.keys(localStorage);
  var budgetKey = 'sheetly_data';
  var mainData = localStorage.getItem(budgetKey);
  
  var listEl = document.getElementById('localstorage-list');
  var contentEl = document.getElementById('localstorage-content');
  var statusEl = document.getElementById('localstorage-status');
  
  var html = '<table style="width:100%;border-collapse:collapse;"><tr style="text-align:left;background:var(--color-bg);"><th style="padding:8px;border-bottom:1px solid var(--color-border);">Key</th><th style="padding:8px;border-bottom:1px solid var(--color-border);">Size</th></tr>';
  
  for (var i = 0; i < allKeys.length; i++) {
    var key = allKeys[i];
    var val = localStorage.getItem(key);
    var size = val ? (val.length / 1024).toFixed(2) : 0;
    var isBudgetKey = key === budgetKey;
    html += '<tr' + (isBudgetKey ? ' style="background:#e8f5e9;"' : '') + '><td style="padding:8px;border-bottom:1px solid var(--color-border);">' + esc(key) + (isBudgetKey ? ' <strong>(main data)</strong>' : '') + '</td><td style="padding:8px;border-bottom:1px solid var(--color-border);">' + size + ' KB</td></tr>';
  }
  
  html += '</table>';
  listEl.innerHTML = html;
  
  if (mainData) {
    try {
      var parsed = JSON.parse(mainData);
      contentEl.textContent = JSON.stringify(parsed, null, 2);
      statusEl.textContent = 'Main data verified: ' + parsed.sheets.length + ' sheets, ' + parsed.items.length + ' items - Updated just now';
      if (document.getElementById('localstorage-summary')) {
        document.getElementById('localstorage-summary').textContent = '(' + allKeys.length + ' keys)';
      }
    } catch (e) {
      contentEl.textContent = 'Error parsing data: ' + e.message;
      statusEl.textContent = 'Error reading main data';
    }
  } else {
    contentEl.textContent = 'No main data found in localStorage';
    statusEl.textContent = 'WARNING: No main data found';
    if (document.getElementById('localstorage-summary')) {
      document.getElementById('localstorage-summary').textContent = '(0 keys)';
    }
  }
  
  var lsSection = document.getElementById('localstorage-section');
  if (lsSection) {
    if (allKeys.length > 5) {
      lsSection.removeAttribute('open');
    } else {
      lsSection.setAttribute('open', 'true');
    }
  }
  
  var listItems = document.querySelectorAll('#localstorage-list tr');
  if (listItems.length > 5) {
    document.getElementById('localstorage-list').style.maxHeight = '200px';
    document.getElementById('localstorage-list').style.overflowY = 'auto';
  } else {
    document.getElementById('localstorage-list').style.maxHeight = 'none';
    document.getElementById('localstorage-list').style.overflowY = 'visible';
  }
};

window.refreshLocalStorageView = refreshLocalStorageView;

const formatBackupDate = function(timestamp) {
  try {
    var parts = timestamp.split('T');
    if (parts.length !== 2) return timestamp;
    var dateParts = parts[0].split('-');
    var timeParts = parts[1].split('-');
    if (dateParts.length !== 3) return timestamp;
    var year = dateParts[0];
    var month = dateParts[1];
    var day = dateParts[2];
    var hours = timeParts[0];
    var mins = timeParts.length > 1 ? timeParts[1] : '00';
    return day + '/' + month + '/' + year + ' ' + hours + ':' + mins + ' GMT+2';
  } catch (e) {
    return timestamp;
  }
};

const restoreBackup = function(key) {
  var data = localStorage.getItem(key);
  if (!data) {
    showToast('Backup not found');
    return;
  }
  if (!confirm('Restore this backup? Current data will be overwritten.')) return;
  try {
    var parsed = JSON.parse(data);
    appState = { ...appState, ...parsed };
    appState.currentSheetId = appState.sheets[0] ? appState.sheets[0].id : null;
    
    // Migration: fix old group names
    if (appState.groups) {
      var hasTotalBuffer = false;
      for (var i = 0; i < appState.groups.length; i++) {
        if (appState.groups[i].name === 'Total Buffer') hasTotalBuffer = true;
      }
      var newGroups = [];
      for (var i = 0; i < appState.groups.length; i++) {
        var g = appState.groups[i];
        if (g.name === 'New Buffer' || g.name === 'Total (Buffer/Variable)') {
          if (!hasTotalBuffer) {
            g.name = 'Total Buffer';
            hasTotalBuffer = true;
            newGroups.push(g);
          }
        } else {
          newGroups.push(g);
        }
      }
      appState.groups = newGroups;
    }
    
    saveData();
    renderSettings();
    renderDashboard();
    showToast('Backup restored');
  } catch (e) {
    showToast('Restore failed: ' + e.message);
  }
};

const deleteBackup = function(key) {
  if (!confirm('Delete this backup?')) return;
  localStorage.removeItem(key);
  renderSettings();
  showToast('Backup deleted');
};

const downloadBackup = function(key) {
  var data = localStorage.getItem(key);
  if (!data) {
    showToast('Backup not found');
    return;
  }
  var fileName = key + '.json';
  var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup downloaded');
};

window.restoreBackup = restoreBackup;
window.deleteBackup = deleteBackup;
window.downloadBackup = downloadBackup;

const quickSetBuffer = () => {
  const amount = parseFloat(document.getElementById('quick-buffer').value) || 0;
  const bufferGroup = appState.groups.find(g => g.name === 'Current Buffer' && g.sheetId === appState.currentSheetId);
  if (!bufferGroup) {
    showToast('No buffer group found');
    return;
  }
  const bufferItem = appState.items.find(i => i.groupId === bufferGroup.id);
  if (bufferItem) {
    bufferItem.amountTotal = amount;
    bufferItem.updatedAt = new Date().toISOString();
    saveData();
    renderDashboard();
    showToast('Buffer updated');
  }
};

window.quickSetBuffer = quickSetBuffer;

const switchSheet = (sheetId) => {
  appState.currentSheetId = sheetId;
  saveData();
  navigate('dashboard');
  showToast('Switched to sheet');
};

window.switchSheet = switchSheet;

const createNewSheetPrompt = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const defaultName = month + '/' + year;
  
  showModal('Create New Sheet', `
    <div class="form-group">
      <label class="form-label">Sheet Name</label>
      <input type="text" class="form-input" id="new-sheet-name" value="${defaultName}" placeholder="e.g., Budget 2026">
    </div>
    <div class="form-group">
      <label class="form-label">Month</label>
      <input type="number" class="form-input" id="new-sheet-month" value="${month}" min="1" max="12">
    </div>
    <div class="form-group">
      <label class="form-label">Year</label>
      <input type="number" class="form-input" id="new-sheet-year" value="${year}" min="2000" max="2100">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmCreateNewSheet()">Create</button>`);
};

const confirmCreateNewSheet = () => {
  const name = document.getElementById('new-sheet-name').value.trim();
  const month = parseInt(document.getElementById('new-sheet-month').value) || 1;
  const year = parseInt(document.getElementById('new-sheet-year').value) || new Date().getFullYear();
  
  if (!name) {
    showToast('Please enter a sheet name');
    return;
  }
  
  const now = new Date().toISOString();
  const sheetId = generateId();
  
  const sheet = {
    id: sheetId,
    name: name,
    month: month,
    year: year,
    templateId: null,
    notes: '',
    archived: false,
    createdAt: now,
    updatedAt: now
  };
  
  appState.sheets.push(sheet);
  
  const defaultGroups = [
    { name: 'Expenses', type: 'section', parentId: null, sortOrder: 0 },
    { name: 'Debit orders', type: 'subsection', parentId: null, sortOrder: 1 },
    { name: 'Costs', type: 'subsection', parentId: null, sortOrder: 2 },
    { name: 'Variable', type: 'subsection', parentId: null, sortOrder: 3 },
    { name: 'New payments', type: 'subsection', parentId: null, sortOrder: 4 },
    { name: 'Current Buffer', type: 'summary', parentId: null, sortOrder: 5 },
    { name: 'Total Buffer', type: 'summary', parentId: null, sortOrder: 6 },
    { name: 'Recurring', type: 'recurring', parentId: null, sortOrder: 7 }
  ];
  
  const groupIdMap = {};
  for (var i = 0; i < defaultGroups.length; i++) {
    var dg = defaultGroups[i];
    var group = {
      id: generateId(),
      sheetId: sheetId,
      name: dg.name,
      type: dg.type,
      parentId: null,
      sortOrder: dg.sortOrder,
      active: true
    };
    appState.groups.push(group);
    groupIdMap[dg.name] = group.id;
  }
  
  appState.currentSheetId = sheetId;
  saveData();
  hideModal();
  renderSettings();
  navigate('dashboard');
  showToast('New sheet created: ' + name);
};

window.createNewSheetPrompt = createNewSheetPrompt;
window.confirmCreateNewSheet = confirmCreateNewSheet;

const filterSheets = () => {
  const searchTerm = (document.getElementById('sheet-search')?.value || '').toLowerCase();
  const listItems = document.querySelectorAll('#sheet-list .list-item');
  
  for (let i = 0; i < listItems.length; i++) {
    const item = listItems[i];
    const sheetName = item.getAttribute('data-sheet-name') || '';
    if (sheetName.indexOf(searchTerm) !== -1) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  }
};

window.filterSheets = filterSheets;

const editSheetName = (sheetId) => {
  const sheet = appState.sheets.find(s => s.id === sheetId);
  if (!sheet) return;
  
  showModal('Edit Sheet Name', `
    <div class="form-group">
      <label class="form-label">Sheet Name</label>
      <input type="text" class="form-input" id="edit-sheet-name" value="${esc(sheet.name)}">
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="confirmEditSheetName('${esc(sheetId)}')">Save</button>`);
};

const confirmEditSheetName = (sheetId) => {
  const sheet = appState.sheets.find(s => s.id === sheetId);
  if (!sheet) return;
  
  const newName = document.getElementById('edit-sheet-name').value.trim();
  if (!newName) {
    showToast('Please enter a sheet name');
    return;
  }
  
  sheet.name = newName;
  sheet.updatedAt = new Date().toISOString();
  saveData();
  hideModal();
  renderSettings();
  showToast('Sheet name updated');
};

window.editSheetName = editSheetName;
window.confirmEditSheetName = confirmEditSheetName;

const deleteSheet = (sheetId) => {
  if (appState.sheets.length <= 1) {
    showToast('Cannot delete last sheet');
    return;
  }
  if (confirm('Delete this sheet? All budget items will be lost.')) {
    const sheetGroups = appState.groups.filter(g => g.sheetId === sheetId);
    const sheetItems = appState.items.filter(i => i.sheetId === sheetId);
    
    appState.sheets = appState.sheets.filter(s => s.id !== sheetId);
    appState.groups = appState.groups.filter(g => g.sheetId !== sheetId);
    appState.items = appState.items.filter(i => i.sheetId !== sheetId);
    
    if (appState.currentSheetId === sheetId) {
      appState.currentSheetId = appState.sheets[0].id;
    }
    
    saveData();
    renderSettings();
    showToast('Sheet deleted');
  }
};

window.deleteSheet = deleteSheet;

const clearNotesOnly = () => {
  if (confirm('Clear all Notes? This cannot be undone.')) {
    appState.recurringItems = [];
    saveData();
    renderSettings();
    showToast('Notes cleared');
  }
};

window.clearNotesOnly = clearNotesOnly;

const updateSetting = async (key, value) => {
  appState.settings[key] = value;
  appState.settings.schemaVersion = CONSTANTS.SCHEMA_VERSION;
  await saveData();
  
  if (key === 'theme') {
    document.documentElement.setAttribute('data-theme', value);
  }
  
  showToast('Setting saved');
};

const exportData = () => {
  const data = {
    version: CONSTANTS.SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: appState.settings,
    sheets: appState.sheets,
    groups: appState.groups,
    items: appState.items,
    recurringItems: appState.recurringItems,
    categories: appState.categories,
    templates: appState.templates
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sheetly-export.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported');
};

const createBackup = () => {
  var now = new Date();
  var gmt2Date = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  var timestamp = gmt2Date.toISOString().split('.')[0].replace(/[:.]/g, '-');
  var backupKey = 'backup_' + timestamp;
  var fileName = 'backup_' + timestamp + '.json';
  
  appState.settings.lastBackupDate = new Date().toISOString();
  
  var backupData = {
    settings: appState.settings,
    sheets: appState.sheets,
    groups: appState.groups,
    items: appState.items,
    recurringItems: appState.recurringItems,
    categories: appState.categories,
    templates: appState.templates,
    tags: appState.tags
  };
  
  try {
    localStorage.setItem(backupKey, JSON.stringify(backupData));
  } catch (e) {
    console.error('LocalStorage save failed', e);
  }
  
  var blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('Backup created');
  renderSettings();
};

const checkBackupReminder = () => {
  if (!appState.settings.backupReminder) return;
  
  var now = new Date();
  var day = now.getDate();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  
  if (day !== 25) return;
  
  var lastReminder = appState.settings.lastBackupReminder;
  if (lastReminder) {
    var reminderDate = new Date(lastReminder);
    if (reminderDate.getMonth() === currentMonth && reminderDate.getFullYear() === currentYear) {
      return;
    }
  }
  
  appState.settings.lastBackupReminder = new Date().toISOString();
  saveData();
  
  showToast('Reminder: It\'s time to create a monthly backup!', 10000);
};

const exportToExcel = () => {
  const sheet = appState.sheets.find(s => s.id === appState.currentSheetId);
  const groups = appState.groups.filter(g => g.sheetId === appState.currentSheetId).sort((a, b) => a.sortOrder - b.sortOrder);
  const items = appState.items.filter(i => i.sheetId === appState.currentSheetId);
  const symbol = appState.settings.currencySymbol;
  const totals = calculateTotals(appState.currentSheetId);
  
  let html = '<html><head><meta charset="UTF-8"><style>';
  html += 'table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }';
  html += 'th, td { border: 1px solid #000; padding: 8px; }';
  html += 'th { background: #f0f0f0; font-weight: bold; }';
  html += '.numeric { text-align: right; }';
  html += '.subtotal { font-weight: bold; background: #e0e0e0; }';
  html += '.calculated { font-weight: bold; background: #d0e0ff; }';
  html += '</style></head><body>';
  html += '<h1>' + esc(sheet ? sheet.name : 'Budget Sheet') + '</h1>';
  html += '<p>' + esc(sheet ? sheet.month + '/' + sheet.year : '') + '</p><br>';
  
  for (const group of groups) {
    const groupItems = items.filter(i => i.groupId === group.id);
    const groupTotal = groupItems.filter(i => i.active).reduce((sum, i) => sum + (i.amountTotal || 0), 0);
    
    if (group.type === 'section') {
      html += '<h2>' + esc(group.name) + '</h2>';
      html += '<table><thead><tr><th>Item</th><th>Amount</th><th>Breakdown</th></tr></thead><tbody>';
    } else if (group.type === 'subsection') {
      html += '<tr><td colspan="3" style="background:#e8e8e8;font-weight:bold;">' + esc(group.name) + '</td></tr>';
      html += '<tr><td colspan="2" class="numeric">' + formatCurrency(groupTotal, symbol) + '</td><td></td></tr>';
      for (const item of groupItems) {
        if (!item.active) continue;
        html += '<tr><td>' + esc(item.name) + '</td><td class="numeric">' + formatCurrency(item.amountTotal, symbol) + '</td><td>' + esc(item.amountBreakdown || '') + '</td></tr>';
      }
    } else if (group.type === 'summary') {
      let calcValue;
      if (group.name === 'Current Buffer') calcValue = totals.currentBuffer;
      else if (group.name === 'Total Buffer') calcValue = totals.totalBuffer;
      if (calcValue !== undefined) {
        html += '</tbody></table>';
        html += '<table><tr class="calculated"><td>' + esc(group.name) + '</td><td class="numeric">' + formatCurrency(calcValue, symbol) + '</td><td></td></tr></table><br>';
      }
    }
  }
  
  html += '<table><tr class="subtotal"><td><strong>Total Expenses</strong></td><td class="numeric"><strong>' + formatCurrency(totals.totalExpenses, symbol) + '</strong></td><td></td></tr></table>';
  html += '</body></html>';
  
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-sheet.xls';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Excel exported');
};

const exportToPDF = () => {
  window.print();
};

const importData = (input) => {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.version || !data.settings) {
        showToast('Invalid file format');
        return;
      }
      
      if (confirm('This will replace all existing data. Continue?')) {
        appState = {
          settings: data.settings,
          sheets: data.sheets || [],
          groups: data.groups || [],
          items: data.items || [],
          recurringItems: data.recurringItems || [],
          categories: data.categories || [],
          templates: data.templates || [],
          currentSheetId: data.sheets && data.sheets[0] ? data.sheets[0].id : null,
          activeView: 'dashboard'
        };
        
        await clearDB();
        await saveData();
        
        if (appState.currentSheetId) {
          navigate('dashboard');
        }
        
        showToast('Data imported successfully');
      }
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
};

const resetAllData = async () => {
  if (confirm('WARNING: This will delete ALL data. This cannot be undone. Are you sure?')) {
    if (confirm('Really reset everything? Type "yes" to confirm.')) {
      await clearDB();
      localStorage.removeItem(CONSTANTS.STORAGE_KEY);
      appState = {
settings: { currencySymbol: 'R', theme: 'light', defaultView: 'dashboard', defaultTemplate: '', sheetFormat: 'month-year', showCents: true, backupReminder: false, grossIncome: 0, deductions: 0, schemaVersion: CONSTANTS.SCHEMA_VERSION },
        sheets: [],
        groups: [],
        items: [],
        recurringItems: [],
        categories: [],
        templates: [],
        currentSheetId: null,
        activeView: 'dashboard'
      };
      await createDefaultData();
      navigate('dashboard');
      showToast('Data reset');
    }
  }
};

window.navigate = navigate;
window.addSubsectionPrompt = addSubsectionPrompt;
window.confirmAddSubsection = confirmAddSubsection;
window.addItemPrompt = addItemPrompt;
window.confirmAddItem = confirmAddItem;
window.addItemToGroup = addItemToGroup;
window.renameSubsection = renameSubsection;
window.confirmRenameSubsection = confirmRenameSubsection;
window.deleteSubsection = deleteSubsection;
window.updateItemName = updateItemName;
window.updateItemAmount = updateItemAmount;
window.updateItemBreakdown = updateItemBreakdown;
window.toggleItemActive = toggleItemActive;
window.deleteItem = deleteItem;
window.duplicateSheet = duplicateSheet;
window.addCategoryPrompt = addCategoryPrompt;
window.confirmAddCategory = confirmAddCategory;
window.editCategory = editCategory;
window.confirmEditCategory = confirmEditCategory;
window.deleteCategory = deleteCategory;
window.createTemplatePrompt = createTemplatePrompt;
window.confirmCreateTemplate = confirmCreateTemplate;
window.createSheetFromTemplate = createSheetFromTemplate;
window.duplicateTemplate = duplicateTemplate;
window.deleteTemplate = deleteTemplate;
window.exportData = exportData;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;
window.deleteBackup = deleteBackup;
window.exportToExcel = exportToExcel;
window.exportToPDF = exportToPDF;
window.importData = importData;
window.resetAllData = resetAllData;
window.updateSetting = updateSetting;
window.openBackupsTab = function() {
  try { window.parent.postMessage({ source: 'sheetly', type: 'open-backups' }, window.location.origin); } catch (e) {}
};
window.openTemplatesTab = function() {
  try { window.parent.postMessage({ source: 'sheetly', type: 'open-templates' }, window.location.origin); } catch (e) {}
  navigate('templates');
};
window.hideModal = hideModal;
window.confirmDeleteItem = deleteItem;
window.quickAddFromCategory = quickAddFromCategory;
window.addNotePrompt = addNotePrompt;
window.confirmAddNote = confirmAddNote;
window.editNote = editNote;
window.confirmEditNote = confirmEditNote;
window.toggleRecurringActive = (id) => {
  const item = appState.recurringItems.find(r => r.id === id);
  if (item) {
    item.active = !item.active;
    saveData();
    renderNotes();
    showToast(item.active ? 'Activated' : 'Deactivated');
  }
};
window.deleteRecurring = (id) => {
  if (confirm('Delete this note?')) {
    appState.recurringItems = appState.recurringItems.filter(r => r.id !== id);
    saveData();
    renderNotes();
    showToast('Deleted');
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
    renderCurrentView();
    checkBackupReminder();
  } catch (e) {
    console.error('Init error:', e);
    document.getElementById('view-container').innerHTML = '<p>Error loading app. Check console.</p>';
  }
  
  document.getElementById('modal-close').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) hideModal();
  });
  
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.view);
    });
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      hideDropdowns();
    }
  });
  
  const hash = window.location.hash.slice(1);
  if (hash && ['dashboard', 'budget-sheet', 'debts', 'payslip', 'categories', 'templates', 'help', 'settings'].includes(hash)) {
    appState.activeView = hash;
  }
  
  renderCurrentView();
});

document.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  if (hash) {
    appState.activeView = hash;
    renderCurrentView();
  }
});

// ============ Debts (Credit Card / Loan Tracker) ============
const renderDebts = () => {
  if (!Array.isArray(appState.debts)) appState.debts = [];
  const container = document.getElementById('view-container');
  const symbol = appState.settings.currencySymbol;
  const debts = appState.debts;

  const totalBalance = debts.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0);
  const totalLimit = debts.reduce((s, d) => s + (parseFloat(d.limit) || 0), 0);
  const totalMin = debts.reduce((s, d) => s + (parseFloat(d.minPayment) || 0), 0);
  const totalPaid = debts.reduce((s, d) => s + (d.payments || []).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0), 0);

  document.getElementById('top-actions').innerHTML =
    `<button class="btn btn-primary" onclick="openDebtModal()">+ Add Debt</button>`;

  let rows = '';
  if (debts.length === 0) {
    rows = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted,#888)">No debts yet. Click "Add Debt" to get started.</td></tr>`;
  } else {
    rows = debts.map(d => {
      const bal = parseFloat(d.balance) || 0;
      const lim = parseFloat(d.limit) || 0;
      const util = lim > 0 ? Math.min(100, (bal / lim) * 100) : 0;
      const paid = (d.payments || []).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
      return `
        <tr>
          <td class="debt-name"><strong>${esc(d.name)}</strong><br><small style="color:var(--text-muted,#888)">${esc(d.type || 'Credit Card')}</small></td>
          <td data-label="Balance">${formatCurrency(bal, symbol)}</td>
          <td data-label="Limit">${lim > 0 ? formatCurrency(lim, symbol) : '—'}</td>
          <td data-label="Rate">${d.interestRate ? esc(d.interestRate) + '%' : '—'}</td>
          <td data-label="Min. Payment">${d.minPayment ? formatCurrency(d.minPayment, symbol) : '—'}</td>
          <td data-label="Utilisation" class="debt-util">${lim > 0 ? `<div style="background:#eee;border-radius:4px;height:8px;overflow:hidden"><div style="background:${util > 80 ? '#e74c3c' : util > 50 ? '#f39c12' : '#27ae60'};width:${util.toFixed(1)}%;height:100%"></div></div><small>${util.toFixed(0)}% used</small>` : '—'}</td>
          <td class="row-actions">
            <button class="btn btn-ghost btn-sm" onclick="openPaymentModal('${jsAttr(d.id)}')" title="Log payment">$</button>
            <button class="btn btn-ghost btn-sm" onclick="openDebtModal('${jsAttr(d.id)}')" title="Edit">✎</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteDebt('${jsAttr(d.id)}')" title="Delete">×</button>
          </td>
        </tr>

        ${(d.payments && d.payments.length) ? `
        <tr class="debt-payments-row"><td colspan="7" style="background:var(--bg-subtle,#f8f9fa);padding:8px 16px">
          <strong style="font-size:13px">Payment history:</strong>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
            ${d.payments.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p => `
              <span style="background:#fff;border:1px solid #ddd;border-radius:12px;padding:2px 10px;font-size:12px">
                ${formatDate(p.date)} — ${formatCurrency(p.amount, symbol)}
                <a href="#" onclick="deleteDebtPayment('${jsAttr(d.id)}','${jsAttr(p.id)}');return false" style="color:#e74c3c;margin-left:6px;text-decoration:none">×</a>
              </span>
            `).join('')}
          </div>
        </td></tr>` : ''}
      `;
    }).join('');
  }

  container.innerHTML = `
    <h1>Debts</h1>
    <p style="color:var(--text-muted,#666);margin-top:-8px">Track credit cards, loans and other debts. Log payments as you make them.</p>

    <div class="summary-grid income-summary-grid">
      <div class="summary-card">
        <div class="summary-card-label">Total Owed</div>
        <div class="summary-card-value negative">${formatCurrency(totalBalance, symbol)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Total Credit Limit</div>
        <div class="summary-card-value">${formatCurrency(totalLimit, symbol)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Monthly Minimum</div>
        <div class="summary-card-value">${formatCurrency(totalMin, symbol)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Total Paid</div>
        <div class="summary-card-value positive">${formatCurrency(totalPaid, symbol)}</div>
      </div>
    </div>

    <div class="card table-container">
      <div class="card-header"><h2 class="card-title">Your Debts</h2></div>
      <table class="data-table debts-table">
        <thead>
          <tr>
            <th>Name</th><th>Balance</th><th>Limit</th><th>Rate</th><th>Min. Payment</th><th>Utilisation</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="color:var(--text-muted,#666);font-size:var(--font-size-sm);margin-top:8px">
      Tip: Click <strong>$</strong> to log a payment, <strong>✎</strong> to edit, <strong>×</strong> to delete. Payments reduce the balance automatically unless you untick the option.
    </p>
  `;
};

const openDebtModal = (debtId) => {
  const existing = debtId ? (appState.debts || []).find(d => d.id === debtId) : null;
  const d = existing || { id: '', name: '', type: 'Credit Card', balance: 0, limit: 0, interestRate: 0, minPayment: 0, dueDay: '', notes: '' };
  document.getElementById('modal-title').textContent = existing ? 'Edit Debt' : 'Add Debt';
  const presetTypes = ['Credit Card','Personal Loan','Store Card','Overdraft','Vehicle Finance','Home Loan'];
  const isCustom = d.type && !presetTypes.includes(d.type);
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Name</label>
      <input id="dbt-name" type="text" class="form-input" value="${esc(d.name)}" placeholder="e.g. Visa Credit Card">
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <select id="dbt-type" class="form-select" onchange="document.getElementById('dbt-type-custom-wrap').style.display = this.value==='__custom__' ? 'block' : 'none'">
        ${presetTypes.map(t => `<option ${d.type===t?'selected':''}>${t}</option>`).join('')}
        <option value="__custom__" ${isCustom?'selected':''}>Custom…</option>
      </select>
    </div>
    <div class="form-group" id="dbt-type-custom-wrap" style="display:${isCustom?'block':'none'}">
      <label class="form-label">Custom Type</label>
      <input id="dbt-type-custom" type="text" class="form-input" value="${esc(isCustom ? d.type : '')}" placeholder="e.g. Family Loan">
    </div>
    <div class="form-group">
      <label class="form-label">Current Balance Owed</label>
      <input id="dbt-balance" type="number" step="0.01" class="form-input currency" value="${d.balance || 0}">
    </div>
    <div class="form-group">
      <label class="form-label">Credit Limit (optional)</label>
      <input id="dbt-limit" type="number" step="0.01" class="form-input currency" value="${d.limit || 0}">
    </div>
    <div class="form-group">
      <label class="form-label">Interest Rate % (optional)</label>
      <input id="dbt-rate" type="number" step="0.01" class="form-input" value="${d.interestRate || 0}">
    </div>
    <div class="form-group">
      <label class="form-label">Minimum Monthly Payment</label>
      <input id="dbt-min" type="number" step="0.01" class="form-input currency" value="${d.minPayment || 0}">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea id="dbt-notes" rows="2" class="form-textarea">${esc(d.notes || '')}</textarea>
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveDebt('${jsAttr(debtId || '')}')">${existing ? 'Save' : 'Add'}</button>
  `;
  document.getElementById('modal-overlay').classList.remove('hidden');
};

const saveDebt = (debtId) => {
  if (!Array.isArray(appState.debts)) appState.debts = [];
  const data = {
    name: (document.getElementById('dbt-name').value || '').trim(),
    type: (document.getElementById('dbt-type').value === '__custom__' ? ((document.getElementById('dbt-type-custom').value || '').trim().slice(0, 50) || 'Other') : document.getElementById('dbt-type').value),
    balance: parseFloat(document.getElementById('dbt-balance').value) || 0,
    limit: parseFloat(document.getElementById('dbt-limit').value) || 0,
    interestRate: parseFloat(document.getElementById('dbt-rate').value) || 0,
    minPayment: parseFloat(document.getElementById('dbt-min').value) || 0,
    notes: (document.getElementById('dbt-notes').value || '').trim().slice(0, 500)
  };
  if (!data.name) { showToast('Name is required'); return; }
  if (data.name.length > 100) data.name = data.name.slice(0, 100);

  if (debtId) {
    const idx = appState.debts.findIndex(x => x.id === debtId);
    if (idx >= 0) appState.debts[idx] = { ...appState.debts[idx], ...data };
  } else {
    appState.debts.push({ id: generateId(), payments: [], createdAt: new Date().toISOString(), ...data });
  }
  saveData();
  hideModal();
  renderDebts();
  showToast('Debt saved');
};

const deleteDebt = (debtId) => {
  if (!confirm('Delete this debt and all its payment history?')) return;
  appState.debts = (appState.debts || []).filter(d => d.id !== debtId);
  saveData();
  renderDebts();
  showToast('Debt deleted');
};

const openPaymentModal = (debtId) => {
  const debt = (appState.debts || []).find(d => d.id === debtId);
  if (!debt) return;
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('modal-title').textContent = 'Log Payment — ' + debt.name;
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label class="form-label" for="pay-amount">Amount paid</label>
      <input id="pay-amount" type="number" step="0.01" class="form-input currency" value="${debt.minPayment || 0}">
    </div>
    <div class="form-group">
      <label class="form-label" for="pay-date">Payment date</label>
      <input id="pay-date" type="date" class="form-input" value="${today}">
    </div>
    <div class="form-group">
      <label class="form-label" style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer">
        <input id="pay-reduce" type="checkbox" checked style="width:auto;margin:0"> Reduce balance by this amount
      </label>
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveDebtPayment('${jsAttr(debtId)}')">Log Payment</button>
  `;
  document.getElementById('modal-overlay').classList.remove('hidden');
};

const saveDebtPayment = (debtId) => {
  const debt = (appState.debts || []).find(d => d.id === debtId);
  if (!debt) return;
  const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
  const date = document.getElementById('pay-date').value || new Date().toISOString().slice(0, 10);
  const reduce = document.getElementById('pay-reduce').checked;
  if (amount <= 0) { showToast('Enter a positive amount'); return; }
  debt.payments = debt.payments || [];
  debt.payments.push({ id: generateId(), amount, date });
  if (reduce) debt.balance = Math.max(0, (parseFloat(debt.balance) || 0) - amount);
  saveData();
  hideModal();
  renderDebts();
  showToast('Payment logged');
};

const deleteDebtPayment = (debtId, paymentId) => {
  const debt = (appState.debts || []).find(d => d.id === debtId);
  if (!debt || !debt.payments) return;
  if (!confirm('Delete this payment? (Balance will not be restored automatically.)')) return;
  debt.payments = debt.payments.filter(p => p.id !== paymentId);
  saveData();
  renderDebts();
};

// ============ Payslip Reference ============
const PAYSLIP_CATEGORIES = [
  { key: 'allowance', label: 'Allowances' },
  { key: 'deduction', label: 'Deductions' },
  { key: 'contribution', label: 'Company Contributions' },
  { key: 'fringe', label: 'Fringe Benefits' }
];

// Legacy categories from earlier versions.
const normalisePayslipCategory = (c) => (c === 'earning' ? 'allowance' : (c === 'info' ? 'fringe' : (c || 'allowance')));

const payslipTotals = (ps) => {
  const lines = (ps.lines || []);
  const sum = (k) => lines.filter(l => normalisePayslipCategory(l.category) === k).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const allowances = sum('allowance');
  const deductions = sum('deduction');
  return { allowances, deductions, contributions: sum('contribution'), fringe: sum('fringe'), net: allowances - deductions };
};

const renderPayslip = () => {
  if (!Array.isArray(appState.payslips)) appState.payslips = [];
  const container = document.getElementById('view-container');
  const symbol = appState.settings.currencySymbol;
  document.getElementById('top-actions').innerHTML =
    `<button class="btn btn-primary" onclick="openPayslipModal()">Add Payslip</button>`;

  let html = `<h1>Payslip</h1>
    <p class="mb-md" style="color:var(--color-text-secondary);">Fill in the standard fields from your payslip — allowances, deductions, company contributions and fringe benefits. Everything saves as you type, so you only need to do this when you start a new job.</p>`;

  if (appState.payslips.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-state-icon">🧾</div>
      <div class="empty-state-title">No payslips captured</div>
      <p>Click <strong>Add Payslip</strong> to start filling in your payslip details.</p>
    </div>`;
    container.innerHTML = html;
    return;
  }

  for (const ps of appState.payslips) {
    const t = payslipTotals(ps);
    html += `<div class="card mb-md">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <div>
          <h2 style="margin:0;">${esc(ps.employer || 'Payslip')}</h2>
          <div style="color:var(--color-text-secondary);font-size:0.85rem;">
            ${ps.employeeNo ? 'Employee ' + esc(ps.employeeNo) : ''}${ps.payDate ? (ps.employeeNo ? ' · ' : '') + 'Paid on the ' + esc(ps.payDate) : ''}
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" onclick="openPayslipModal('${jsAttr(ps.id)}')" title="Edit details">✎</button>
          <button class="btn btn-ghost btn-sm" onclick="deletePayslip('${jsAttr(ps.id)}')" title="Delete payslip">×</button>
        </div>
      </div>
      <div class="summary-grid income-summary-grid">
        <div class="summary-card"><div class="summary-card-label">Allowances</div><div class="summary-card-value">${formatCurrency(t.allowances, symbol)}</div></div>
        <div class="summary-card"><div class="summary-card-label">Deductions</div><div class="summary-card-value">${formatCurrency(t.deductions, symbol)}</div></div>
        <div class="summary-card"><div class="summary-card-label">Total Net Pay</div><div class="summary-card-value">${formatCurrency(t.net, symbol)}</div></div>
        <div class="summary-card"><div class="summary-card-label">Company Contributions</div><div class="summary-card-value">${formatCurrency(t.contributions, symbol)}</div></div>
      </div>`;

    for (const cat of PAYSLIP_CATEGORIES) {
      const lines = (ps.lines || []).filter(l => normalisePayslipCategory(l.category) === cat.key);
      html += `<h3 style="margin-top:var(--spacing-lg);">${esc(cat.label)}</h3>
        <div class="table-container"><table class="data-table payslip-table"><thead><tr>
          <th>Description</th><th class="numeric">Amount</th><th>Notes</th><th></th>
        </tr></thead><tbody>`;
      for (const l of lines) {
        html += `<tr>
          <td data-label="Description"><input type="text" class="form-input" value="${esc(l.description || '')}" placeholder="Description"
            onchange="updatePayslipLine('${jsAttr(ps.id)}','${jsAttr(l.id)}','description',this.value)"></td>
          <td class="numeric" data-label="Amount"><input type="number" step="0.01" class="form-input currency-input" value="${esc(l.amount)}"
            onchange="updatePayslipLine('${jsAttr(ps.id)}','${jsAttr(l.id)}','amount',this.value)"></td>
          <td data-label="Notes"><input type="text" class="form-input" value="${esc(l.notes || '')}" placeholder="Optional"
            onchange="updatePayslipLine('${jsAttr(ps.id)}','${jsAttr(l.id)}','notes',this.value)"></td>
          <td class="row-actions">
            <button class="btn btn-ghost btn-sm" onclick="deletePayslipLine('${jsAttr(ps.id)}','${jsAttr(l.id)}')" title="Remove line">×</button>
          </td>
        </tr>`;
      }
      if (lines.length === 0) {
        html += `<tr><td colspan="4" style="color:var(--color-text-secondary);">Nothing added yet.</td></tr>`;
      }
      html += `</tbody></table></div>
        <button class="btn btn-secondary btn-sm mt-sm" onclick="addPayslipLine('${jsAttr(ps.id)}','${jsAttr(cat.key)}')">+ Add ${esc(cat.label.replace(/s$/, ''))}</button>`;
    }

    html += `<h3 style="margin-top:var(--spacing-lg);">Notes</h3>
      <textarea class="form-textarea" rows="4" placeholder="Anything else standard on your payslip"
        onchange="updatePayslipNotes('${jsAttr(ps.id)}',this.value)">${esc(ps.notes || '')}</textarea>`;

    html += `<div class="summary-card mt-md"><div class="summary-card-label">Total Net Pay</div>
      <div class="summary-card-value">${formatCurrency(t.net, symbol)}</div></div>`;
    html += `</div>`;
  }

  container.innerHTML = html;
};

window.addPayslipLine = async (psId, category) => {
  const ps = (appState.payslips || []).find(p => p.id === psId);
  if (!ps) return;
  if (!Array.isArray(ps.lines)) ps.lines = [];
  ps.lines.push({ id: generateId(), category, description: '', amount: 0, notes: '' });
  await saveData();
  renderPayslip();
};

window.updatePayslipLine = async (psId, lineId, field, value) => {
  const ps = (appState.payslips || []).find(p => p.id === psId);
  if (!ps) return;
  const line = (ps.lines || []).find(l => l.id === lineId);
  if (!line) return;
  line[field] = field === 'amount' ? (parseFloat(value) || 0) : value;
  await saveData();
  renderPayslip();
};

window.updatePayslipNotes = async (psId, value) => {
  const ps = (appState.payslips || []).find(p => p.id === psId);
  if (!ps) return;
  ps.notes = value;
  await saveData();
  showToast('Payslip saved');
};

window.openPayslipModal = (id) => {
  const ps = (appState.payslips || []).find(p => p.id === id);
  showModal(ps ? 'Edit Payslip' : 'Add Payslip', `
    <div class="form-group">
      <label class="form-label">Employer</label>
      <input type="text" class="form-input" id="ps-employer" value="${esc(ps ? ps.employer : '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Employee number</label>
      <input type="text" class="form-input" id="ps-empno" value="${esc(ps ? ps.employeeNo : '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Date I get paid</label>
      <input type="text" class="form-input" id="ps-paydate" placeholder="e.g. 25th of every month" value="${esc(ps ? ps.payDate : '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="ps-notes" rows="3">${esc(ps ? ps.notes : '')}</textarea>
    </div>
  `, `<button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePayslip('${jsAttr(id || '')}')">Save</button>`);
};

window.savePayslip = async (id) => {
  const employer = document.getElementById('ps-employer').value.trim();
  if (!employer) { showToast('Enter an employer'); return; }
  const payload = {
    employer,
    employeeNo: document.getElementById('ps-empno').value.trim(),
    payDate: document.getElementById('ps-paydate').value.trim(),
    notes: document.getElementById('ps-notes').value
  };
  if (!Array.isArray(appState.payslips)) appState.payslips = [];
  const existing = appState.payslips.find(p => p.id === id);
  if (existing) {
    Object.assign(existing, payload, { updatedAt: new Date().toISOString() });
  } else {
    appState.payslips.unshift({ id: generateId(), ...payload, lines: [], createdAt: new Date().toISOString() });
  }
  await saveData();
  hideModal();
  renderPayslip();
  showToast('Payslip saved');
};

window.deletePayslip = async (id) => {
  if (!confirm('Delete this payslip and all its lines?')) return;
  appState.payslips = (appState.payslips || []).filter(p => p.id !== id);
  await saveData();
  renderPayslip();
  showToast('Payslip deleted');
};


window.deletePayslipLine = async (psId, lineId) => {
  const ps = (appState.payslips || []).find(p => p.id === psId);
  if (!ps) return;
  ps.lines = (ps.lines || []).filter(l => l.id !== lineId);
  await saveData();
  renderPayslip();
  showToast('Line deleted');
};

window.renderPayslip = renderPayslip;
