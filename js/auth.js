/* ============================================================
   AUTHENTICATION & PROFILE MANAGEMENT
============================================================ */
let authMode = 'login'; // or 'signup'

function toggleAuthMode(){
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('authError').textContent = '';
  if(authMode === 'signup'){
    document.getElementById('authTitle').textContent = 'Create your account';
    document.getElementById('authSubtitle').textContent = 'Set up attendance for your classes';
    document.getElementById('signupNameField').style.display = 'block';
    if(document.getElementById('signupDesignationField')) document.getElementById('signupDesignationField').style.display = 'block';
    document.getElementById('authSubmitBtn').textContent = 'Create account';
    document.getElementById('authSwitchText').innerHTML = 'Already have an account? <span onclick="toggleAuthMode()">Log in</span>';
  } else {
    document.getElementById('authTitle').textContent = 'Welcome back';
    document.getElementById('authSubtitle').textContent = 'Log in to manage your classes';
    document.getElementById('signupNameField').style.display = 'none';
    if(document.getElementById('signupDesignationField')) document.getElementById('signupDesignationField').style.display = 'none';
    document.getElementById('authSubmitBtn').textContent = 'Log in';
    document.getElementById('authSwitchText').innerHTML = 'New here? <span onclick="toggleAuthMode()">Create an account</span>';
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function handleAuthSubmit(){
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';

  if(!email || !password){ errEl.textContent = 'Please fill in all required fields.'; return; }

  if(!isValidEmail(email)){
    errEl.textContent = 'Please enter a valid email address (e.g. user@example.com).';
    return;
  }

  if(password.length < 6){
    errEl.textContent = 'Password must be at least 6 characters long.';
    return;
  }

  if(authMode === 'signup'){
    const name = document.getElementById('signupName').value.trim();
    const designation = document.getElementById('signupDesignation')?.value || 'Assistant Professor';
    
    if(!name || name.length < 2){
      errEl.textContent = 'Please enter a valid full name (at least 2 characters).';
      return;
    }

    const existing = await storageGet('user:'+email);
    if(existing){
      errEl.textContent = 'An account with this email address already exists. Please log in instead.';
      return;
    }

    const user = { name, email, password, designation };
    await storageSet('user:'+email, JSON.stringify(user));
    await storageSet('data:'+email, JSON.stringify({ groups: [] }));
    currentUser = { name, email, designation };
    toast('Account created successfully — welcome!');
    enterApp();
  } else {
    const raw = await storageGet('user:'+email);
    if(!raw){ errEl.textContent = 'No account found with this email. Please check your email or create an account.'; return; }
    const user = JSON.parse(raw);
    if(user.password !== password){ errEl.textContent = 'Incorrect password. Please try again.'; return; }
    currentUser = { name: user.name, email: user.email, designation: user.designation || 'Assistant Professor' };
    toast('Welcome back, '+user.name.split(' ')[0]+'!');
    enterApp();
  }
}

function logout(){
  currentUser = null;
  appData = { groups: [] };
  try { window.localStorage.removeItem('attendo_session_user'); } catch(e){}
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'none';
  document.getElementById('workspaceScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('authPassword').value = '';
}

async function enterApp(){
  try {
    const raw = await storageGet('data:' + currentUser.email);
    appData = raw ? JSON.parse(raw) : { groups: [] };
    
    try { window.localStorage.setItem('attendo_session_user', JSON.stringify(currentUser)); } catch(e){}

    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('topbar').style.display = 'flex';
    renderUserChip();
    goToDashboard();
    
    try { generateSmartNotifications(); } catch(e){ console.error('notif gen error', e); }
  } catch(e) {
    console.error('enterApp error', e);
    goToDashboard();
  }
}

function renderUserChip(){
  if(!currentUser) return;
  const desig = currentUser.designation ? ` (${currentUser.designation})` : '';
  document.getElementById('userChip').textContent = currentUser.name + desig + '  ·  ' + currentUser.email;
}

function openEditProfileModal(){
  if(!currentUser) return;
  document.getElementById('profileName').value = currentUser.name || '';
  if(document.getElementById('profileDesignation')) document.getElementById('profileDesignation').value = currentUser.designation || 'Assistant Professor';
  document.getElementById('editProfileModalBackdrop').classList.add('show');
}

function closeEditProfileModal(){
  document.getElementById('editProfileModalBackdrop').classList.remove('show');
}

async function saveProfileEdit(){
  if(!currentUser) return;
  const name = document.getElementById('profileName').value.trim();
  const designation = document.getElementById('profileDesignation').value;
  if(!name){ toast('Please enter your name.'); return; }

  currentUser.name = name;
  currentUser.designation = designation;

  const raw = await storageGet('user:'+currentUser.email);
  if(raw){
    const user = JSON.parse(raw);
    user.name = name;
    user.designation = designation;
    await storageSet('user:'+currentUser.email, JSON.stringify(user));
  }

  closeEditProfileModal();
  renderUserChip();
  toast('Profile & Designation updated successfully!');
}
