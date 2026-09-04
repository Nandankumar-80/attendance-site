/* ============================================================
   APPLICATION ENTRY POINT & THEME INITIALIZER
============================================================ */

function initTheme(){
  const saved = localStorage.getItem('attendo_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('attendo_theme', next);
  toast(`Switched to ${next} theme.`);
}
initTheme();

window.addEventListener('DOMContentLoaded', async () => {
  console.log('[auth_flow] App initialized. Checking session status...');
  const isPortal = await checkStudentPortalParams();
  if(!isPortal){
    let savedUser = null;
    try {
      const uRaw = window.localStorage.getItem('attendo_session_user');
      if(uRaw) savedUser = JSON.parse(uRaw);
    } catch(e){}

    if(savedUser && savedUser.email){
      console.log('[auth_flow] Active session restored for:', savedUser.email);
      currentUser = savedUser;
      await enterApp();
    } else {
      console.log('[auth_flow] No active session found. Displaying auth screen.');
      const authScr = document.getElementById('authScreen');
      if(authScr) authScr.style.display = 'flex';
    }
  }
});

/* ---------- PWA: Register Service Worker ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(e=>console.log('SW registration failed', e));
  });
}
