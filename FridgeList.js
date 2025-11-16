// FridgeList.js (replace your existing file with this)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Your firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAp7TebsGhYqoMv6IER8XZ-fwyqwi9KGt4",
  authDomain: "fridge-mate-31e97.firebaseapp.com",
  projectId: "fridge-mate-31e97",
  storageBucket: "fridge-mate-31e97.firebasestorage.app",
  messagingSenderId: "543736415860",
  appId: "1:543736415860:web:312b6729c79af1221d7321"
};

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let userUID = null;
let fridgesUnsub = null; // will hold the firestore listener unsubscribe

const authArea = document.getElementById('authArea');
const fridgesContainer = document.getElementById('fridgesContainer');
const createFridgeCardEl = document.getElementById('createFridgeBtnCard'); // insertion point

// Element that will show "My User UID: ..."
let uidDisplayEl = null;

/* ---------- UID display helper (adds/updates small text under "My Fridges") ---------- */

function findMyFridgesHeading() {
  // look for headings and common title classes that contain "My Fridges"
  const candidates = document.querySelectorAll('h1,h2,h3,h4,.page-title,.section-title,.title');
  for (const el of candidates) {
    if (el && el.textContent && el.textContent.trim().toLowerCase().includes('my fridges')) {
      return el;
    }
  }
  return null;
}

function createOrUpdateUidDisplay(uid) {
  // create element if missing
  if (!uidDisplayEl) {
    const header = findMyFridgesHeading();
    uidDisplayEl = document.createElement('p');
    uidDisplayEl.id = 'myUserUidText';
    uidDisplayEl.className = 'text-muted small mb-3';
    uidDisplayEl.style.marginTop = '0.25rem';
    // insert directly under the "My Fridges" heading if found, otherwise insert before the fridges container
    if (header && header.parentNode) {
      header.parentNode.insertBefore(uidDisplayEl, header.nextSibling);
    } else if (fridgesContainer && fridgesContainer.parentNode) {
      fridgesContainer.parentNode.insertBefore(uidDisplayEl, fridgesContainer);
    } else {
      // final fallback: append to body
      document.body.insertBefore(uidDisplayEl, document.body.firstChild);
    }
  }

  uidDisplayEl.textContent = `My User UID: ${uid || '—'}`;
}

function clearUidDisplay() {
  if (uidDisplayEl) {
    uidDisplayEl.textContent = `My User UID: —`;
  }
}

/* ---------- Utility: escape HTML to avoid injection ---------- */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ---------- UI rendering for auth area ---------- */
function getDisplayNameOrEmail(user) {
  if (!user) return '';
  if (user.displayName && user.displayName.trim() !== '') return user.displayName;
  if (user.email) {
    const local = user.email.split('@')[0];
    return local;
  }
  return 'User';
}

function renderSignedOut() {
  authArea.innerHTML = `
    <li class="nav-item me-2">
      <a class="btn btn-outline-light" href="/signin.html">Sign in</a>
    </li>
    <li class="nav-item">
      <a class="btn btn-light" href="/signup.html">Sign up</a>
    </li>
  `;
  stopFridgeListener();
  clearFridgeCards();
  clearUidDisplay();
}

function renderSignedIn(user) {
  const name = getDisplayNameOrEmail(user);
  authArea.innerHTML = `
    <li class="nav-item me-2 d-flex align-items-center">
      <span class="navbar-text text-white me-2">Hi, <strong>${escapeHtml(name)}</strong></span>
    </li>
    <li class="nav-item">
      <button id="logoutBtn" class="btn btn-light">Log out</button>
    </li>
  `;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Signing out...';
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out:', err);
      logoutBtn.disabled = false;
      logoutBtn.textContent = 'Log out';
      alert('Unable to sign out. Check console for details.');
    }
  });

  // ensure UID display is created/updated
  createOrUpdateUidDisplay(user.uid);

  // start listening to fridges once signed in
  startFridgeListener();
}

/* ---------- Firestore membership check & rendering ---------- */

// Determine if the current user (uid) is present in allowedUsers.
// New canonical shape: allowedUsers is an object map where keys are UIDs and values are boolean true.
// But keep backward compatibility with older shapes (array/object of user objects).
function isUserAllowed(allowedUsers, uid) {
  if (!uid) return false;
  if (!allowedUsers) return false;

  // canonical boolean-map case: allowedUsers[uid] === true
  if (typeof allowedUsers === 'object' && !Array.isArray(allowedUsers) && allowedUsers.hasOwnProperty(uid)) {
    return allowedUsers[uid] === true;
  }

  // array case: [{ userId, displayName, ... }, ...]
  if (Array.isArray(allowedUsers)) {
    return allowedUsers.some(item => item && (item.userId === uid || item.uid === uid));
  }

  // object/map-like older case where values are objects containing userId
  if (typeof allowedUsers === 'object') {
    return Object.values(allowedUsers).some(item => item && (item.userId === uid || item.uid === uid));
  }

  return false;
}

// Return list of member display names (best-effort).
// For boolean-map we don't have display names stored, so fall back to generic 'Member' placeholders.
function getMembersList(allowedUsers) {
  if (!allowedUsers) return [];
  // array of user objects
  if (Array.isArray(allowedUsers)) {
    return allowedUsers.map(v => (v && (v.displayName || v.email || v.userId || v.uid)) || 'Member');
  }
  // object: could be boolean map { uid: true } or object map { key: { userId, displayName } }
  if (typeof allowedUsers === 'object') {
    const vals = Object.entries(allowedUsers).map(([key, val]) => {
      // if val is boolean true, we only have uid (the key)
      if (val === true || val === false) {
        // no displayName stored; return generic name or truncated uid for debugging
        return 'Member';
      }
      // if val is object with displayName/email/userId
      if (val && typeof val === 'object') {
        return val.displayName || val.email || val.userId || key;
      }
      // fallback to key
      return key;
    });
    return vals;
  }
  return [];
}

function getMemberCount(allowedUsers) {
  if (!allowedUsers) return 0;
  if (Array.isArray(allowedUsers)) return allowedUsers.length;
  if (typeof allowedUsers === 'object') {
    // if values are booleans, count only truthy ones
    const keys = Object.keys(allowedUsers);
    let count = 0;
    for (const k of keys) {
      const v = allowedUsers[k];
      if (v === true) count++;
      else if (v && typeof v === 'object') count++; // legacy user object
    }
    return count;
  }
  return 0;
}

function formatUpdatedText(data) {
  // try to extract a timestamp-like field (updatedAt, updated, lastUpdated)
  const ts = data && (data.updatedAt || data.updated || data.lastUpdated || data.createdAt || data.created);
  if (!ts) return '';
  // Firestore Timestamp object typically has toDate() method
  try {
    const date = (typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
    if (isNaN(date)) return '';
    // simple relative: if within 24h show 'Today', else show locale date
    const diffMs = Date.now() - date.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return `Updated: today`;
    if (days === 1) return `Updated: 1 day ago`;
    return `Updated: ${days} days ago`;
  } catch (e) {
    return '';
  }
}

// Build DOM for a fridge card (anchor wrapping a .card)
// returns a DOM node ready to append
function buildFridgeCard(docId, data) {
  const anchor = document.createElement('a');
  anchor.href = `Fridge.html?id=${encodeURIComponent(docId)}`;
  anchor.className = 'text-decoration-none text-body';

  const card = document.createElement('div');
  card.className = 'card mb-3 w-100 shadow-sm';

  const body = document.createElement('div');
  body.className = 'card-body d-flex justify-content-between align-items-center';

  const left = document.createElement('div');
  const title = document.createElement('h5');
  title.className = 'card-title mb-1';
  title.textContent = data && data.name ? data.name : 'Unnamed Fridge';
  left.appendChild(title);

  const members = getMembersList(data && data.allowedUsers);
  const meta = document.createElement('p');
  meta.className = 'card-text text-muted mb-0';
  if (members.length > 0) {
    const showNames = members.slice(0, 3).map(s => escapeHtml(s)).join(', ');
    meta.innerHTML = `Shared with: ${showNames}${members.length > 3 ? ' — +' + (members.length - 3) + ' more' : ''} ${formatUpdatedText(data) ? '— ' + escapeHtml(formatUpdatedText(data)) : ''}`;
  } else {
    meta.textContent = formatUpdatedText(data) || '';
  }
  left.appendChild(meta);

  const right = document.createElement('div');
  right.className = 'text-end';
  const badge = document.createElement('span');
  badge.className = 'badge bg-secondary rounded-pill';
  badge.textContent = `${getMemberCount(data && data.allowedUsers)} members`;
  right.appendChild(badge);

  body.appendChild(left);
  body.appendChild(right);
  card.appendChild(body);
  anchor.appendChild(card);
  return anchor;
}

/* ---------- Listener lifecycle ---------- */

function startFridgeListener() {
  // ensure we remove any previous listener first (supports re-starting)
  stopFridgeListener();

  if (!userUID) return;

  const fridgesCol = collection(db, 'Fridges');
  // query for documents where allowedUsers.<uid> == true
  const q = query(fridgesCol, where(`allowedUsers.${userUID}`, '==', true));

  fridgesUnsub = onSnapshot(q, (snapshot) => {
    // clear existing cards
    clearFridgeCards();

    snapshot.forEach(doc => {
      const data = doc.data();
      // defensive check: prefer server-side filtering, but keep local check for legacy data shapes
      if (isUserAllowed(data && data.allowedUsers, userUID)) {
        const cardNode = buildFridgeCard(doc.id, data);
        // insert into container
        fridgesContainer.appendChild(cardNode);
      }
    });
  }, (err) => {
    console.error('Fridges onSnapshot error:', err);
  });
}

function stopFridgeListener() {
  if (fridgesUnsub) {
    fridgesUnsub(); // unsubscribe
    fridgesUnsub = null;
  }
}

function clearFridgeCards() {
  if (fridgesContainer) fridgesContainer.innerHTML = '';
}

/* ---------- Auth handling ---------- */

// Listen for auth changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    userUID = user.uid;
    // update UID display immediately
    createOrUpdateUidDisplay(userUID);
    renderSignedIn(user);
  } else {
    userUID = null;
    // set UI for signed out
    renderSignedOut();
    // redirect as before
    window.location.replace("/index.html");
  }
});

/* ---------- Create fridge form handling ---------- */
const modalEl = document.getElementById('createFridgeModal');
if (modalEl) {
  modalEl.addEventListener('shown.bs.modal', () => {
    const nameInput = document.getElementById('fridgeName');
    if (nameInput) nameInput.focus();
  });
}

const form = document.getElementById('createFridgeForm');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('fridgeName');
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.classList.add('is-invalid');
      return;
    }
    nameInput.classList.remove('is-invalid');

    try {
      // Add a new document with a generated id.
      // Setting allowedUsers to a map of booleans where current user UID => true
      const allowed = {};
      if (userUID) {
        allowed[userUID] = true;
      }

      await addDoc(collection(db, "Fridges"), {
        name: name,
        allowedUsers: allowed,
        createdAt: new Date()
      });

      // close modal if bootstrap is used (we don't assume jQuery)
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      // clear input
      if (nameInput) nameInput.value = '';
      // UI will update from onSnapshot automatically
    } catch (err) {
      console.error('Error creating fridge:', err);
      alert('Unable to create fridge. Check console for details.');
    }
  });
}
