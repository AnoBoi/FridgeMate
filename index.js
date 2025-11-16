  // -- Firebase modular SDK (v9+) --
  import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
  import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

  // Your firebase config (from your message)
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

  const authArea = document.getElementById('authArea');

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

    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'Signing out...';
      try {
        await signOut(auth);
        // onAuthStateChanged will handle UI update
      } catch (err) {
        console.error('Error signing out:', err);
        logoutBtn.disabled = false;
        logoutBtn.textContent = 'Log out';
        alert('Unable to sign out. Check console for details.');
      }
    });
  }

  // simple escape to avoid injection if name somehow contains markup
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Listen for auth changes
  onAuthStateChanged(auth, (user) => {
    if (user) {
      renderSignedIn(user);
    } else {
      renderSignedOut();
    }
  });