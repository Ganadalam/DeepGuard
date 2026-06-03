/**
 * DeepGuard Pro — Admin & Community Module
 * 신고 알림 시스템 · 게시물 삭제 권한 · 딥페이크/AI 생성 구분 표시
 */
(function () {
  'use strict';
  const { Store, API, Toast, Modal, fmtDate, fmtBytes, verdictMeta, renderPagination } = window.DG;

  /* ─── Auth ───────────────────────────────────────────────── */
  const Auth = {
    async login(username, password) {
      const data = await API.post('/auth/login', { username, password });
      API.saveSession(data.token, data.role);
      return data;
    },
    async logout() {
      try { await API.post('/auth/logout', {}, API.getToken()); } catch {}
      API.clearSession();
    },
    isAdmin() { const u = API.getUser(); return u && u.role === 'ADMIN'; },
  };

  /* ─── Admin login page ───────────────────────────────────── */
  function initLoginPage() {
    const form = document.getElementById('login-form');
    const err  = document.getElementById('login-error');
    const btn  = document.getElementById('login-btn');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const user = document.getElementById('login-username').value.trim();
      const pass = document.getElementById('login-password').value;
      btn.disabled = true; btn.textContent = '로그인 중...'; err.classList.add('hidden');
      try {
        await Auth.login(user, pass);
        window.location.href = './admin.html';
      } catch {
        err.textContent = '잘못된 관리자 계정입니다';
        err.classList.remove('hidden');
      } finally { btn.disabled = false; btn.textContent = '로그인'; }
    });
  }

  /* ─── Notification Bell ──────────────────────────────────── */
  let _notifPollTimer = null;
  let _notifOpen = false;

  function initNotificationBell() {
    const bell = document.getElementById('notif-bell');
    if (!bell) return;
    bell.addEventListener('click', e => { e.stopPropagation(); toggleNotifDropdown(); });
    document.addEventListener('click', () => closeNotifDropdown());
    pollNotifications();
    _notifPollTimer = setInterval(pollNotifications, 30000);
  }

  async function pollNotifications() {
    if (!Auth.isAdmin()) return;
    try {
      const data = await API.get('/admin/notifications?unread=true', API.getToken());
      const count = data.unreadCount || 0;
      const badge = document.getElementById('notif-badge');
      if (badge) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = count > 0 ? 'flex' : 'none'; }
      document.getElementById('notif-bell')?.classList.toggle('has-notif', count > 0);
    } catch {}
  }

  async function toggleNotifDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;
    _notifOpen = !_notifOpen;
    if (_notifOpen) { dropdown.classList.add('is-open'); await loadNotifDropdown(dropdown); }
    else dropdown.classList.remove('is-open');
  }

  function closeNotifDropdown() {
    document.getElementById('notif-dropdown')?.classList.remove('is-open');
    _notifOpen = false;
  }

  async function loadNotifDropdown(dropdown) {
    dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:rgba(255,255,255,.3);font-size:.8125rem">불러오는 중...</div>`;
    try {
      const data = await API.get('/admin/notifications', API.getToken());
      const items = data.items || [];
      const unread = data.unreadCount || 0;
      if (!items.length) {
        dropdown.innerHTML = `
          <div style="padding:14px 20px;border-bottom:1px solid var(--clr-line)"><span style="font-weight:600;font-size:.875rem">알림</span></div>
          <div style="padding:32px 20px;text-align:center;color:rgba(255,255,255,.3);font-size:.8125rem">새 알림이 없습니다</div>`;
        return;
      }
      const reasonLabels = { false_result:'판별 부정확', privacy:'개인정보 침해', harmful:'유해 콘텐츠', spam:'스팸', other:'기타' };
      const notifHtml = items.slice(0, 15).map(n => {
        const isNew = !n.read;
        return `<div class="notif-item" onclick="DG.Admin.handleNotifClick('${n.id}','${n.postId}')" style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;display:flex;gap:12px;align-items:flex-start;transition:background .15s;${isNew ? 'background:rgba(255,170,0,.04);' : ''}">
          <div style="width:34px;height:34px;border-radius:50%;background:rgba(255,59,92,.12);border:1px solid rgba(255,59,92,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--clr-danger)" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              ${isNew ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--clr-warn);flex-shrink:0"></span>' : ''}
              <span style="font-size:.8125rem;font-weight:600">신고: ${reasonLabels[n.reason] || '기타'}</span>
            </div>
            <p style="font-size:.75rem;color:rgba(255,255,255,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.postFileName || '알 수 없음'}</p>
            <div style="display:flex;gap:8px;margin-top:3px">
              <span style="font-size:.65rem;color:rgba(255,255,255,.25)">${getTimeAgo(n.createdAt)}</span>
              <span style="font-size:.65rem;color:var(--clr-warn)">🚩 ${n.flagCount}회</span>
              ${n.postDeleted ? '<span style="font-size:.65rem;color:rgba(255,255,255,.2)">[삭제됨]</span>' : ''}
            </div>
          </div>
        </div>`;
      }).join('');
      dropdown.innerHTML = `
        <div style="padding:14px 20px;border-bottom:1px solid var(--clr-line);display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:600;font-size:.875rem">알림</span>
            ${unread > 0 ? `<span style="background:var(--clr-danger);color:#fff;font-size:.6rem;font-weight:700;padding:1px 6px;border-radius:10px">${unread}</span>` : ''}
          </div>
          ${unread > 0 ? `<button onclick="event.stopPropagation();DG.Admin.markAllNotifRead()" style="font-size:.75rem;color:var(--clr-accent);background:none;border:none;cursor:pointer">모두 읽음</button>` : ''}
        </div>
        <div style="max-height:380px;overflow-y:auto">${notifHtml}</div>
        <div style="padding:10px 20px;border-top:1px solid var(--clr-line);text-align:center">
          <a href="#" onclick="event.preventDefault();event.stopPropagation();DG.Admin.switchSection('moderation',null)" style="font-size:.8125rem;color:var(--clr-accent)">신고 관리 바로가기 →</a>
        </div>`;
    } catch { dropdown.innerHTML = `<div style="padding:20px;color:var(--clr-danger);font-size:.8125rem">알림 로드 실패</div>`; }
  }

  async function handleNotifClick(notifId, postId) {
    try { await API.patch(`/admin/notifications/${notifId}/read`, {}, API.getToken()); } catch {}
    pollNotifications();
    closeNotifDropdown();
    switchSection('moderation', null);
    setTimeout(() => {
      const row = document.querySelector(`[data-post-id="${postId}"]`);
      if (row) { row.scrollIntoView({ behavior:'smooth', block:'center' }); row.style.outline = '2px solid var(--clr-warn)'; setTimeout(() => row.style.outline = '', 2500); }
    }, 500);
  }

  async function markAllNotifRead() {
    try {
      await API.post('/admin/notifications/read-all', {}, API.getToken());
      pollNotifications();
      const dd = document.getElementById('notif-dropdown');
      if (dd && _notifOpen) loadNotifDropdown(dd);
      Toast.success('모든 알림을 읽음 처리했습니다');
    } catch { Toast.error('처리 실패'); }
  }

  function getTimeAgo(d) {
    const m = Math.floor((Date.now() - new Date(d)) / 60000);
    if (m < 1) return '방금 전';
    if (m < 60) return m + '분 전';
    if (m < 1440) return Math.floor(m/60) + '시간 전';
    return Math.floor(m/1440) + '일 전';
  }

  /* ─── Admin dashboard ────────────────────────────────────── */
  function initAdminPage() {
    if (!Auth.isAdmin()) { window.location.href = './admin-login.html'; return; }
    document.getElementById('admin-username') && (document.getElementById('admin-username').textContent = 'admin');
    loadAdminStats();
    loadModeration();
    loadHashSearch();
    initNotificationBell();
    document.getElementById('admin-logout-btn')?.addEventListener('click', async () => {
      if (_notifPollTimer) clearInterval(_notifPollTimer);
      await Auth.logout();
      window.location.href = './admin-login.html';
    });
  }

  async function loadAdminStats() {
    try {
      const [flagged, stats, notifs] = await Promise.all([
        API.get('/admin/reports?status=FLAGGED&pageSize=1', API.getToken()),
        API.get('/admin/stats', API.getToken()),
        API.get('/admin/notifications?unread=true', API.getToken()),
      ]);
      [['admin-pending-count', flagged.total], ['admin-total-count', stats.totalAnalyses], ['admin-community-count', stats.communityPosts], ['admin-notif-count', notifs.unreadCount]].forEach(([id, v]) => {
        const el = document.getElementById(id); if (el) el.textContent = v ?? '—';
      });
      const badge = document.getElementById('pending-badge');
      if (badge) { badge.textContent = flagged.total || 0; badge.style.display = flagged.total > 0 ? 'inline-flex' : 'none'; }
    } catch {}
  }

  /* ─── switchSection ──────────────────────────────────────── */
  function switchSection(key, triggerEl) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${key}`)?.classList.remove('hidden');
    document.querySelectorAll('.admin-sidebar__item').forEach(b => b.classList.remove('active'));
    if (triggerEl) triggerEl.classList.add('active');
    else document.querySelector(`[data-section="${key}"]`)?.classList.add('active');
    if (key === 'moderation') loadModeration();
    if (key === 'hashes') loadHashSearch();
    if (key === 'notices') loadNotices();
  }
  window.switchSection = switchSection;

  /* ─── Moderation ─────────────────────────────────────────── */
  let _modStatus = 'FLAGGED';

  async function loadModeration(status, page = 1) {
    if (status !== undefined && status !== null) _modStatus = status;
    const tbody = document.getElementById('mod-tbody');
    const pager = document.getElementById('mod-pager');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:rgba(255,255,255,.3)">불러오는 중...</td></tr>`;
    try {
      const data = await API.get(`/admin/reports?status=${_modStatus}&page=${page}&pageSize=15`, API.getToken());
      renderModerationRows(data.items || data.data || []);
      if (pager) renderPagination(pager, { page, total: data.total, pageSize: 15, onPage: p => loadModeration(null, p) });
      document.querySelectorAll('[data-mod-status]').forEach(b => b.classList.toggle('active', b.dataset.modStatus === _modStatus));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--clr-danger);padding:24px;text-align:center">불러오기 실패</td></tr>`;
    }
  }

  function dtLabel(type) {
    return { DEEPFAKE_MANIPULATED:{label:'🎭 딥페이크',color:'var(--clr-danger)'}, AI_GENERATED:{label:'🤖 AI 생성',color:'#a78bfa'}, AI_MANIPULATED:{label:'⚠️ AI 편집',color:'var(--clr-warn)'} }[type] || null;
  }

  function renderModerationRows(reports) {
    const tbody = document.getElementById('mod-tbody');
    if (!tbody) return;
    if (!reports.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:rgba(255,255,255,.2)">해당 상태의 신고가 없습니다</td></tr>`;
      return;
    }
    const statusMap = { ACTIVE:{cls:'badge--safe',lbl:'활성'}, FLAGGED:{cls:'badge--warn',lbl:'🚩 신고됨'}, DELETED:{cls:'badge--neutral',lbl:'삭제됨'}, PENDING:{cls:'badge--pending',lbl:'대기'}, APPROVED:{cls:'badge--safe',lbl:'승인'}, REJECTED:{cls:'badge--neutral',lbl:'반려'} };
    tbody.innerHTML = reports.map(r => {
      const vm = r.verdict ? verdictMeta(r.verdict) : null;
      const sc = statusMap[r.status] || { cls:'badge--neutral', lbl: r.status };
      const dt = dtLabel(r.detectionType);
      const isDeleted = r.status === 'DELETED';
      const title = r.fileName || (r.sourceUrl ? (() => { try { return new URL(r.sourceUrl).hostname; } catch { return r.sourceUrl.slice(0,28); } })() : r.memo?.slice(0,30) || '(알 수 없음)');
      const thumb = r.mediaData
        ? `<img src="${r.mediaData}" style="width:48px;height:36px;object-fit:cover;border-radius:5px;border:1px solid rgba(255,255,255,.1);flex-shrink:0"/>`
        : `<div style="width:48px;height:36px;border-radius:5px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
      return `<tr data-post-id="${r.id}" style="${isDeleted ? 'opacity:.4;' : ''}">
        <td><span class="badge ${sc.cls}" style="font-size:.65rem">${sc.lbl}</span>${r.flagCount > 0 ? `<br><span style="font-size:.65rem;color:var(--clr-warn);margin-top:3px;display:inline-block">🚩 ${r.flagCount}회</span>` : ''}</td>
        <td><div style="display:flex;align-items:center;gap:9px">${thumb}<div style="min-width:0"><div style="font-size:.8rem;font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(title)}</div><div style="font-family:var(--font-mono);font-size:.6rem;color:rgba(255,255,255,.25);margin-top:2px">${(r.hash||'').slice(0,12)}…</div></div></div></td>
        <td>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start">
            ${vm ? `<span class="badge badge--${vm.cls}" style="font-size:.65rem;white-space:nowrap">${vm.label}</span>` : '<span style="color:rgba(255,255,255,.25);font-size:.75rem">—</span>'}
            ${dt ? `<span class="badge" style="font-size:.6rem;background:${dt.color}18;color:${dt.color};border:1px solid ${dt.color}40;white-space:nowrap">${dt.label}</span>` : ''}
          </div>
        </td>
        <td style="font-family:var(--font-mono);font-size:.8rem;color:${vm ? `var(--clr-${vm.cls})` : 'rgba(255,255,255,.4)'}">${r.avgConfidence != null ? (r.avgConfidence*100).toFixed(1)+'%' : '—'}</td>
        <td style="font-size:.75rem;color:rgba(255,255,255,.3)">${fmtDate(r.postedAt||r.createdAt)}</td>
        <td style="max-width:120px"><p style="font-size:.75rem;color:rgba(255,255,255,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.memo ? escHtml(r.memo) : '—'}</p></td>
        <td>${!isDeleted ? `<button class="btn btn--sm" style="background:rgba(255,59,92,.1);border:1px solid rgba(255,59,92,.25);color:var(--clr-danger);font-size:.75rem;padding:5px 10px;white-space:nowrap" onclick="DG.Admin.deletePost('${r.id}')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:4px;vertical-align:middle"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>삭제</button>` : '<span style="font-size:.7rem;color:rgba(255,255,255,.2)">삭제됨</span>'}</td>
      </tr>`;
    }).join('');
  }

  async function deletePost(id) {
    Modal.open({
      title: '게시물 삭제',
      body: `<div style="background:rgba(255,59,92,.07);border:1px solid rgba(255,59,92,.2);border-radius:8px;padding:14px 18px">
        <p style="font-size:.875rem;color:var(--clr-danger);font-weight:600;margin-bottom:6px">⚠ 되돌릴 수 없는 작업입니다</p>
        <p style="font-size:.8125rem;color:rgba(255,255,255,.6)">해당 커뮤니티 게시물을 삭제합니다. 커뮤니티에서 즉시 숨겨집니다.</p>
      </div>`,
      confirmLabel: '삭제 확인', dangerous: true,
      onConfirm: async () => {
        try {
          await API.delete(`/admin/community/posts/${id}`, API.getToken());
          Toast.success('게시물이 삭제되었습니다');
          loadModeration(); loadAdminStats(); pollNotifications();
        } catch (e) { Toast.error('삭제 실패: ' + (e.message||'')); }
      },
    });
  }

  /* ─── Hash Search ────────────────────────────────────────── */
  async function loadHashSearch(page = 1) {
    const filters = Store.get('hashSearch')?.filters || {};
    const tbody = document.getElementById('hash-tbody');
    const pager = document.getElementById('hash-pager');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:rgba(255,255,255,.3)">검색 중...</td></tr>`;
    const params = new URLSearchParams({ page, pageSize: 15 });
    if (filters.q)       params.append('q', filters.q);
    if (filters.verdict) params.append('verdict', filters.verdict);
    if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters.dateTo)   params.append('dateTo', filters.dateTo);
    try {
      const data = await API.get(`/analysis/search?${params}`, API.getToken());
      renderHashRows(data.items || data.data || []);
      if (pager) renderPagination(pager, { page, total: data.total, pageSize: 15, onPage: loadHashSearch });
    } catch { tbody.innerHTML = `<tr><td colspan="7" style="color:var(--clr-danger);padding:24px;text-align:center">오류 발생</td></tr>`; }
  }

  function renderHashRows(items) {
    const tbody = document.getElementById('hash-tbody');
    if (!tbody) return;
    if (!items.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:rgba(255,255,255,.2)">결과 없음</td></tr>`; return; }
    const tcIcon = { video:'🎬', image:'🖼', url:'🔗' };
    tbody.innerHTML = items.map(r => {
      const vm = verdictMeta(r.verdict);
      const dt = dtLabel(r.detectionType);
      return `<tr>
        <td><span class="mono" style="font-size:.7rem;color:rgba(255,255,255,.4)">${r.hash?.slice(0,16)}…</span></td>
        <td style="font-size:.8rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(tcIcon[r.inputType]||'📄')} ${escHtml(r.fileName||r.sourceUrl||'—')}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start">
            <span class="badge badge--${vm.cls}" style="font-size:.65rem;white-space:nowrap">${vm.label}</span>
            ${dt ? `<span class="badge" style="font-size:.6rem;background:${dt.color}18;color:${dt.color};border:1px solid ${dt.color}40;white-space:nowrap">${dt.label}</span>` : ''}
          </div>
        </td>
        <td style="font-family:var(--font-mono);font-size:.8rem;color:var(--clr-${vm.cls})">${(r.avgConfidence*100).toFixed(1)}%</td>
        <td style="font-size:.75rem;color:rgba(255,255,255,.35)">${r.totalFrames ? r.totalFrames+' f' : '—'}</td>
        <td style="font-family:var(--font-mono);font-size:.7rem;color:rgba(255,255,255,.3)">${r.fileSize ? fmtBytes(r.fileSize) : '—'}</td>
        <td style="font-size:.75rem;color:rgba(255,255,255,.3)">${fmtDate(r.analyzedAt)}</td>
      </tr>`;
    }).join('');
  }

  function initHashSearchFilters() {
    // 날짜 미설정 시 오늘 날짜를 기본값으로
    const todayStr = new Date().toISOString().slice(0, 10);
    const fromEl = document.getElementById('hash-date-from');
    const toEl   = document.getElementById('hash-date-to');
    if (fromEl && !fromEl.value) fromEl.value = todayStr;
    if (toEl   && !toEl.value)   toEl.value   = todayStr;

    document.getElementById('hash-search-btn')?.addEventListener('click', () => {
      const dateFrom = document.getElementById('hash-date-from')?.value || todayStr;
      const dateTo   = document.getElementById('hash-date-to')?.value   || todayStr;
      Store.set('hashSearch', { filters: { q: document.getElementById('hash-q')?.value||'', verdict: document.getElementById('hash-verdict')?.value||'', dateFrom, dateTo } });
      loadHashSearch(1);
    });
    document.getElementById('hash-q')?.addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('hash-search-btn')?.click(); });
  }

  function initModerationFilters() {
    document.querySelectorAll('[data-mod-status]').forEach(btn => {
      btn.addEventListener('click', () => loadModeration(btn.dataset.modStatus));
    });
  }

  /* ─── 공지사항 ───────────────────────────────────────────── */
  async function loadNotices() {
    const list = document.getElementById('notices-list');
    if (!list) return;
    list.innerHTML = '<p style="color:rgba(255,255,255,.3);padding:16px;text-align:center">불러오는 중...</p>';
    try {
      const data = await API.get('/notices');
      const items = data.items || [];
      if (!items.length) { list.innerHTML = '<p style="color:rgba(255,255,255,.25);padding:24px;text-align:center">등록된 공지가 없습니다</p>'; return; }
      list.innerHTML = items.map(n => `
        <div style="padding:16px 20px;background:var(--clr-surface-2);border:1px solid var(--clr-line);border-radius:10px;margin-bottom:10px">
          <div class="flex items-center gap-10" style="margin-bottom:8px">
            ${n.pinned ? '<span style="font-size:.65rem;background:rgba(0,229,160,.1);color:var(--clr-safe);padding:2px 8px;border-radius:20px;border:1px solid rgba(0,229,160,.2)">📌 고정</span>' : ''}
            <span style="font-weight:600;font-size:.9rem;flex:1">${escHtml(n.title)}</span>
            <span style="font-size:.7rem;color:rgba(255,255,255,.3)">${fmtDate(n.createdAt)}</span>
            <button class="btn btn--sm" style="background:rgba(255,59,92,.1);border:1px solid rgba(255,59,92,.2);color:var(--clr-danger);font-size:.7rem;padding:4px 10px" onclick="DG.Admin.deleteNotice('${n.id}')">삭제</button>
          </div>
          <p style="font-size:.85rem;color:rgba(255,255,255,.55);line-height:1.7;white-space:pre-wrap">${escHtml(n.content)}</p>
        </div>`).join('');
    } catch { list.innerHTML = '<p style="color:var(--clr-danger);padding:16px">불러오기 실패</p>'; }
  }

  async function submitNotice() {
    const title = document.getElementById('notice-title')?.value.trim();
    const content = document.getElementById('notice-content')?.value.trim();
    const pinned = document.getElementById('notice-pinned')?.checked;
    if (!title || !content) { Toast.warn('제목과 내용을 입력하세요'); return; }
    const btn = document.getElementById('notice-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '등록 중...'; }
    try {
      await API.post('/admin/notices', { title, content, pinned }, API.getToken());
      Toast.success('공지가 등록되었습니다');
      ['notice-title','notice-content'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      document.getElementById('notice-pinned') && (document.getElementById('notice-pinned').checked = false);
      loadNotices();
    } catch (e) { Toast.error('공지 등록 실패: '+(e.message||'')); }
    finally { if(btn) { btn.disabled=false; btn.textContent='공지 등록'; } }
  }

  async function deleteNotice(id) {
    Modal.open({ title:'공지 삭제', body:'<p style="font-size:.875rem;color:rgba(255,255,255,.6)">공지를 삭제합니다.</p>', confirmLabel:'삭제', dangerous:true,
      onConfirm: async () => {
        try { await API.delete(`/admin/notices/${id}`, API.getToken()); Toast.success('삭제됨'); loadNotices(); }
        catch { Toast.error('삭제 실패'); }
      }
    });
  }

  /* ─── 로컬 포렌식 튜닝 & 최적화 모듈 ─────────────────────── */
  const DEFAULT_WEIGHTS = {
    cfa: 0.25, lighting: 0.18, gan: 0.20, file: 0.17, geo: 0.15,
    cfaDf: 0.22, lightingDf: 0.18, ganDf: 0.18, fileDf: 0.17, geoDf: 0.17,
    imageFakeThreshold: 0.38, imageSuspiciousThreshold: 0.22,
    videoFakeThreshold: 0.55, videoSuspiciousThreshold: 0.32
  };

  let activeWeights = { ...DEFAULT_WEIGHTS };
  let testDataset = []; // { name, label: 'REAL'|'FAKE', signals }
  let tuningWorker = null;
  let optimizedParams = null; // 최적화 검색 결과 임시 보관

  const BENCHMARK_DATA = [
    // 실제 이미지 8개
    { name: 'authentic_portrait_1.jpg', label: 'REAL', signals: { cfaScore: 0.15, lightingScore: 0.12, ganScore: 0.22, fileScore: 0.18, geoScore: 0.15, avgCorr: 0.35, noiseLevel: 0.12, asymmetry: 0.08, lbpUniformity: 0.52, edgeEntropy: 0.81, edgeMag: 0.12, skinRatio: 0.22, grayStd: 0.18 } },
    { name: 'authentic_landscape_2.png', label: 'REAL', signals: { cfaScore: 0.25, lightingScore: 0.24, ganScore: 0.18, fileScore: 0.22, geoScore: 0.20, avgCorr: 0.40, noiseLevel: 0.08, asymmetry: 0.12, lbpUniformity: 0.48, edgeEntropy: 0.76, edgeMag: 0.15, skinRatio: 0.18, grayStd: 0.20 } },
    { name: 'authentic_selfie_3.jpg', label: 'REAL', signals: { cfaScore: 0.12, lightingScore: 0.08, ganScore: 0.25, fileScore: 0.15, geoScore: 0.18, avgCorr: 0.38, noiseLevel: 0.14, asymmetry: 0.06, lbpUniformity: 0.55, edgeEntropy: 0.85, edgeMag: 0.10, skinRatio: 0.25, grayStd: 0.15 } },
    { name: 'authentic_group_4.jpg', label: 'REAL', signals: { cfaScore: 0.30, lightingScore: 0.15, ganScore: 0.20, fileScore: 0.25, geoScore: 0.22, avgCorr: 0.42, noiseLevel: 0.09, asymmetry: 0.14, lbpUniformity: 0.50, edgeEntropy: 0.72, edgeMag: 0.16, skinRatio: 0.20, grayStd: 0.22 } },
    { name: 'authentic_document_5.png', label: 'REAL', signals: { cfaScore: 0.08, lightingScore: 0.10, ganScore: 0.15, fileScore: 0.09, geoScore: 0.12, avgCorr: 0.30, noiseLevel: 0.16, asymmetry: 0.04, lbpUniformity: 0.58, edgeEntropy: 0.88, edgeMag: 0.08, skinRatio: 0.30, grayStd: 0.12 } },
    { name: 'authentic_outdoor_6.png', label: 'REAL', signals: { cfaScore: 0.20, lightingScore: 0.18, ganScore: 0.28, fileScore: 0.20, geoScore: 0.26, avgCorr: 0.44, noiseLevel: 0.07, asymmetry: 0.16, lbpUniformity: 0.46, edgeEntropy: 0.68, edgeMag: 0.18, skinRatio: 0.15, grayStd: 0.25 } },
    { name: 'authentic_studio_7.jpg', label: 'REAL', signals: { cfaScore: 0.18, lightingScore: 0.20, ganScore: 0.12, fileScore: 0.17, geoScore: 0.14, avgCorr: 0.36, noiseLevel: 0.11, asymmetry: 0.10, lbpUniformity: 0.53, edgeEntropy: 0.79, edgeMag: 0.13, skinRatio: 0.24, grayStd: 0.17 } },
    { name: 'authentic_candid_8.jpg', label: 'REAL', signals: { cfaScore: 0.28, lightingScore: 0.22, ganScore: 0.24, fileScore: 0.28, geoScore: 0.19, avgCorr: 0.41, noiseLevel: 0.10, asymmetry: 0.11, lbpUniformity: 0.49, edgeEntropy: 0.74, edgeMag: 0.14, skinRatio: 0.21, grayStd: 0.19 } },
    
    // 위조/AI 생성 이미지 8개 (명확한 케이스)
    { name: 'fake_diffusion_1.jpg', label: 'FAKE', signals: { cfaScore: 0.85, lightingScore: 0.78, ganScore: 0.82, fileScore: 0.72, geoScore: 0.80, avgCorr: 0.65, noiseLevel: 0.02, asymmetry: 0.22, lbpUniformity: 0.82, edgeEntropy: 0.42, edgeMag: 0.28, skinRatio: 0.42, grayStd: 0.06 } },
    { name: 'fake_gan_face_2.png', label: 'FAKE', signals: { cfaScore: 0.92, lightingScore: 0.84, ganScore: 0.88, fileScore: 0.80, geoScore: 0.85, avgCorr: 0.72, noiseLevel: 0.01, asymmetry: 0.25, lbpUniformity: 0.88, edgeEntropy: 0.38, edgeMag: 0.30, skinRatio: 0.45, grayStd: 0.04 } },
    { name: 'fake_midjourney_3.jpg', label: 'FAKE', signals: { cfaScore: 0.78, lightingScore: 0.70, ganScore: 0.75, fileScore: 0.65, geoScore: 0.72, avgCorr: 0.60, noiseLevel: 0.03, asymmetry: 0.18, lbpUniformity: 0.78, edgeEntropy: 0.48, edgeMag: 0.25, skinRatio: 0.38, grayStd: 0.08 } },
    { name: 'fake_deepfake_swap_4.mp4_frame.jpg', label: 'FAKE', signals: { cfaScore: 0.89, lightingScore: 0.92, ganScore: 0.94, fileScore: 0.85, geoScore: 0.88, avgCorr: 0.78, noiseLevel: 0.01, asymmetry: 0.28, lbpUniformity: 0.92, edgeEntropy: 0.32, edgeMag: 0.32, skinRatio: 0.48, grayStd: 0.03 } },
    { name: 'fake_inpainting_5.png', label: 'FAKE', signals: { cfaScore: 0.65, lightingScore: 0.62, ganScore: 0.68, fileScore: 0.58, geoScore: 0.62, avgCorr: 0.55, noiseLevel: 0.04, asymmetry: 0.15, lbpUniformity: 0.72, edgeEntropy: 0.55, edgeMag: 0.22, skinRatio: 0.32, grayStd: 0.10 } },
    { name: 'fake_stable_diff_6.png', label: 'FAKE', signals: { cfaScore: 0.96, lightingScore: 0.88, ganScore: 0.90, fileScore: 0.92, geoScore: 0.94, avgCorr: 0.82, noiseLevel: 0.00, asymmetry: 0.32, lbpUniformity: 0.96, edgeEntropy: 0.28, edgeMag: 0.35, skinRatio: 0.52, grayStd: 0.02 } },
    { name: 'fake_anime_ai_7.jpg', label: 'FAKE', signals: { cfaScore: 0.74, lightingScore: 0.65, ganScore: 0.79, fileScore: 0.70, geoScore: 0.75, avgCorr: 0.62, noiseLevel: 0.03, asymmetry: 0.20, lbpUniformity: 0.80, edgeEntropy: 0.45, edgeMag: 0.26, skinRatio: 0.40, grayStd: 0.07 } },
    { name: 'fake_stylegan3_8.jpg', label: 'FAKE', signals: { cfaScore: 0.82, lightingScore: 0.75, ganScore: 0.85, fileScore: 0.76, geoScore: 0.82, avgCorr: 0.68, noiseLevel: 0.02, asymmetry: 0.24, lbpUniformity: 0.85, edgeEntropy: 0.40, edgeMag: 0.29, skinRatio: 0.43, grayStd: 0.05 } },
    // 경계선 케이스 8개 — 현실적 SNS 이미지에서 흔히 발생하는 어려운 패턴
    // JPEG 재압축으로 CFA 패턴이 지워진 AI 이미지 (저해상도 SNS 업로드 후 다운로드)
    { name: 'hard_fake_lowres_jpeg_recompressed_1.jpg', label: 'FAKE', signals: { cfaScore: 0.32, lightingScore: 0.55, ganScore: 0.62, fileScore: 0.40, geoScore: 0.48, avgCorr: 0.55, noiseLevel: 0.06, asymmetry: 0.14, lbpUniformity: 0.66, edgeEntropy: 0.58, edgeMag: 0.18, skinRatio: 0.35, grayStd: 0.11, origWidth: 400, origHeight: 400 } },
    // 스튜디오 사진 (조명이 너무 완벽해서 AI처럼 보이는 실제 사진)
    { name: 'hard_real_studio_perfect_lighting_2.jpg', label: 'REAL', signals: { cfaScore: 0.42, lightingScore: 0.58, ganScore: 0.30, fileScore: 0.28, geoScore: 0.25, avgCorr: 0.36, noiseLevel: 0.08, asymmetry: 0.09, lbpUniformity: 0.56, edgeEntropy: 0.76, edgeMag: 0.14, skinRatio: 0.28, grayStd: 0.14, origWidth: 1200, origHeight: 1200 } },
    // Midjourney v6 고품질 — CFA 신호 낮지만 GAN·기하학 신호 중간
    { name: 'hard_fake_midjourney_v6_hq_3.jpg', label: 'FAKE', signals: { cfaScore: 0.45, lightingScore: 0.52, ganScore: 0.58, fileScore: 0.48, geoScore: 0.54, avgCorr: 0.52, noiseLevel: 0.04, asymmetry: 0.17, lbpUniformity: 0.68, edgeEntropy: 0.54, edgeMag: 0.22, skinRatio: 0.36, grayStd: 0.09, origWidth: 1024, origHeight: 1024 } },
    // 오래된 필름 스캔 (노이즈·왜곡 많아 AI처럼 오판정될 수 있는 실제 사진)
    { name: 'hard_real_film_scan_noisy_4.jpg', label: 'REAL', signals: { cfaScore: 0.35, lightingScore: 0.30, ganScore: 0.42, fileScore: 0.38, geoScore: 0.45, avgCorr: 0.44, noiseLevel: 0.22, asymmetry: 0.18, lbpUniformity: 0.44, edgeEntropy: 0.70, edgeMag: 0.16, skinRatio: 0.18, grayStd: 0.24, origWidth: 800, origHeight: 600 } },
    // 딥페이크 얼굴 교체 — 배경은 실제, 얼굴만 합성 (경계 신호 중간)
    { name: 'hard_fake_face_swap_mixed_bg_5.jpg', label: 'FAKE', signals: { cfaScore: 0.58, lightingScore: 0.72, ganScore: 0.55, fileScore: 0.44, geoScore: 0.50, avgCorr: 0.58, noiseLevel: 0.05, asymmetry: 0.20, lbpUniformity: 0.70, edgeEntropy: 0.52, edgeMag: 0.24, skinRatio: 0.40, grayStd: 0.08, origWidth: 720, origHeight: 720 } },
    // 프로 편집된 실제 사진 (필터/보정 강하게 적용)
    { name: 'hard_real_heavy_edited_portrait_6.jpg', label: 'REAL', signals: { cfaScore: 0.38, lightingScore: 0.45, ganScore: 0.35, fileScore: 0.30, geoScore: 0.28, avgCorr: 0.40, noiseLevel: 0.05, asymmetry: 0.10, lbpUniformity: 0.60, edgeEntropy: 0.72, edgeMag: 0.13, skinRatio: 0.30, grayStd: 0.10, origWidth: 1080, origHeight: 1080 } },
    // SDXL Turbo 빠른 생성 — 디테일 부족, 경계 신호 모호
    { name: 'hard_fake_sdxl_turbo_lowquality_7.jpg', label: 'FAKE', signals: { cfaScore: 0.50, lightingScore: 0.48, ganScore: 0.55, fileScore: 0.52, geoScore: 0.46, avgCorr: 0.50, noiseLevel: 0.05, asymmetry: 0.16, lbpUniformity: 0.64, edgeEntropy: 0.60, edgeMag: 0.20, skinRatio: 0.33, grayStd: 0.10, origWidth: 512, origHeight: 512 } },
    // 스마트폰 야간 사진 (노이즈 리덕션으로 피부 매끄러워 보임)
    { name: 'hard_real_night_mode_nr_portrait_8.jpg', label: 'REAL', signals: { cfaScore: 0.28, lightingScore: 0.22, ganScore: 0.38, fileScore: 0.26, geoScore: 0.30, avgCorr: 0.38, noiseLevel: 0.07, asymmetry: 0.08, lbpUniformity: 0.58, edgeEntropy: 0.80, edgeMag: 0.11, skinRatio: 0.26, grayStd: 0.13, origWidth: 1080, origHeight: 1350 } }
  ];

  async function loadTuningSection() {
    try {
      activeWeights = await API.get('/forensics/weights');
      syncTuningSliders(activeWeights);
      updateDatasetUI();
    } catch (e) {
      Toast.error('가중치 설정을 불러오지 못했습니다');
    }
  }

  function syncTuningSliders(w) {
    const fields = [
      ['cfa', 'input-cfa', 'val-cfa', true],
      ['lighting', 'input-lighting', 'val-lighting', true],
      ['gan', 'input-gan', 'val-gan', true],
      ['file', 'input-file', 'val-file', true],
      ['geo', 'input-geo', 'val-geo', true],
      ['imageFakeThreshold', 'input-img-fake', 'val-img-fake', false],
      ['imageSuspiciousThreshold', 'input-img-susp', 'val-img-susp', false],
      ['videoFakeThreshold', 'input-vid-fake', 'val-vid-fake', false],
      ['videoSuspiciousThreshold', 'input-vid-susp', 'val-vid-susp', false],
    ];

    fields.forEach(([key, inputId, valId, isWeightPair]) => {
      const input = document.getElementById(inputId);
      const valSpan = document.getElementById(valId);
      if (!input) return;

      input.value = w[key];
      if (valSpan) {
        if (isWeightPair) {
          const dfKey = key + 'Df';
          valSpan.textContent = `${Number(w[key]).toFixed(2)} / ${Number(w[dfKey]).toFixed(2)}`;
        } else {
          valSpan.textContent = Number(w[key]).toFixed(2);
        }
      }
    });
    
    fields.forEach(([key, inputId, valId, isWeightPair]) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.oninput = () => {
        const val = parseFloat(input.value);
        activeWeights[key] = val;
        if (isWeightPair) {
          const dfKey = key + 'Df';
          activeWeights[dfKey] = parseFloat((val * (0.92 / 0.95)).toFixed(4));
          const valSpan = document.getElementById(valId);
          if (valSpan) valSpan.textContent = `${val.toFixed(2)} / ${activeWeights[dfKey].toFixed(2)}`;
        } else {
          const valSpan = document.getElementById(valId);
          if (valSpan) valSpan.textContent = val.toFixed(2);
        }
        runEvaluation(activeWeights);
      };
    });
  }

  function runEvaluation(w) {
    if (!testDataset.length) {
      document.getElementById('eval-metrics-card')?.classList.add('hidden');
      document.getElementById('btn-run-optimization').disabled = true;
      return;
    }

    const metrics = evaluateDataset(testDataset, w);
    renderMetrics(metrics);
    document.getElementById('eval-metrics-card')?.classList.remove('hidden');
    document.getElementById('btn-run-optimization').disabled = false;
  }

  function evaluateDataset(dataset, w) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    // 3단계 분류: FAKE(score > fakeThreshold) / SUSPICIOUS(suspThreshold < score <= fakeThreshold) / REAL
    // isPredictedFake: score가 suspiciousThreshold 초과이면 탐지로 간주 (FAKE + SUSPICIOUS 모두 양성)
    // 이전 버그: imageSuspiciousThreshold만 사용해 imageFakeThreshold가 평가에 반영되지 않았음
    const perItem = dataset.map(item => {
      const score = calculateLocalScore(item.signals, w);
      // 3단계 예측 레이블
      const predictedLabel = score >= w.imageFakeThreshold ? 'FAKE'
                           : score >= w.imageSuspiciousThreshold ? 'SUSPICIOUS'
                           : 'REAL';
      // FAKE/SUSPICIOUS를 모두 양성(탐지됨)으로 처리
      const isPredictedPositive = predictedLabel !== 'REAL';
      const isActualFake = item.label === 'FAKE';

      if (isPredictedPositive && isActualFake) tp++;
      else if (isPredictedPositive && !isActualFake) fp++;
      else if (!isPredictedPositive && !isActualFake) tn++;
      else if (!isPredictedPositive && isActualFake) fn++;

      return { ...item, score, predictedLabel, correct: isPredictedPositive === isActualFake };
    });

    const total = dataset.length;
    const accuracy = total > 0 ? (tp + tn) / total : 0;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    return { tp, fp, tn, fn, accuracy, precision, recall, f1, perItem };
  }

  function calculateLocalScore(signals, w) {
    const origW = signals.origWidth || 512;
    const origH = signals.origHeight || 512;
    const cfaTrust = signals.cfaTrust !== undefined ? signals.cfaTrust : Math.max(0, Math.min(1, (Math.min(origW, origH) - 128) / (512 - 128)));
    const cfaAI = signals.cfaScore * cfaTrust;
    const cfaDf = signals.cfaScore * cfaTrust;

    const baseAI = (signals.avgCorr || 0.4) * 0.08 + (1 - (signals.noiseLevel || 0.05)) * 0.07 + 
                   (1 - Math.min(1, (signals.asymmetry || 0.05) * 6)) * 0.04 + (signals.lbpUniformity || 0.5) * 0.05 + 
                   (1 - (signals.edgeEntropy || 0.6)) * 0.04 + (signals.overSatRatio || 0.1) * 0.03 + 
                   (1 - Math.min(1, (signals.grayStd || 0.15) * 4)) * 0.03 - 0.05;
                   
    const newAI = cfaAI * w.cfa + 
                  (signals.lightingScore || 0) * w.lighting + 
                  (signals.ganScore || 0) * w.gan + 
                  (signals.fileScore || 0) * w.file + 
                  (signals.geoScore || 0) * w.geo;
                  
    const aiRaw = baseAI + newAI;
    const ai = Math.min(0.88, Math.max(0.02, aiRaw));

    const baseDf = (signals.avgCorr || 0.4) * 0.06 + (1 - (signals.noiseLevel || 0.05)) * 0.06 + 
                   (signals.lbpUniformity || 0.5) * 0.07 + 
                   ((signals.edgeMag || 0.1) > 0.05 && (signals.edgeMag || 0.1) < 0.25 ? 0.06 : 0.01) + 
                   (1 - (signals.edgeEntropy || 0.6)) * 0.05 + (signals.skinRatio || 0.15) * 0.05 - 0.05;
                   
    const newDf = cfaDf * w.cfaDf + 
                  (signals.lightingScore || 0) * w.lightingDf + 
                  (signals.ganScore || 0) * w.ganDf + 
                  (signals.fileScore || 0) * w.fileDf + 
                  (signals.geoScore || 0) * w.geoDf;
                  
    const dfRaw = baseDf + newDf;
    const df = Math.min(0.88, Math.max(0.02, dfRaw));

    const cAvg = Math.max(df, ai);
    const localBase = Math.max(cAvg, ai * 0.95, df * 0.9);

    const sumWeights = (w.cfa + w.lighting + w.gan + w.geo + w.file) || 1;
    const forensicAll = cfaAI * (w.cfa / sumWeights) + 
                        (signals.lightingScore || 0) * (w.lighting / sumWeights) + 
                        (signals.ganScore || 0) * (w.gan / sumWeights) + 
                        (signals.geoScore || 0) * (w.geo / sumWeights) + 
                        (signals.fileScore || 0) * (w.file / sumWeights);

    const forensicBoost = forensicAll > 0.40
      ? forensicAll * 0.35
      : forensicAll > 0.25
        ? forensicAll * 0.18
        : 0;
        
    return Math.min(0.97, localBase + forensicBoost);
  }

  function renderMetrics(m) {
    document.getElementById('metric-f1').textContent = (m.f1 * 100).toFixed(1) + '%';
    document.getElementById('metric-acc').textContent = (m.accuracy * 100).toFixed(1) + '%';
    document.getElementById('metric-pre').textContent = (m.precision * 100).toFixed(1) + '%';
    document.getElementById('metric-rec').textContent = (m.recall * 100).toFixed(1) + '%';

    document.getElementById('cm-tp').textContent = `TP: ${m.tp}`;
    document.getElementById('cm-fp').textContent = `FP: ${m.fp}`;
    document.getElementById('cm-tn').textContent = `TN: ${m.tn}`;
    document.getElementById('cm-fn').textContent = `FN: ${m.fn}`;

    // 상세 결과 테이블 렌더링 (perItem 존재 시)
    const detailEl = document.getElementById('eval-detail-table');
    if (!detailEl || !m.perItem) return;
    const labelColor = { FAKE: 'var(--clr-danger)', SUSPICIOUS: 'var(--clr-warn)', REAL: 'var(--clr-safe)' };
    detailEl.innerHTML = m.perItem.map(it => {
      const scoreBar = `<div style="height:4px;background:rgba(255,255,255,.07);border-radius:2px;margin-top:3px;width:100%"><div style="height:100%;width:${Math.round(it.score*100)}%;background:${it.score>0.38?'var(--clr-danger)':it.score>0.22?'var(--clr-warn)':'var(--clr-safe)'};border-radius:2px;transition:width .3s"></div></div>`;
      const wrongIcon = it.correct ? '' : ' <span style="color:var(--clr-danger);font-weight:700" title="오판정">✗</span>';
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-size:.72rem">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.55)">${escHtml(it.name)}</span>
        <span style="width:52px;text-align:center;font-size:.65rem;padding:1px 6px;border-radius:999px;background:${labelColor[it.label]}22;color:${labelColor[it.label]}">${it.label}</span>
        <span style="width:52px;text-align:center;font-size:.65rem;padding:1px 6px;border-radius:999px;background:${labelColor[it.predictedLabel]}22;color:${labelColor[it.predictedLabel]}">${it.predictedLabel}${wrongIcon}</span>
        <div style="width:72px">${scoreBar}<span style="font-size:.62rem;color:rgba(255,255,255,.3)">${(it.score*100).toFixed(1)}%</span></div>
        <button class="btn btn--ghost" style="padding:2px 6px;font-size:.6rem;min-width:0" onclick="DG.Admin.showSignalDetail('${it.id}')">상세</button>
      </div>`;
    }).join('');
  }

  function updateDatasetUI() {
    const badge = document.getElementById('dataset-count-badge');
    const hint = document.getElementById('opt-hint-text');
    if (badge) badge.textContent = `${testDataset.length}개 이미지 로드됨`;

    if (testDataset.length > 0) {
      if (hint) hint.style.display = 'none';
      runEvaluation(activeWeights);
    } else {
      if (hint) hint.style.display = 'block';
      document.getElementById('eval-metrics-card')?.classList.add('hidden');
      document.getElementById('btn-run-optimization').disabled = true;
    }
  }

  function loadBenchmarkDataset() {
    testDataset = [...BENCHMARK_DATA];
    updateDatasetUI();
    Toast.success('16개의 사전 정의된 벤치마크 데이터를 로드했습니다');
  }

  function clearDataset() {
    testDataset = [];
    const listEl = document.getElementById('tuning-file-list');
    if (listEl) {
      listEl.innerHTML = '';
      listEl.classList.add('hidden');
    }
    updateDatasetUI();
    document.getElementById('opt-comparison-card')?.classList.add('hidden');
    Toast.info('데이터셋을 비웠습니다');
  }

  async function saveWeights() {
    try {
      await API.post('/forensics/weights', activeWeights, API.getToken());
      Toast.success('가중치 및 임계값이 백엔드에 성공적으로 적용 및 영구 저장되었습니다!');
    } catch (e) {
      Toast.error('저장 실패: ' + e.message);
    }
  }

  function resetWeights() {
    Modal.open({
      title: '가중치 초기화',
      body: '<p style="font-size:.875rem;color:rgba(255,255,255,.6)">가중치 및 임계값을 시스템 기본값으로 복원하시겠습니까?</p>',
      confirmLabel: '초기화 실행',
      onConfirm: () => {
        activeWeights = { ...DEFAULT_WEIGHTS };
        syncTuningSliders(activeWeights);
        runEvaluation(activeWeights);
        Toast.success('기본값으로 복원되었습니다. 저장 버튼을 누르면 영구 적용됩니다.');
      }
    });
  }

  function runOptimization() {
    if (!testDataset.length) return;
    const btn = document.getElementById('btn-run-optimization');
    btn.disabled = true;
    btn.textContent = '최적 가중치 탐색 중...';

    setTimeout(() => {
      const beforeMetrics = evaluateDataset(testDataset, activeWeights);

      let bestScore = -1;
      let bestW = null;

      for (let i = 0; i < 15000; i++) {
        const cfa = Math.random();
        const lighting = Math.random();
        const gan = Math.random();
        const file = Math.random();
        const geo = Math.random();
        const sum = (cfa + lighting + gan + file + geo) || 1;

        const w = {
          cfa: (cfa / sum) * 0.95,
          lighting: (lighting / sum) * 0.95,
          gan: (gan / sum) * 0.95,
          file: (file / sum) * 0.95,
          geo: (geo / sum) * 0.95,

          cfaDf: (cfa / sum) * 0.92,
          lightingDf: (lighting / sum) * 0.92,
          ganDf: (gan / sum) * 0.92,
          fileDf: (file / sum) * 0.92,
          geoDf: (geo / sum) * 0.92,

          imageFakeThreshold: 0.20 + Math.random() * 0.45,
          imageSuspiciousThreshold: 0.10 + Math.random() * 0.25,
          videoFakeThreshold: 0.30 + Math.random() * 0.45,
          videoSuspiciousThreshold: 0.15 + Math.random() * 0.25,
        };

        if (w.imageFakeThreshold <= w.imageSuspiciousThreshold) continue;
        if (w.videoFakeThreshold <= w.videoSuspiciousThreshold) continue;

        const metrics = evaluateDataset(testDataset, w);
        const score = (metrics.f1 * 15) + metrics.accuracy;

        if (score > bestScore) {
          bestScore = score;
          bestW = w;
        }
      }

      optimizedParams = bestW;
      const afterMetrics = evaluateDataset(testDataset, bestW);

      document.getElementById('opt-before-f1').textContent = (beforeMetrics.f1 * 100).toFixed(1) + '%';
      document.getElementById('opt-after-f1').textContent = (afterMetrics.f1 * 100).toFixed(1) + '%';
      
      document.getElementById('opt-before-acc').textContent = (beforeMetrics.accuracy * 100).toFixed(1) + '%';
      document.getElementById('opt-after-acc').textContent = (afterMetrics.accuracy * 100).toFixed(1) + '%';

      document.getElementById('opt-before-pre').textContent = (beforeMetrics.precision * 100).toFixed(1) + '%';
      document.getElementById('opt-after-pre').textContent = (afterMetrics.precision * 100).toFixed(1) + '%';

      document.getElementById('opt-before-rec').textContent = (beforeMetrics.recall * 100).toFixed(1) + '%';
      document.getElementById('opt-after-rec').textContent = (afterMetrics.recall * 100).toFixed(1) + '%';

      document.getElementById('opt-comparison-card').classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>가중치 & 임계값 자동 최적화 시작`;
      
      Toast.success(`최적화 완료! F1-Score가 ${(beforeMetrics.f1 * 100).toFixed(0)}%에서 ${(afterMetrics.f1 * 100).toFixed(0)}%로 개선되었습니다.`);
    }, 100);
  }

  function applyOptimizedWeights() {
    if (!optimizedParams) return;
    activeWeights = { ...optimizedParams };
    syncTuningSliders(activeWeights);
    runEvaluation(activeWeights);
    document.getElementById('opt-comparison-card').classList.add('hidden');
    Toast.success('최적화된 값이 슬라이더에 대입되었습니다. 저장 버튼을 누르면 서버에 반영됩니다.');
  }

  function discardOptimized() {
    optimizedParams = null;
    document.getElementById('opt-comparison-card').classList.add('hidden');
  }

  function handleTuningFiles(files) {
    if (!files.length) return;
    const listEl = document.getElementById('tuning-file-list');
    listEl.classList.remove('hidden');

    if (!tuningWorker) {
      tuningWorker = new Worker('./js/analyzer.worker.js');
      tuningWorker.postMessage({ type: 'INIT' });
    }

    Array.from(files).forEach(file => {
      const id = 'tuning-item-' + Math.random().toString(36).slice(2, 9);
      const row = document.createElement('div');
      row.id = id;
      row.className = 'flex items-center justify-between';
      row.style.background = 'rgba(255,255,255,.02)';
      row.style.padding = '8px 12px';
      row.style.border = '1px solid rgba(255,255,255,.05)';
      row.style.borderRadius = '6px';
      row.innerHTML = `
        <span style="font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${escHtml(file.name)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:.68rem;color:rgba(255,255,255,.3)">분석 중...</span>
        </div>
      `;
      listEl.appendChild(row);

      createImageBitmap(file)
        .then(bmp => {
          // 포렌식 신호(FRAME_RESULT)와 최종 판정(ANALYSIS_COMPLETE) 모두 수집
          let frameSignals = null;
          const handleMsg = ({ data }) => {
            if (data.type === 'FRAME_RESULT') {
              // FRAME_RESULT에서 포렌식 신호만 임시 저장
              frameSignals = data.payload.forensicSignals;
            }
            if (data.type === 'ANALYSIS_COMPLETE') {
              tuningWorker.removeEventListener('message', handleMsg);
              const signals = frameSignals || {};
              // ANALYSIS_COMPLETE의 실제 점수도 signals에 병합
              signals._localScore = data.payload.avgConfidence;
              signals._verdict = data.payload.verdict;
              signals._dfAvg = data.payload.dfAvgConfidence;
              signals._aiAvg = data.payload.aiAvgConfidence;

              const item = { id, name: file.name, label: 'REAL', signals };
              testDataset.push(item);
              updateDatasetUI();

              const scoreLabel = signals._localScore !== undefined
                ? `<span style="font-size:.62rem;color:rgba(255,255,255,.3);margin-right:4px">${(signals._localScore*100).toFixed(0)}%</span>`
                : '';
              row.querySelector('div').innerHTML = `
                ${scoreLabel}
                <select class="form-select" style="font-size:.7rem;padding:3px 6px;height:24px;background:var(--clr-surface-3)" onchange="DG.Admin.updateLabel('${id}', this.value)">
                  <option value="REAL">실제 (REAL)</option>
                  <option value="FAKE">위조 (FAKE)</option>
                </select>
                <button class="btn btn--ghost" style="padding:2px;min-width:0;margin-left:2px" title="포렌식 신호 상세보기" onclick="DG.Admin.showSignalDetail('${id}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                <button class="btn btn--ghost" style="padding:2px;min-width:0" onclick="DG.Admin.removeTuningItem('${id}')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--clr-danger)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              `;
            }
          };
          tuningWorker.addEventListener('message', handleMsg);
          tuningWorker.postMessage({ type: 'ANALYZE', payload: { frames: [{ imageBitmap: bmp, frameIndex: 1, timestamp: 0 }] } }, [bmp]);
        })
        .catch(err => {
          row.querySelector('div').innerHTML = `<span style="font-size:.68rem;color:var(--clr-danger)">오류</span>`;
          console.error(err);
        });
    });
  }

  function updateLabel(id, label) {
    const item = testDataset.find(x => x.id === id);
    if (item) {
      item.label = label;
      runEvaluation(activeWeights);
    }
  }

  function removeTuningItem(id) {
    testDataset = testDataset.filter(x => x.id !== id);
    const row = document.getElementById(id);
    if (row) row.remove();
    updateDatasetUI();
  }

  // 포렌식 신호 상세 모달: 각 이미지의 5개 모듈 점수 + 최종 로컬 판정 시각화
  function showSignalDetail(id) {
    const item = testDataset.find(x => x.id === id);
    if (!item) return;
    const s = item.signals || {};
    const modules = [
      { label: 'CFA 노이즈 매핑',   key: 'cfaScore',      color: 'rgba(0,200,255,.8)'    },
      { label: '조명 메타데이터',     key: 'lightingScore', color: 'rgba(255,210,0,.8)'    },
      { label: 'GAN 픽셀 검사',      key: 'ganScore',      color: 'rgba(255,100,150,.8)'  },
      { label: '파일 데이터',         key: 'fileScore',     color: 'rgba(160,130,255,.8)'  },
      { label: '기하학 노이즈',       key: 'geoScore',      color: 'rgba(80,220,140,.8)'   },
    ];
    const barRows = modules.map(m => {
      const v = s[m.key] !== undefined ? s[m.key] : 0;
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:3px">
          <span style="color:rgba(255,255,255,.6)">${m.label}</span>
          <span style="font-weight:600;color:${m.color}">${(v*100).toFixed(1)}%</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,.07);border-radius:3px">
          <div style="height:100%;width:${(v*100).toFixed(1)}%;background:${m.color};border-radius:3px"></div>
        </div>
      </div>`;
    }).join('');

    const localScore = s._localScore;
    const scoreLine = localScore !== undefined
      ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07)">
          <div style="display:flex;justify-content:space-between;font-size:.75rem">
            <span style="color:rgba(255,255,255,.5)">최종 로컬 판정 점수</span>
            <span style="font-weight:700;color:${localScore>0.38?'var(--clr-danger)':localScore>0.22?'var(--clr-warn)':'var(--clr-safe)'}">${(localScore*100).toFixed(1)}%</span>
          </div>
          ${s._verdict ? `<div style="font-size:.68rem;color:rgba(255,255,255,.3);margin-top:3px">Verdict: ${s._verdict}  |  AI: ${s._aiAvg!==undefined?(s._aiAvg*100).toFixed(0):'?'}%  DF: ${s._dfAvg!==undefined?(s._dfAvg*100).toFixed(0):'?'}%</div>` : ''}
        </div>`
      : '';

    const extra = [
      ['avgCorr', '채널 상관관계'],['noiseLevel','노이즈 레벨'],['asymmetry','좌우 비대칭'],
      ['lbpUniformity','LBP 균일도'],['edgeEntropy','에지 엔트로피'],['edgeMag','에지 강도'],
      ['skinRatio','피부 비율'],['grayStd','명도 표준편차'],
    ].filter(([k])=>s[k]!==undefined).map(([k,l])=>
      `<span style="font-size:.65rem;color:rgba(255,255,255,.35)">${l}: <b style="color:rgba(255,255,255,.55)">${(s[k]*100).toFixed(1)}%</b></span>`
    ).join('  ');

    Modal.open({
      title: `🔬 포렌식 신호 상세 — ${escHtml(item.name)}`,
      body: `<div style="font-size:.8rem">${barRows}${scoreLine}${extra?`<div style="margin-top:10px;line-height:1.9">${extra}</div>`:''}</div>`,
      confirmLabel: '닫기',
      onConfirm: () => {},
    });
  }

  function initTuningEvents() {
    document.getElementById('btn-load-benchmark')?.addEventListener('click', loadBenchmarkDataset);
    document.getElementById('btn-clear-dataset')?.addEventListener('click', clearDataset);
    document.getElementById('btn-save-weights')?.addEventListener('click', saveWeights);
    document.getElementById('btn-reset-weights')?.addEventListener('click', resetWeights);
    document.getElementById('btn-run-optimization')?.addEventListener('click', runOptimization);
    document.getElementById('btn-apply-opt-weights')?.addEventListener('click', applyOptimizedWeights);
    document.getElementById('btn-discard-opt')?.addEventListener('click', discardOptimized);

    const uploadZone = document.getElementById('tuning-upload-zone');
    const fileInput = document.getElementById('tuning-file-input');

    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', e => handleTuningFiles(e.target.files));

      uploadZone.addEventListener('dragover', e => {
        e.preventDefault();
        uploadZone.style.borderColor = 'var(--clr-accent)';
      });
      uploadZone.addEventListener('dragleave', () => {
        uploadZone.style.borderColor = 'rgba(255,255,255,.1)';
      });
      uploadZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadZone.style.borderColor = 'rgba(255,255,255,.1)';
        handleTuningFiles(e.dataTransfer.files);
      });
    }
  }

  /* ─── Util ───────────────────────────────────────────────── */
  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ─── Init ───────────────────────────────────────────────── */
  function init() {
    initLoginPage();
    Store.set('hashSearch', { filters:{}, page:1 });
    if (document.getElementById('mod-tbody')) {
      initAdminPage();
      initModerationFilters();
      initHashSearchFilters();
      document.getElementById('notice-submit-btn')?.addEventListener('click', submitNotice);
      initTuningEvents();
    }
  }

  window.DG.Admin = { init, deletePost, loadModeration, loadHashSearch, loadNotices, submitNotice, deleteNotice, markAllNotifRead, handleNotifClick, switchSection, loadTuningSection, loadBenchmarkDataset, clearDataset, saveWeights, resetWeights, runOptimization, applyOptimizedWeights, discardOptimized, updateLabel, removeTuningItem, showSignalDetail };
  window.DG.Auth = Auth;
})();
