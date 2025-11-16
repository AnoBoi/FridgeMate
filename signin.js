// signin.js (ES module)
// Firebase Google Sign-In (modular SDK)
// 1) Replace the firebaseConfig object with your project's values from the Firebase console
// 2) Enable Google sign-in in the Firebase Console (Authentication → Sign-in method)
// 3) Add your app's domain (e.g. http://localhost:5500) to Authorized domains in Firebase
// 4) This file is loaded as a module from your HTML: <script src="signin.js" type="module"></script>

// NOTE: the CDN imports below use the Firebase v9+ modular SDK format. You can change the version
// path to match the version you want to pin.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyAp7TebsGhYqoMv6IER8XZ-fwyqwi9KGt4",
  authDomain: "fridge-mate-31e97.firebaseapp.com",
  projectId: "fridge-mate-31e97",
  storageBucket: "fridge-mate-31e97.firebasestorage.app",
  messagingSenderId: "543736415860",
  appId: "1:543736415860:web:312b6729c79af1221d7321"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// UI elements
const signinBtn = document.getElementById('signinBtn');
const loadingDiv = document.getElementById('loadingDiv');
const signinDiv = document.getElementById('signinDiv');
const errorDiv = document.getElementById('errorDiv');

function showLoading(show = true) {
  loadingDiv.style.display = show ? 'block' : 'none';
  signinDiv.style.display = show ? 'none' : 'block';
}

async function signInWithGoogle() {
  try {
    errorDiv.style.display = 'none';
    showLoading(true);

    // Open Google sign-in popup. This returns a Promise that resolves with the user credential.
    const result = await signInWithPopup(auth, provider);

    // The signed-in user info.
    const user = result.user;

    // Optional: the OAuth access token can be retrieved if you need to call Google APIs:
    // const credential = GoogleAuthProvider.credentialFromResult(result);
    // const token = credential?.accessToken;

    console.log('Signed in user:', user);

    // TODO: replace with your post-login logic (redirect, load app UI, etc.)
    // Example: redirect to dashboard
    window.location.href = '/FridgeList.html';
  } catch (err) {
    console.error('Sign-in error:', err);
    errorDiv.style.display = 'block';
    errorDiv.textContent = err?.message || 'There was an error signing in.';
    showLoading(false);
  }
}

// Wire up the button
signinBtn.addEventListener('click', (e) => {
  e.preventDefault();
  signInWithGoogle();
});

// Monitor auth state to react to already-signed-in users
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('User already signed in:', user.uid, user.email);
    window.location.replace("/FridgeList.html");
  } else {
    // user signed out
  }
});
