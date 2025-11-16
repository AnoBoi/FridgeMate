// Fridge.js (fixed: adds missing View Database modal + listener variables)
// NOTE: replace your existing file with this content (keeps all your previous behaviours + history logging)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  where,
  getDoc,
  limit
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

/* -------------------- Firebase init -------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAp7TebsGhYqoMv6IER8XZ-fwyqwi9KGt4",
  authDomain: "fridge-mate-31e97.firebaseapp.com",
  projectId: "fridge-mate-31e97",
  storageBucket: "fridge-mate-31e97.firebasestorage.app",
  messagingSenderId: "543736415860",
  appId: "1:543736415860:web:312b6729c79af1221d7321"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* -------------------- helpers -------------------- */
function getFridgeIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

/**
 * Attempts to determine the current user's display name.
 * Priority:
 *  - window.currentUserName (you can set this after your auth code)
 *  - window.appCurrentUser?.displayName (if you set appCurrentUser)
 *  - 'Unknown'
 */
function getCurrentUserName() {
  try {
    return userDisplayName;
  } catch (e) {
    // ignore
  }
  return 'Unknown';
}

let userUID = null;
let userDisplayName = null
// Listen for auth changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    userUID = user.uid;
    userDisplayName = user.displayName;
  } else {
    userUID = null;
  }
});

/**
 * Basic product-name sanitisation for searching:
 * - Trim
 * - Collapse multiple spaces
 * - Remove punctuation (keeps letters/numbers/spaces)
 * - Remove diacritics
 * - Lowercase
 */
function sanitizeName(str) {
  if (!str) return '';
  let s = String(str).trim().normalize ? str.normalize('NFD') : str;
  s = s.replace(/\p{Diacritic}/gu, '').toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s]/gu, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function formatCurrency(price) {
  if (price === null || price === undefined) return 'Price: —';
  if (typeof price !== 'number') {
    const n = Number(price);
    if (Number.isFinite(n)) price = n;
    else return 'Price: —';
  }
  // Basic USD formatting. Change as needed.
  return `Price: $${price.toFixed(2)}`;
}

/**
 * Returns a human-friendly relative string *from now* for the supplied date-like value.
 * Examples: "3 days left", "6 days ago", "2 hours left", "today".
 */
function relativeTimeBetween(d) {
  if (!d) return '';
  const dateObj = (d.toDate) ? d.toDate() : new Date(d);
  const now = new Date();
  const diffMs = Math.floor((dateObj.getTime() - now.getTime())); // positive => future
  const abs = Math.abs(diffMs);

  const seconds = Math.floor(abs / 1000);
  if (seconds < 60) return diffMs >= 0 ? `${seconds} second${seconds === 1 ? '' : 's'} left` : `${seconds} second${seconds === 1 ? '' : 's'} ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return diffMs >= 0 ? `${minutes} minute${minutes === 1 ? '' : 's'} left` : `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return diffMs >= 0 ? `${hours} hour${hours === 1 ? '' : 's'} left` : `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return diffMs >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return diffMs >= 0 ? `${months} month${months === 1 ? '' : 's'} left` : `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(months / 12);
  return diffMs >= 0 ? `${years} year${years === 1 ? '' : 's'} left` : `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Returns a short date + relative suffix using your existing formatDate().
 * Example: "11/18/2025 (3 days left)"
 */
function formatDateWithRelative(d) {
  if (!d) return '—';
  const dateObj = (d.toDate) ? d.toDate() : new Date(d);
  const dateStr = formatDate(d);
  const rel = relativeTimeBetween(d);
  return `${dateStr} (${rel})`;
}

function timeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const d = (date.toDate) ? date.toDate() : new Date(date);
  const seconds = Math.floor((now - d) / 1000);
  if (seconds < 60) return `${seconds} second${seconds===1?'':'s'} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes===1?'':'s'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours===1?'':'s'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days===1?'':'s'} ago`;
  // fallback to absolute date for older items
  return d.toLocaleDateString();
}

function formatDate(d) {
  if (!d) return '—';
  const dateObj = (d.toDate) ? d.toDate() : new Date(d);
  return dateObj.toLocaleDateString();
}

/* -------------------- History logging -------------------- */
/**
 * Writes a history entry to Fridges/<fridgeId>/History.
 * Fields: { userName, change (string), createdAt }
 */
async function logFridgeHistory(fridgeId, changeText, opts = {}) {
  if (!fridgeId) {
    console.warn('logFridgeHistory: missing fridgeId, skipping.');
    return;
  }
  try {
    const fridgeDocRef = doc(db, 'Fridges', fridgeId);
    const historyColRef = collection(fridgeDocRef, 'History');
    const entry = {
      userName: opts.userName || getCurrentUserName(),
      change: changeText || '—',
      createdAt: serverTimestamp(),
      meta: opts.meta || null
    };
    await addDoc(historyColRef, entry);
  } catch (err) {
    console.error('Failed to log fridge history:', err);
  }
}

/* -------------------- Firestore writes (unchanged except adding history where relevant) -------------------- */
async function addProductToDatabase(productName, price) {
  const fridgeId = getFridgeIdFromUrl();
  if (!fridgeId) throw new Error('Missing fridge id in URL (expected ?id=...)');

  const fridgeDocRef = doc(db, 'Fridges', fridgeId);
  const databaseColRef = collection(fridgeDocRef, 'Database');

  const parsedPrice = (price === '' || price === null || price === undefined)
    ? null
    : Number(price);

  const data = {
    productName: productName || '',
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    createdAt: serverTimestamp()
  };

  const newDocRef = await addDoc(databaseColRef, data);

  // Log to history: added to database (optional, helps trace)
  try {
    const fridgeIdLocal = fridgeId;
    const userName = getCurrentUserName();
    const priceText = (data.price !== null) ? `$${Number(data.price).toFixed(2)}` : 'Price: —';
    await logFridgeHistory(fridgeIdLocal, `Added product to Database: ${data.productName} (${priceText})`, { userName, meta: { type: 'db_add', dbId: newDocRef.id } });
  } catch (e) {
    console.warn('History log after addProductToDatabase failed:', e);
  }

  return newDocRef.id;
}

/* -------------------- UI wiring (keeps your existing UI behaviour) -------------------- */
const fridgeCameraBtn = document.getElementById('fridgeCameraBtn');
const fridgePhoto = document.getElementById('fridgePhoto');
if (fridgeCameraBtn && fridgePhoto) {
  fridgeCameraBtn.addEventListener('click', () => fridgePhoto.click());
}

const barcodeCameraBtn = document.getElementById('barcodeCameraBtn');
const barcodeFile = document.getElementById('barcodeFile');
const barcodeFileName = document.getElementById('barcodeFileName');
if (barcodeCameraBtn && barcodeFile) {
  barcodeCameraBtn.addEventListener('click', () => barcodeFile.click());
  barcodeFile.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (barcodeFileName) barcodeFileName.textContent = f ? f.name : 'No file chosen';
  });
}

const fridgeQty = document.getElementById('fridgeQuantity');
const dbAddAndFridgeBtn = document.getElementById('dbAddAndFridge');
const updateDbAddLabel = () => {
  const val = (fridgeQty && fridgeQty.value) ? parseInt(fridgeQty.value, 10) : 1;
  const safe = (Number.isInteger(val) && val > 0) ? val : 1;
  if (dbAddAndFridgeBtn) dbAddAndFridgeBtn.textContent = `Add to Database & Fridge (qt: ${safe})`;
};
if (fridgeQty) {
  fridgeQty.addEventListener('input', updateDbAddLabel);
  updateDbAddLabel();
}

// --- Invite / allowedUsers wiring ---
const inviteForm = document.getElementById('inviteForm');
const inviteUidInput = document.getElementById('inviteUidInput');

if (inviteForm && inviteUidInput) {
  inviteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const uid = (inviteUidInput.value || '').trim();
    if (!uid) {
      showAlert('Please enter a UID to invite.', 'error');
      return;
    }

    const fridgeId = getFridgeIdFromUrl();
    if (!fridgeId) {
      showAlert('Missing fridge id in URL; expected ?id=FRIDGE_ID', 'error');
      return;
    }

    const addBtn = document.getElementById('inviteAddBtn');
    if (addBtn) addBtn.disabled = true;

    try {
      const fridgeDocRef = doc(db, 'Fridges', fridgeId);

      // Add the uid as a key inside the 'allowedUsers' map.
      // This will set: allowedUsers.<uid> = true
      // If you prefer to store more meta, replace `true` with an object.
      await updateDoc(fridgeDocRef, { [`allowedUsers.${uid}`]: true });

      showAlert(`User ${uid} added to allowedUsers.`, 'success');
      inviteUidInput.value = '';
    } catch (err) {
      console.error('Failed to add allowed user:', err);
      showAlert(err.message || 'Failed to add user to fridge.', 'error');
    } finally {
      if (addBtn) addBtn.disabled = false;
    }
  });
}

/* -------------------- Form handlers that write to Firestore -------------------- */
function showAlert(message, kind = 'info') {
  alert(`${kind.toUpperCase()}: ${message}`);
}

const dbForm = document.getElementById('dbForm');
if (dbForm) {
  dbForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = dbForm.querySelector('button[type="submit"]');
    const productInput = document.getElementById('dbProductName');
    const priceInput = document.getElementById('dbPrice');

    const productName = productInput ? productInput.value.trim() : '';
    const priceVal = priceInput ? priceInput.value.trim() : '';

    if (!productName) {
      showAlert('Please enter a product name.', 'error');
      return;
    }

    if (priceVal !== '' && Number.isNaN(Number(priceVal))) {
      showAlert('Price must be a number (or left empty).', 'error');
      return;
    }

    if (btn) btn.disabled = true;

    try {
      const newId = await addProductToDatabase(productName, priceVal);
      showAlert(`Saved to database (id: ${newId}).`, 'success');
      if (productInput) productInput.value = '';
      if (priceInput) priceInput.value = '';
    } catch (err) {
      console.error('Error adding to DB:', err);
      showAlert(err.message || 'Failed to add to database.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

const dbAddAndFridge = document.getElementById('dbAddAndFridge');
if (dbAddAndFridge) {
  dbAddAndFridge.addEventListener('click', async () => {
    const dbProductInput = document.getElementById('dbProductName');
    const fridgeProductInput = document.getElementById('fridgeProductName');
    const dbPriceInput = document.getElementById('dbPrice');

    const productName = (dbProductInput && dbProductInput.value.trim())
      ? dbProductInput.value.trim()
      : (fridgeProductInput ? fridgeProductInput.value.trim() : '');

    const priceVal = dbPriceInput ? dbPriceInput.value.trim() : '';

    if (!productName) {
      showAlert('Please enter a product name (either in Database or Fridge form).', 'error');
      return;
    }

    if (priceVal !== '' && Number.isNaN(Number(priceVal))) {
      showAlert('Price must be a number (or left empty).', 'error');
      return;
    }

    dbAddAndFridge.disabled = true;
    try {
      const newId = await addProductToDatabase(productName, priceVal);
      showAlert(`Saved to database (id: ${newId}).`, 'success');
    } catch (err) {
      console.error('Error adding to DB & Fridge:', err);
      showAlert(err.message || 'Failed to add to database.', 'error');
    } finally {
      dbAddAndFridge.disabled = false;
    }
  });
}

/* -------------------- Add to Fridge (search Database, then add to Inventory) -------------------- */
const fridgeForm = document.getElementById('fridgeForm');
if (fridgeForm) {
  fridgeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = fridgeForm.querySelector('button[type="submit"]');
    const productInput = document.getElementById('fridgeProductName');
    const qtyInput = document.getElementById('fridgeQuantity');
    const expiryInput = document.getElementById('fridgeExpiry');

    const rawProduct = productInput ? productInput.value.trim() : '';
    if (!rawProduct) {
      showAlert('Please enter a product name.', 'error');
      return;
    }

    let qty = 1;
    if (qtyInput && qtyInput.value !== '') {
      const parsed = parseInt(qtyInput.value, 10);
      qty = (Number.isInteger(parsed) && parsed > 0) ? parsed : 1;
    }

    const expiryVal = expiryInput ? expiryInput.value : '';

    if (submitBtn) submitBtn.disabled = true;

    try {
      const fridgeId = getFridgeIdFromUrl();
      if (!fridgeId) {
        throw new Error('Missing fridge id in URL; expected ?id=FRIDGE_ID');
      }

      const fridgeDocRef = doc(db, 'Fridges', fridgeId);
      const databaseColRef = collection(fridgeDocRef, 'Database');

      const snapshot = await getDocs(databaseColRef);
      if (snapshot.empty) {
        showAlert('No products found in this fridge database. Add the product to Database first.', 'error');
        return;
      }

      const targetSan = sanitizeName(rawProduct);
      let matchedDoc = null;

      snapshot.forEach(d => {
        const dData = d.data() || {};
        const candidateName = dData.productName || '';
        if (sanitizeName(candidateName) === targetSan && !matchedDoc) {
          matchedDoc = { id: d.id, data: dData };
        }
      });

      if (!matchedDoc) {
        showAlert('Product not found in Database (try adding it first or check spelling).', 'error');
        return;
      }

      const inventoryColRef = collection(fridgeDocRef, 'Inventory');

      const inventoryData = {
        productId: matchedDoc.id,
        productName: matchedDoc.data.productName || rawProduct,
        price: (matchedDoc.data.price !== undefined && matchedDoc.data.price !== null)
          ? matchedDoc.data.price
          : null,
        quantity: qty,
        addedAt: serverTimestamp(),
        expiry: null
      };

      if (expiryVal) {
        const d = new Date(expiryVal);
        if (!Number.isNaN(d.getTime())) {
          inventoryData.expiry = Timestamp.fromDate(d);
        }
      }

      const newInvRef = await addDoc(inventoryColRef, inventoryData);

      showAlert(`Added to fridge inventory (id: ${newInvRef.id})`, 'success');

      // --- NEW: log this inventory addition to Fridge History
      try {
        const userName = getCurrentUserName();
        const changeText = `Added ${inventoryData.quantity} × ${inventoryData.productName}`;
        await logFridgeHistory(fridgeId, changeText, { userName, meta: { type: 'inventory_add', invId: newInvRef.id, productId: matchedDoc.id } });
      } catch (e) {
        console.warn('Failed to log history for inventory add:', e);
      }

      if (productInput) productInput.value = '';
      if (qtyInput) qtyInput.value = '';
      if (expiryInput) expiryInput.value = '';
    } catch (err) {
      console.error('Error adding to fridge inventory:', err);
      showAlert(err.message || 'Failed to add to fridge inventory.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* -------------------- NEW: Fridge History modal & logic -------------------- */

let viewHistoryModalInstance = null;
let unsubscribeHistoryListener = null;

function ensureViewHistoryModalExists() {
  let existing = document.getElementById('viewHistoryModal');
  if (existing) return existing;

  const tpl = document.createElement('div');
  tpl.innerHTML = `
  <div class="modal fade" id="viewHistoryModal" tabindex="-1" aria-labelledby="viewHistoryModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="viewHistoryModalLabel">Fridge History</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div id="viewHistoryAlert" class="small text-danger d-none"></div>
          <div id="viewHistoryList" class="d-flex gap-3 overflow-auto py-2">
            <div class="text-muted">Loading…</div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>
  `.trim();

  const modalEl = tpl.firstElementChild;
  document.body.appendChild(modalEl);
  return modalEl;
}

function createHistoryCard(docId, data) {
  // horizontal card with fixed min-width for nicer horizontal scrolling
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.style.minWidth = '280px';
  wrapper.style.maxWidth = '380px';
  wrapper.style.flex = '0 0 auto';

  const body = document.createElement('div');
  body.className = 'card-body';

  const top = document.createElement('div');
  top.className = 'd-flex justify-content-between align-items-start';

  const left = document.createElement('div');

  const who = document.createElement('div');
  who.className = 'fw-semibold';
  who.textContent = data.userName || 'Unknown';

  const when = document.createElement('div');
  when.className = 'small text-muted';
  when.textContent = data.createdAt ? timeAgo(data.createdAt) : '—';

  left.appendChild(who);
  left.appendChild(when);

  const right = document.createElement('div');
  right.className = 'small text-muted text-end';
  // optionally show meta type shorthand
  if (data.meta && data.meta.type) {
    right.textContent = data.meta.type.replace('_', ' ');
  }

  top.appendChild(left);
  top.appendChild(right);

  const changeDiv = document.createElement('div');
  changeDiv.className = 'mt-2';
  changeDiv.textContent = data.change || '—';

  body.appendChild(top);
  body.appendChild(changeDiv);
  wrapper.appendChild(body);

  return wrapper;
}

function startHistoryListener(listContainer) {
  const fridgeId = getFridgeIdFromUrl();
  if (!fridgeId) {
    listContainer.innerHTML = '<div class="text-danger">Missing fridge id in URL. Cannot load history.</div>';
    return;
  }

  const fridgeDocRef = doc(db, 'Fridges', fridgeId);
  const historyColRef = collection(fridgeDocRef, 'History');
  const q = query(historyColRef, orderBy('createdAt', 'desc'), limit(200));

  if (unsubscribeHistoryListener) {
    try { unsubscribeHistoryListener(); } catch (e) { /* ignore */ }
    unsubscribeHistoryListener = null;
  }

  listContainer.innerHTML = '<div class="text-muted">Loading…</div>';

  unsubscribeHistoryListener = onSnapshot(q, (snapshot) => {
    listContainer.innerHTML = '';
    if (snapshot.empty) {
      listContainer.innerHTML = '<div class="text-muted">No history yet.</div>';
      return;
    }

    snapshot.forEach(docSnap => {
      const d = docSnap.data() || {};
      const card = createHistoryCard(docSnap.id, d);
      listContainer.appendChild(card);
    });
  }, (err) => {
    console.error('History listener error:', err);
    listContainer.innerHTML = `<div class="text-danger">Failed to load history: ${err.message}</div>`;
  });
}

function stopHistoryListener() {
  if (unsubscribeHistoryListener) {
    try { unsubscribeHistoryListener(); } catch (e) {}
    unsubscribeHistoryListener = null;
  }
}

// wire the "View Fridge History" button (id: viewFridgeHistoryBtn)
const viewFridgeHistoryBtn = document.getElementById('viewFridgeHistoryBtn');
if (viewFridgeHistoryBtn) {
  viewFridgeHistoryBtn.addEventListener('click', () => {
    const modalEl = ensureViewHistoryModalExists();
    if (!viewHistoryModalInstance) viewHistoryModalInstance = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    viewHistoryModalInstance.show();

    const listContainer = modalEl.querySelector('#viewHistoryList');
    if (listContainer) startHistoryListener(listContainer);

    modalEl.addEventListener('hidden.bs.modal', function onHidden() {
      stopHistoryListener();
      modalEl.removeEventListener('hidden.bs.modal', onHidden);
    });
  });
}

/* -------------------- Modal wiring (existing edit modal) -------------------- */
const editModalEl = document.getElementById('editQuantityModal');
let editModalInstance = null;
if (editModalEl && window.bootstrap) {
  editModalInstance = new bootstrap.Modal(editModalEl, { backdrop: 'static' });
}

function openEditModal(itemId, data = {}) {
  const idInput = document.getElementById('editItemId');
  const nameDiv = document.getElementById('editItemName');
  const qtyInput = document.getElementById('editQuantityInput');
  const alertDiv = document.getElementById('editModalAlert');

  if (!idInput || !nameDiv || !qtyInput) {
    console.warn('Edit modal elements not found.');
    return;
  }

  idInput.value = itemId || '';
  nameDiv.textContent = data.productName || 'Unnamed';
  const q = (data.quantity !== undefined && data.quantity !== null) ? data.quantity : 1;
  qtyInput.value = q;
  alertDiv.classList.add('d-none');
  alertDiv.textContent = '';

  // show modal
  if (editModalInstance) {
    editModalInstance.show();
    // focus the input after show (small timer to ensure element is visible)
    setTimeout(() => qtyInput.select(), 200);
  } else {
    console.warn('Bootstrap modal instance not available.');
  }
}

async function saveEditQuantity(evt) {
  evt.preventDefault();
  const idInput = document.getElementById('editItemId');
  const qtyInput = document.getElementById('editQuantityInput');
  const alertDiv = document.getElementById('editModalAlert');

  if (!idInput || !qtyInput) return;

  const itemId = idInput.value;
  const raw = qtyInput.value;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    alertDiv.textContent = 'Please enter a valid quantity (0 or greater).';
    alertDiv.classList.remove('d-none');
    return;
  }

  try {
    const fridgeId = getFridgeIdFromUrl();
    if (!fridgeId) throw new Error('Missing fridge id in URL (expected ?id=...)');

    // Document reference for inventory item
    const invDocRef = doc(db, 'Fridges', fridgeId, 'Inventory', itemId);

    // get existing snapshot so we can log the "before" state
    const existingSnap = await getDoc(invDocRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    if (parsed === 0) {
      // delete the inventory doc
      await deleteDoc(invDocRef);
      showAlert('Item removed from inventory.', 'success');

      // log deletion
      try {
        const userName = getCurrentUserName();
        const productName = existingData ? (existingData.productName || 'Unnamed') : 'Unnamed';
        const prevQty = existingData ? (existingData.quantity ?? '—') : '—';
        await logFridgeHistory(fridgeId, `Removed ${productName} (previous qty: ${prevQty})`, { userName, meta: { type: 'inventory_remove', invId: itemId } });
      } catch (e) {
        console.warn('Failed to log history for inventory removal:', e);
      }

    } else {
      // update quantity field only
      await updateDoc(invDocRef, { quantity: parsed });
      showAlert('Quantity updated.', 'success');

      // log change (show previous -> new)
      try {
        const userName = getCurrentUserName();
        const productName = existingData ? (existingData.productName || 'Unnamed') : 'Unnamed';
        const prevQty = existingData ? (existingData.quantity ?? '—') : '—';
        await logFridgeHistory(fridgeId, `Updated ${productName} quantity from ${prevQty} to ${parsed}`, { userName, meta: { type: 'inventory_update', invId: itemId } });
      } catch (e) {
        console.warn('Failed to log history for inventory update:', e);
      }
    }

    // close modal
    if (editModalInstance) editModalInstance.hide();
  } catch (err) {
    console.error('Failed to save edited quantity:', err);
    alertDiv.textContent = err.message || 'Failed to save changes.';
    alertDiv.classList.remove('d-none');
  }
}

const editQuantityForm = document.getElementById('editQuantityForm');
if (editQuantityForm) {
  editQuantityForm.addEventListener('submit', saveEditQuantity);
}

/* -------------------- Inventory rendering (modified to open modal) -------------------- */
function createInventoryCard(docId, data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card mb-2';

  const body = document.createElement('div');
  body.className = 'card-body d-flex align-items-center justify-content-between';

  const left = document.createElement('div');
  left.className = 'd-flex align-items-baseline';

  const qtyDisplay = (data.quantity !== undefined && data.quantity !== null) ? data.quantity : 1;
  const title = document.createElement('h5');
  title.className = 'mb-0 me-3';
  title.textContent = `${data.productName || 'Unnamed'} (${qtyDisplay})`;

  const small = document.createElement('div');
  small.className = 'small';

  const priceSpan = document.createElement('span');
  priceSpan.textContent = formatCurrency(data.price);

  const metaSpan = document.createElement('span');
  metaSpan.className = 'text-muted ms-2';
  const addedAtText = data.addedAt ? timeAgo(data.addedAt) : '';
  metaSpan.textContent = addedAtText ? `Added ${addedAtText}` : '';

  const expirySpan = document.createElement('div');
  if (data.expiry) {
    const expiryDate = (data.expiry.toDate) ? data.expiry.toDate() : new Date(data.expiry);
    const now = new Date();
    const isExpired = expiryDate < now;

    expirySpan.className = `small ${isExpired ? 'text-danger' : 'text-primary'} ms-3`;
    // Use the helper to produce "MM/DD/YYYY (N days left)" style text.
    expirySpan.textContent = `${isExpired ? 'Expired' : 'Expires'}: ${formatDateWithRelative(data.expiry)}`;
  }


  small.appendChild(priceSpan);
  small.appendChild(metaSpan);
  if (expirySpan.textContent) small.appendChild(expirySpan);

  left.appendChild(title);
  left.appendChild(small);

  const right = document.createElement('div');
  right.className = 'd-flex';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-sm me-1';
  editBtn.style.backgroundColor = '#fe5a5a';
  editBtn.style.borderColor = '#fe5a5a';
  editBtn.style.color = '#fff';
  editBtn.setAttribute('aria-label', `Edit ${data.productName || ''} (${qtyDisplay})`);
  editBtn.textContent = '✏️';
  // Open modal with current quantity when clicked
  editBtn.addEventListener('click', () => {
    openEditModal(docId, data);
  });

  const infoBtn = document.createElement('button');
  infoBtn.type = 'button';
  infoBtn.className = 'btn btn-sm';
  infoBtn.style.backgroundColor = '#fe5a5a';
  infoBtn.style.borderColor = '#fe5a5a';
  infoBtn.style.color = '#fff';
  infoBtn.setAttribute('aria-label', `Info ${data.productName || ''} (${qtyDisplay})`);
  infoBtn.textContent = 'ℹ️';
  infoBtn.addEventListener('click', () => {
    const lines = [];
    lines.push(`Name: ${data.productName || '—'} (${qtyDisplay})`);
    lines.push(`Quantity: ${data.quantity ?? '—'}`);
    lines.push(`Price: ${data.price !== undefined && data.price !== null ? '$' + Number(data.price).toFixed(2) : '—'}`);
    if (data.expiry) lines.push(`Expiry: ${formatDateWithRelative(data.expiry)}`);
    if (data.addedAt) lines.push(`Added: ${timeAgo(data.addedAt)}`);
    showAlert(lines.join('\n'), 'info');
  });

  right.appendChild(editBtn);
  right.appendChild(infoBtn);

  body.appendChild(left);
  body.appendChild(right);
  wrapper.appendChild(body);

  return wrapper;
}

/* -------------------- Inventory listener / startInventoryListener (unchanged except using new createInventoryCard) -------------------- */
let unsubscribeInventory = null;

function getInventoryContainer() {
  // Find the card titled "Fridge Inventory" and return its .mt-3 container
  const titles = document.querySelectorAll('h5.card-title');
  for (const t of titles) {
    if (t.textContent && t.textContent.trim() === 'Fridge Inventory') {
      const body = t.closest('.card-body');
      if (!body) continue;
      const container = body.querySelector('.mt-3');
      if (container) return container;
    }
  }
  return null;
}

function startInventoryListener() {
  const fridgeId = getFridgeIdFromUrl();
  const container = getInventoryContainer();
  if (!container) {
    console.warn('Could not locate Fridge Inventory container in DOM. Please ensure the markup exists.');
    return;
  }

  container.innerHTML = '';

  if (!fridgeId) {
    container.innerHTML = '<div class="text-muted">Missing fridge id in URL. Inventory cannot be loaded.</div>';
    return;
  }

  const q = query(collection(doc(db, 'Fridges', fridgeId), 'Inventory'), orderBy('addedAt', 'desc'));

  if (unsubscribeInventory) unsubscribeInventory();

  unsubscribeInventory = onSnapshot(q, (snapshot) => {
    container.innerHTML = '';

    if (snapshot.empty) {
      container.innerHTML = '<div class="text-muted">No items in inventory.</div>';
      return;
    }

    snapshot.forEach(docSnap => {
      const d = docSnap.data() || {};
      const card = createInventoryCard(docSnap.id, d);
      container.appendChild(card);
    });
  }, (err) => {
    console.error('Inventory listener error:', err);
    container.innerHTML = `<div class="text-danger">Failed to load inventory: ${err.message}</div>`;
  });
}

/* -------------------- Database item deletion: add history when deleting DB item (and the inventories) -------------------- */
function createDbItemCard(docId, data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card mb-2';

  const body = document.createElement('div');
  body.className = 'card-body d-flex align-items-center justify-content-between';

  const left = document.createElement('div');
  left.className = 'd-flex flex-column';

  const title = document.createElement('div');
  title.className = 'fw-semibold';
  title.textContent = data.productName || 'Unnamed';

  const priceSmall = document.createElement('div');
  priceSmall.className = 'small text-muted';
  priceSmall.textContent = (data.price !== undefined && data.price !== null)
    ? formatCurrency(data.price)
    : 'Price: —';

  left.appendChild(title);
  left.appendChild(priceSmall);

  const right = document.createElement('div');
  right.className = 'd-flex align-items-center';

  // Trash button (delete)
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-outline-danger btn-sm';
  delBtn.title = `Delete ${data.productName || ''}`;
  delBtn.setAttribute('aria-label', `Delete ${data.productName || ''}`);
  delBtn.style.minWidth = '40px';

  // inline trash SVG
  delBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path d="M5.5 5.5A.5.5 0 0 1 6 5h4a.5.5 0 0 1 .5.5v7A1.5 1.5 0 0 1 9 14H7a1.5 1.5 0 0 1-1.5-1.5v-7z"/>
      <path fill-rule="evenodd" d="M4.5 2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V3h1.5a.5.5 0 0 1 0 1H1a.5.5 0 0 1 0-1H2.5V2z"/>
    </svg>
  `;

  delBtn.addEventListener('click', async () => {
    // basic confirm
    const ok = confirm(`Delete "${data.productName || 'Unnamed'}" and all its inventory entries?`);
    if (!ok) return;

    delBtn.disabled = true;
    const fridgeId = getFridgeIdFromUrl();
    if (!fridgeId) {
      showAlert('Missing fridge id in URL; cannot delete.', 'error');
      delBtn.disabled = false;
      return;
    }

    try {
      const fridgeDocRef = doc(db, 'Fridges', fridgeId);
      // Database doc ref
      const dbDocRef = doc(fridgeDocRef, 'Database', docId);

      // 1) delete DB doc
      await deleteDoc(dbDocRef);

      // 2) delete all Inventory docs whose productId matches docId
      const invColRef = collection(fridgeDocRef, 'Inventory');
      const invQ = query(invColRef, where('productId', '==', docId));
      const invSnap = await getDocs(invQ);

      if (!invSnap.empty) {
        // delete them in parallel (simple approach)
        await Promise.all(invSnap.docs.map(d => {
          const invDocRef = doc(fridgeDocRef, 'Inventory', d.id);
          return deleteDoc(invDocRef);
        }));
      }

      showAlert(`Deleted "${data.productName || 'Unnamed'}" and ${invSnap.size} inventory item(s).`, 'success');

      // log to history
      try {
        const userName = getCurrentUserName();
        await logFridgeHistory(fridgeId, `Deleted Database item "${data.productName || 'Unnamed'}" and ${invSnap.size} inventory item(s)`, { userName, meta: { type: 'db_delete', dbId: docId } });
      } catch (e) {
        console.warn('Failed to log history for DB deletion:', e);
      }
    } catch (err) {
      console.error('Failed deleting database item + inventory:', err);
      showAlert(err.message || 'Failed to delete item.', 'error');
    } finally {
      delBtn.disabled = false;
    }
  });

  right.appendChild(delBtn);

  body.appendChild(left);
  body.appendChild(right);
  wrapper.appendChild(body);

  return wrapper;
}

/* -------------------- Database modal + listener housekeeping (FIX) -------------------- */

// added: declare modal instance + unsubscribe function for DB listener
let viewDbModalInstance = null;
let unsubscribeDbListener = null;

// create the "View Database" modal dynamically (same pattern as history modal)
function ensureViewDbModalExists() {
  let existing = document.getElementById('viewDatabaseModal');
  if (existing) return existing;

  const tpl = document.createElement('div');
  tpl.innerHTML = `
  <div class="modal fade" id="viewDatabaseModal" tabindex="-1" aria-labelledby="viewDatabaseModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="viewDatabaseModalLabel">Database Items</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div id="viewDatabaseAlert" class="small text-danger d-none"></div>
          <div id="viewDatabaseList" class="d-flex flex-column gap-2" style="max-height:60vh; overflow:auto;">
            <div class="text-muted">Loading…</div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>
  `.trim();

  const modalEl = tpl.firstElementChild;
  document.body.appendChild(modalEl);
  return modalEl;
}

function startDbListener(listContainer) {
  const fridgeId = getFridgeIdFromUrl();
  if (!fridgeId) {
    listContainer.innerHTML = '<div class="text-danger">Missing fridge id in URL. Cannot load database.</div>';
    return;
  }

  const fridgeDocRef = doc(db, 'Fridges', fridgeId);
  const dbColRef = collection(fridgeDocRef, 'Database');
  const q = query(dbColRef, orderBy('createdAt', 'desc'));

  // unsubscribe previous if present
  if (unsubscribeDbListener) {
    try { unsubscribeDbListener(); } catch (e) { /* ignore */ }
    unsubscribeDbListener = null;
  }

  listContainer.innerHTML = '<div class="text-muted">Loading…</div>';

  unsubscribeDbListener = onSnapshot(q, (snapshot) => {
    listContainer.innerHTML = '';
    if (snapshot.empty) {
      listContainer.innerHTML = '<div class="text-muted">No database items.</div>';
      return;
    }

    snapshot.forEach(docSnap => {
      const d = docSnap.data() || {};
      const card = createDbItemCard(docSnap.id, d);
      listContainer.appendChild(card);
    });
  }, (err) => {
    console.error('DB listener error:', err);
    listContainer.innerHTML = `<div class="text-danger">Failed to load database items: ${err.message}</div>`;
  });
}

function stopDbListener() {
  if (unsubscribeDbListener) {
    try { unsubscribeDbListener(); } catch (e) {}
    unsubscribeDbListener = null;
  }
}

// wire the "View all Database Items" button (id: viewDbItems)
const viewDbItemsBtn = document.getElementById('viewDbItems');
if (viewDbItemsBtn) {
  viewDbItemsBtn.addEventListener('click', () => {
    const modalEl = ensureViewDbModalExists();
    // create bootstrap instance if needed
    if (!viewDbModalInstance) viewDbModalInstance = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    // show modal
    viewDbModalInstance.show();

    // start listener and render into #viewDatabaseList
    const listContainer = modalEl.querySelector('#viewDatabaseList');
    if (listContainer) startDbListener(listContainer);

    // ensure we unsubscribe when modal is closed
    modalEl.addEventListener('hidden.bs.modal', function onHidden() {
      stopDbListener();
      modalEl.removeEventListener('hidden.bs.modal', onHidden);
    });
  });
}

/* -------------------- start listening on DOMContentLoaded and cleanup -------------------- */
window.addEventListener('DOMContentLoaded', () => {
  try {
    startInventoryListener();
  } catch (err) {
    console.error('Error starting inventory listener:', err);
  }
});

window.addEventListener('beforeunload', () => {
  if (unsubscribeInventory) unsubscribeInventory();
  stopHistoryListener();
  stopDbListener();
});
