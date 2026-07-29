/* ============================================================
   SMART NOTIFICATION CENTER & ALERTS ENGINE
============================================================ */
let activeNotifications = [];

function generateSmartNotifications(){
  activeNotifications = [];
  
  if(!appData || !Array.isArray(appData.groups)) {
    activeNotifications.push({
      id: 'welcome_1',
      type: 'info',
      title: '👋 Welcome to Attendo!',
      message: 'All your classes and student records are active and synced.',
      time: 'System',
      actionText: null
    });
    updateNotifBadge();
    return;
  }

  const currentMonth = new Date().toISOString().slice(0,7);

  try {
    appData.groups.forEach(g => {
      if(!g || !Array.isArray(g.sessions) || !Array.isArray(g.students)) return;

      const monthSessions = g.sessions.filter(s => s && s.date && s.date.startsWith(currentMonth));
      const totalClasses = monthSessions.length;

      const instLabel = typeof groupInstitution === 'function' ? groupInstitution(g) : (g.collegeName || g.schoolName || 'Class');
      const grpLbl = typeof groupLabel === 'function' ? groupLabel(g) : (g.department || g.className || 'Group');

      if(totalClasses >= 1){
        const defaulters = [];
        const topPerformers = [];

        g.students.forEach(stu => {
          if(!stu) return;
          const presentCount = monthSessions.filter(sess => sess && sess.records && sess.records[stu.id]).length;
          const pct = totalClasses ? Math.round((presentCount / totalClasses) * 100) : 0;

          if(pct < 75) defaulters.push({ name: stu.name, pct });
          if(pct >= 95) topPerformers.push({ name: stu.name, pct });
        });

        if(defaulters.length > 0){
          activeNotifications.push({
            id: 'def_' + g.id,
            type: 'warning',
            title: `⚠️ Shortage Warning: ${grpLbl}`,
            message: `${defaulters.length} student(s) have < 75% attendance this month.`,
            time: 'Active Alert',
            actionText: 'View Report',
            actionFn: () => { closeNotifModal(); if(typeof openGroup==='function') openGroup(g.id); if(typeof switchTab==='function') switchTab('reports'); }
          });
        }

        if(topPerformers.length > 0){
          activeNotifications.push({
            id: 'cert_' + g.id,
            type: 'success',
            title: `🏆 Certificate Milestone: ${grpLbl}`,
            message: `${topPerformers.length} student(s) reached ≥ 95% attendance! Certificates are ready to generate.`,
            time: 'Achievement',
            actionText: 'Generate Certificates',
            actionFn: () => { closeNotifModal(); if(typeof openGroup==='function') openGroup(g.id); if(typeof switchTab==='function') switchTab('reports'); }
          });
        }
      }

      if(g.sessions.length > 0){
        activeNotifications.push({
          id: 'rem_' + g.id,
          type: 'info',
          title: `📊 Monthly PDF Reminder: ${instLabel}`,
          message: `Remember to download monthly attendance PDF & CSV for ${grpLbl}.`,
          time: 'Reminder',
          actionText: 'Export PDF',
          actionFn: () => { closeNotifModal(); if(typeof openGroup==='function') openGroup(g.id); if(typeof switchTab==='function') switchTab('reports'); }
        });
      }
    });
  } catch(e) {
    console.error('Error in generateSmartNotifications loop', e);
  }

  if(activeNotifications.length === 0){
    activeNotifications.push({
      id: 'welcome_1',
      type: 'info',
      title: '👋 Welcome to Attendo!',
      message: 'All your classes and student records are active and synced.',
      time: 'System',
      actionText: null
    });
  }

  updateNotifBadge();
}

function updateNotifBadge(){
  const badge = document.getElementById('notifBadge');
  if(!badge) return;

  try {
    const readIds = JSON.parse(localStorage.getItem('attendo_read_notifs') || '[]');
    const unreadCount = activeNotifications.filter(n => !readIds.includes(n.id)).length;

    if(unreadCount > 0){
      badge.style.display = 'inline-block';
      badge.textContent = unreadCount;
    } else {
      badge.style.display = 'none';
    }
  } catch(e) {
    console.error('Error in updateNotifBadge', e);
  }
}

function openNotifModal(){
  const backdrop = document.getElementById('notifModalBackdrop');
  if(backdrop) {
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }

  try { generateSmartNotifications(); } catch(e){ console.error('notif gen error', e); }
  try { renderNotifList(); } catch(e){ console.error('notif render error', e); }
}

function closeNotifModal(){
  const backdrop = document.getElementById('notifModalBackdrop');
  if(backdrop) {
    backdrop.style.cssText = "display:none !important;";
    backdrop.classList.remove('show');
  }
}

function renderNotifList(){
  const container = document.getElementById('notifListContainer');
  if(!container) return;
  container.innerHTML = '';

  let readIds = [];
  try {
    readIds = JSON.parse(localStorage.getItem('attendo_read_notifs') || '[]');
  } catch(e){}

  activeNotifications.forEach((n, idx) => {
    const isRead = readIds.includes(n.id);
    const item = document.createElement('div');
    item.style.padding = '12px 16px';
    item.style.borderRadius = '10px';
    item.style.marginBottom = '10px';
    item.style.background = isRead ? 'var(--card2)' : 'rgba(124,58,237,0.08)';
    item.style.border = isRead ? '1px solid var(--border-soft)' : '1px solid rgba(124,58,237,0.3)';

    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <b style="font-size:14px;color:${n.type==='warning'?'var(--red)':(n.type==='success'?'#f59e0b':'var(--text)')}">${n.title}</b>
        <span style="font-size:11px;color:var(--text-dim)">${n.time}</span>
      </div>
      <p style="font-size:13px;color:var(--text-dim);margin-bottom:8px">${n.message}</p>
      ${n.actionText ? `<button class="btn btn-sm btn-ghost" style="color:var(--cyan);padding:4px 10px;font-size:12px" id="notifAct_${idx}">${n.actionText} →</button>` : ''}
    `;

    container.appendChild(item);

    if(n.actionText){
      const btn = document.getElementById(`notifAct_${idx}`);
      if(btn) btn.onclick = n.actionFn;
    }
  });
}

function markAllNotifsRead(){
  const allIds = activeNotifications.map(n => n.id);
  try {
    localStorage.setItem('attendo_read_notifs', JSON.stringify(allIds));
  } catch(e){}
  updateNotifBadge();
  renderNotifList();
  if(typeof toast === 'function') toast('All notifications marked as read.');
}

window.openNotifModal = openNotifModal;
window.closeNotifModal = closeNotifModal;
window.markAllNotifsRead = markAllNotifsRead;

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('notifBtn');
  if(btn){
    btn.addEventListener('click', (e) => {
      openNotifModal();
    });
  }
});
