import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
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
    orderBy
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Import barcode scanner function
import { launchBarcodeScanner } from './camera.js';

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
const db = getFirestore(app);

/* -------------------- helpers -------------------- */
function getFridgeIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

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

function timeAgo(date) {
    if (!date) return '';
    const now = new Date();
    const d = (date.toDate) ? date.toDate() : new Date(date);
    const seconds = Math.floor((now - d) / 1000);
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    // fallback to absolute date for older items
    return d.toLocaleDateString();
}

function formatDate(d) {
    if (!d) return '—';
    const dateObj = (d.toDate) ? d.toDate() : new Date(d);
    return dateObj.toLocaleDateString();
}

/* -------------------- Firestore writes (unchanged) -------------------- */
async function addProductToDatabase(productName, price, barcode = null) {
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

    // Add barcode if provided
    if (barcode) {
        data.barcode = barcode;
    }

    const newDocRef = await addDoc(databaseColRef, data);
    return newDocRef.id;
}

/* -------------------- UI wiring - BARCODE SCANNER (NO FILE INPUTS) -------------------- */
const fridgeCameraBtn = document.getElementById('fridgeCameraBtn');
const fridgeProductName = document.getElementById('fridgeProductName');

if (fridgeCameraBtn) {
    fridgeCameraBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent any default behavior

        try {
            fridgeCameraBtn.disabled = true;
            fridgeCameraBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Scanning...';

            const result = await launchBarcodeScanner();

            if (result.success) {
                // Auto-fill product name with barcode text
                if (fridgeProductName) {
                    fridgeProductName.value = result.text;
                }
                showAlert(`Barcode scanned: ${result.text}`, 'success');
            } else {
                showAlert(result.message || 'Scanning failed', 'error');
            }
        } catch (error) {
            console.error('Error launching barcode scanner:', error);
            showAlert('Failed to launch barcode scanner', 'error');
        } finally {
            fridgeCameraBtn.disabled = false;
            fridgeCameraBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-camera" viewBox="0 0 16 16"><path d="M9.5 2a.5.5 0 0 1 .5.5V3h2.5A1.5 1.5 0 0 1 14 4.5v6A1.5 1.5 0 0 1 12.5 12H3.5A1.5 1.5 0 0 1 2 10.5v-6A1.5 1.5 0 0 1 3.5 3H6v-.5A.5.5 0 0 1 6.5 2h3z" /><path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></svg>';
        }
    });
}

const barcodeCameraBtn = document.getElementById('barcodeCameraBtn');
const barcodeFileName = document.getElementById('barcodeFileName');
const dbProductName = document.getElementById('dbProductName');

// Store scanned barcode for database form
let scannedBarcodeForDB = null;

if (barcodeCameraBtn) {
    barcodeCameraBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent any default behavior

        try {
            barcodeCameraBtn.disabled = true;
            barcodeCameraBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';

            const result = await launchBarcodeScanner();

            if (result.success) {
                scannedBarcodeForDB = result.text;

                // Update the file name display to show barcode was scanned
                if (barcodeFileName) {
                    barcodeFileName.textContent = `Scanned: ${result.text}`;
                    barcodeFileName.className = 'small text-success';
                }

                // Optionally auto-fill product name
                if (dbProductName && !dbProductName.value) {
                    dbProductName.value = result.text;
                }

                showAlert(`Barcode scanned: ${result.text}`, 'success');
            } else {
                showAlert(result.message || 'Scanning failed', 'error');
            }
        } catch (error) {
            console.error('Error launching barcode scanner:', error);
            showAlert('Failed to launch barcode scanner', 'error');
        } finally {
            barcodeCameraBtn.disabled = false;
            barcodeCameraBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-camera" viewBox="0 0 16 16"><path d="M9.5 2a.5.5 0 0 1 .5.5V3h2.5A1.5 1.5 0 0 1 14 4.5v6A1.5 1.5 0 0 1 12.5 12H3.5A1.5 1.5 0 0 1 2 10.5v-6A1.5 1.5 0 0 1 3.5 3H6v-.5A.5.5 0 0 1 6.5 2h3z" /><path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></svg>';
        }
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
            const newId = await addProductToDatabase(productName, priceVal, scannedBarcodeForDB);
            showAlert(`Saved to database (id: ${newId}).`, 'success');
            if (productInput) productInput.value = '';
            if (priceInput) priceInput.value = '';
            if (barcodeFileName) {
                barcodeFileName.textContent = 'No file chosen';
                barcodeFileName.className = 'small text-muted';
            }
            scannedBarcodeForDB = null;
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
            const newId = await addProductToDatabase(productName, priceVal, scannedBarcodeForDB);
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

/* -------------------- NEW: Dynamic Fridge Inventory rendering -------------------- */
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

function createInventoryCard(docId, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card mb-2';

    const body = document.createElement('div');
    body.className = 'card-body d-flex align-items-center justify-content-between';

    const left = document.createElement('div');
    left.className = 'd-flex align-items-baseline';

    const title = document.createElement('h5');
    title.className = 'mb-0 me-3';
    title.textContent = data.productName || 'Unnamed';

    const small = document.createElement('div');
    small.className = 'small';

    const priceSpan = document.createElement('span');
    priceSpan.textContent = formatCurrency(data.price);

    const metaSpan = document.createElement('span');
    metaSpan.className = 'text-muted ms-2';

    const addedBy = data.addedBy || null;
    const addedAtText = data.addedAt ? timeAgo(data.addedAt) : '';
    metaSpan.textContent = addedBy ? `Added by ${addedBy} (${addedAtText})` : (addedAtText ? `Added ${addedAtText}` : '');

    // expiry display
    const expirySpan = document.createElement('div');
    if (data.expiry) {
        const expiryDate = (data.expiry.toDate) ? data.expiry.toDate() : new Date(data.expiry);
        const now = new Date();
        if (expiryDate < now) {
            expirySpan.className = 'small text-danger ms-3';
            expirySpan.textContent = `Expired: ${formatDate(data.expiry)}`;
        } else {
            expirySpan.className = 'small text-primary ms-3';
            expirySpan.textContent = `Expires: ${formatDate(data.expiry)}`;
        }
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
    editBtn.setAttribute('aria-label', `Edit ${data.productName || ''}`);
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => {
        console.log('Edit', docId, data);
        showAlert('Edit action not implemented yet.', 'info');
    });

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'btn btn-sm';
    infoBtn.style.backgroundColor = '#fe5a5a';
    infoBtn.style.borderColor = '#fe5a5a';
    infoBtn.style.color = '#fff';
    infoBtn.setAttribute('aria-label', `Info ${data.productName || ''}`);
    infoBtn.textContent = 'ℹ️';
    infoBtn.addEventListener('click', () => {
        const lines = [];
        lines.push(`Name: ${data.productName || '—'}`);
        lines.push(`Quantity: ${data.quantity ?? '—'}`);
        lines.push(`Price: ${data.price !== undefined && data.price !== null ? '$' + Number(data.price).toFixed(2) : '—'}`);
        if (data.expiry) lines.push(`Expiry: ${formatDate(data.expiry)}`);
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

let unsubscribeInventory = null;

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

    const fridgeDocRef = doc(db, 'Fridges', fridgeId);
    const inventoryColRef = collection(fridgeDocRef, 'Inventory');
    const q = query(inventoryColRef, orderBy('addedAt', 'desc'));

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

window.addEventListener('DOMContentLoaded', () => {
    try {
        startInventoryListener();
    } catch (err) {
        console.error('Error starting inventory listener:', err);
    }
});

window.addEventListener('beforeunload', () => {
    if (unsubscribeInventory) unsubscribeInventory();
});