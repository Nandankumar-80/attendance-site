/* ============================================================
   CONFIG & FIREBASE INITIALIZATION
============================================================ */
let firebaseDb = null;
let firebaseAnalytics = null;

function initCloudDatabase(){
  try {
    const firebaseConfig = {
      apiKey: "AIzaSyBbRirhv6dYBrnduUIhJ19aoO-YVsoENIw",
      authDomain: "attendo-app-818fb.firebaseapp.com",
      projectId: "attendo-app-818fb",
      storageBucket: "attendo-app-818fb.firebasestorage.app",
      messagingSenderId: "82258872295",
      appId: "1:82258872295:web:c0c07af7e5f223ff5a1f42",
      measurementId: "G-FVMFPKENXB"
    };

    if(window.firebase && !firebase.apps.length){
      firebase.initializeApp(firebaseConfig);
      firebaseDb = firebase.firestore();
      if(typeof firebase.analytics === 'function') firebaseAnalytics = firebase.analytics();
    } else if(window.firebase){
      firebaseDb = firebase.firestore();
      if(typeof firebase.analytics === 'function') firebaseAnalytics = firebase.analytics();
    }
  } catch(e) {
    console.log('Cloud DB offline fallback mode', e);
  }
}
initCloudDatabase();

function getAppBaseUrl(){
  if(window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'){
    return 'https://attendance-site-xi.vercel.app/';
  }
  return window.location.origin + window.location.pathname;
}

function sanitizeKey(key){
  return key.replace(/[^a-zA-Z0-9_]/g, '_');
}
