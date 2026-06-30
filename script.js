/* ============================================================
   🏆 谁是第一名 — 大厅 + 游戏完整逻辑
   ============================================================ */
(function () {
  'use strict';

  // ===================== 常量 =====================
  const COUNTDOWN_SECONDS = 10;
  const COUNTDOWN_PREP = 3;
  const ITEM_COOLDOWN = 1500; // 动画播完即冷却

  // ===================== DOM =====================
  const $ = s => document.querySelector(s);
  // Views
  const profileView = $('#profile-view');
  const lobbyView   = $('#lobby-view');
  const waitingView = $('#waiting-view');
  const gameView    = $('#game-view');
  const resultView  = $('#result-view');

  // Profile
  const avatarPreview = $('#avatar-preview');
  const avatarInput   = $('#avatar-input');
  const nicknameInput = $('#nickname-input');
  const nicknameCount = $('#nickname-count');
  const profileSaveBtn = $('#profile-save-btn');

  // Lobby
  const lobbyStage       = $('#lobby-stage');
  const lobbyBottom      = $('#lobby-bottom');
  const roomList         = $('#room-list');
  const createRoomBtn    = $('#create-room-btn');
  const logoutBtn        = $('#logout-btn');
  const roomCreateForm   = $('#room-create-form');
  const roomNameInput    = $('#room-name-input');
  const roomCreateConfirm = $('#room-create-confirm');
  const roomCreateCancel  = $('#room-create-cancel');
  const roomPasswordInput = $('#room-password-input');
  const commentInput     = $('#comment-input');
  const commentSendBtn   = $('#comment-send-btn');
  const itemPopup        = $('#item-popup');
  const itemTargetName   = $('#item-target-name');
  const itemPopupClose   = $('#item-popup-close');

  // Waiting
  const playerListEl  = $('#player-list');
  const playerCountEl = $('#player-count');
  const ownerActions  = $('#owner-actions');
  const startBtn      = $('#start-btn');
  const leaveRoomBtn  = $('#leave-room-btn');
  const replayBtn     = $('#replay-btn');
  const propModeCheck = $('#prop-mode-checkbox');
  const propModeLabel = $('#prop-mode-label');
  // Password modal
  const pwdModal    = $('#pwd-modal');
  const pwdInput    = $('#pwd-input');
  const pwdConfirm  = $('#pwd-confirm');
  const pwdCancel   = $('#pwd-cancel');
  // Prop intro modal
  const propIntroModal = $('#prop-intro-modal');
  const propIntroList  = $('#prop-intro-list');
  const propIntroClose = $('#prop-intro-close');
  const waitingRoomTitle = $('#waiting-room-title');
  const roomSubtitle  = $('#room-subtitle');

  // Game
  const countdownDisplay = $('#countdown-display');
  const countdownLabel   = $('#countdown-label');
  const clickArea        = $('#click-area');
  const clickScoreDisplay = $('#click-score-display');
  const clickBtn         = $('#click-btn');
  const buffReveal       = $('#buff-reveal');
  const buffIconEl       = $('#buff-icon');
  const buffNameEl       = $('#buff-name');
  const buffDescEl       = $('#buff-desc');
  const buffScoreEl      = $('#buff-score');
  const waitingOthers    = $('#waiting-others');

  // Result
  const rankingList = $('#ranking-list');
  const loserNameEl = $('#loser-name');
  const ownerReset  = $('#owner-reset');
  const resetBtn    = $('#reset-btn');
  const backToLobbyBtn = $('#back-to-lobby-btn');

  // History
  const historyBtn   = $('#history-btn');
  const historyModal = $('#history-modal');
  const historyList  = $('#history-list');
  const historyClose = $('#history-close');

  const toastContainer = $('#toast-container');

  // ===================== Supabase =====================
  const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

  // ===================== 全局状态 =====================
  let playerToken = null;
  let myProfile   = null; // { nickname, avatar_b64 }
  let myUserRecord = null;
  let roomId      = null;
  let currentRoom = null;  // 当前所在房间对象
  let isRoomOwner = false;

  // 游戏状态
  let clickCount   = 0;
  let gameActive   = false;
  let gameFinished = false;
  let allPlayers   = [];
  let gamePlayerRecord = null;
  let gameResults = new Map(); // token → { name, click_count, buff, final_score } — 广播收集模式

  // 大厅状态
  let onlineUsers  = [];
  let lobbyRooms   = [];
  let selectedTarget = null;
  let lastItemTime = 0;
  let pollInterval = null;
  let lobbyUsersInterval = null;
  let heartbeatInterval = null;
  let presenceUserInfo = {};  // { token: { nickname, avatar_b64 } }
  let presenceMap = {};       // { token: lastSeenTimestamp }

  // Realtime channels
  let lobbyChannel    = null;
  let gameChannel     = null;

  // ===================== 工具函数 =====================
  function showToast(msg, type) {
    type = type || 'error';
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 5000);
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function switchView(name) {
    [profileView, lobbyView, waitingView, gameView, resultView].forEach(v => v.classList.remove('active'));
    if (name === 'profile') profileView.classList.add('active');
    if (name === 'lobby')   lobbyView.classList.add('active');
    if (name === 'waiting') waitingView.classList.add('active');
    if (name === 'game')    gameView.classList.add('active');
    if (name === 'result')  resultView.classList.add('active');
  }

  // ===================== 个人资料 =====================
  let avatarBase64 = '';
  const avatarSection = $('#avatar-section');

  avatarPreview.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files[0];
    if (!file) return;
    avatarBase64 = await compressAvatar(file);
    avatarPreview.innerHTML = `<img src="${avatarBase64}" alt="avatar">`;
    checkProfileReady();
  });

  function compressAvatar(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const size = 60;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
          ctx.clip();
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  nicknameInput.addEventListener('input', () => {
    nicknameCount.textContent = nicknameInput.value.length;
    checkProfileReady();
  });
  nicknameInput.addEventListener('compositionend', () => {
    nicknameCount.textContent = nicknameInput.value.length;
    checkProfileReady();
  });
  // 定时兜底：微信等特殊浏览器中 input 事件可能不触发，每 150ms 强检
  setInterval(() => {
    if (profileView.classList.contains('active')) {
      nicknameCount.textContent = nicknameInput.value.length;
      checkProfileReady();
    }
  }, 150);

  function checkProfileReady() {
    const nick = nicknameInput.value.trim();
    profileSaveBtn.disabled = nick.length === 0;
  }

  // 登录（查找已有账号）
  profileSaveBtn.addEventListener('click', async () => {
    const nick = nicknameInput.value.trim();
    if (!nick) return;
    profileSaveBtn.disabled = true;
    profileSaveBtn.textContent = '登录中...';

    // 先查 DB 是否有这个昵称
    const { data: exist } = await supabase.from('users').select('*').eq('nickname', nick).limit(1);

    if (exist && exist.length > 0) {
      // 已有用户 → 加载资料直接进
      const user = exist[0];
      myProfile = { nickname: user.nickname, avatar_b64: user.avatar_b64 || '' };
      // 更新 token 和在线状态
      await supabase.from('users').update({
        player_token: playerToken,
        avatar_b64: user.avatar_b64 || '',
        is_online: true,
        last_seen: new Date().toISOString()
      }).eq('id', user.id).eq('nickname', user.nickname);
      localStorage.setItem('profile_nickname', user.nickname);
      localStorage.setItem('profile_avatar', user.avatar_b64 || '');
      enterLobby();
      return;
    }

    // 新用户 → 需要头像
    if (avatarSection.style.display === 'none') {
      avatarSection.style.display = 'block';
      profileSaveBtn.textContent = '上传头像后进入';
      profileSaveBtn.disabled = !avatarBase64;
      return;
    }

    if (!avatarBase64) {
      showToast('请上传头像');
      profileSaveBtn.textContent = '进入大厅';
      profileSaveBtn.disabled = false;
      return;
    }

    // 创建新用户
    const { error } = await supabase.from('users').insert({
      nickname: nick, avatar_b64: avatarBase64,
      player_token: playerToken, is_online: true,
      last_seen: new Date().toISOString()
    });
    if (error) { showToast('创建失败'); profileSaveBtn.disabled = false; profileSaveBtn.textContent = '进入大厅'; return; }

    myProfile = { nickname: nick, avatar_b64: avatarBase64 };
    localStorage.setItem('profile_nickname', nick);
    localStorage.setItem('profile_avatar', avatarBase64);
    enterLobby();
  });

  // ===================== 大厅 =====================
  // 日志
  function log(tag, msg, data) {
    const ts = new Date().toISOString().slice(11,19);
    console.log(`[${ts}][${tag}]`, msg, data || '');
  }

  async function enterLobby() {
    stopAllIntervals();
    supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('player_token', playerToken).then(()=>{}).catch(()=>{});
    switchView('lobby');
    physicsRAF = null; physicsUsers = {};
    onlineUsers = [];
    log('大厅','进入，重置状态');

    setupLobbyRealtime();

    presenceMap = {};
    presenceUserInfo = {};
    presenceMap[playerToken] = Date.now();
    presenceUserInfo[playerToken] = { nickname: myProfile.nickname, avatar_b64: myProfile.avatar_b64 };
    onlineUsers = [{ player_token: playerToken, nickname: myProfile.nickname, avatar_b64: myProfile.avatar_b64 }];
    renderLobbyUsers();
    log('大厅','初始在线', onlineUsers.length);

    // 广播自己的存在
    function broadcastPresence() {
      if (!myProfile || !lobbyChannel) { log('心跳','跳过 myProfile/lobbyChannel为空'); return; }
      log('心跳','发送presence', playerToken.slice(0,8));
      lobbyChannel.send({
        type: 'broadcast', event: 'presence',
        payload: { from_token: playerToken, nickname: myProfile.nickname, avatar_b64: myProfile.avatar_b64 }
      });
    }
    broadcastPresence();
    heartbeatInterval = setInterval(broadcastPresence, 2000);

    // 加载房间 + 轮询
    await fetchLobbyRooms();
    renderLobbyRooms();

    lobbyUsersInterval = setInterval(() => {
      const now = Date.now();
      let removed = 0;
      Object.keys(presenceMap).forEach(t => {
        if (t !== playerToken && now - presenceMap[t] > 6000) {
          const age = Math.round((now - presenceMap[t])/1000);
          log('轮询','移除超时用户', t.slice(0,8)+' '+age+'s');
          delete presenceMap[t];
          removed++;
        }
      });
      const prevCount = onlineUsers.length;
      onlineUsers = [];
      Object.keys(presenceMap).forEach(t => {
        const info = presenceUserInfo[t];
        if (info) onlineUsers.push({ player_token: t, nickname: info.nickname, avatar_b64: info.avatar_b64 });
      });
      if (prevCount !== onlineUsers.length || removed > 0) {
        log('轮询','在线人数变化', prevCount+'->'+onlineUsers.length);
      }
      renderLobbyUsers();
      fetchLobbyRooms().then(() => renderLobbyRooms());
    }, 1000);

    // 退出
    logoutBtn.onclick = async () => {
      await supabase.from('users').update({ is_online: false }).eq('player_token', playerToken);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      stopAllIntervals();
      myProfile = null;
      localStorage.removeItem('profile_nickname');
      localStorage.removeItem('profile_avatar');
      switchView('profile');
      avatarSection.style.display = 'block';
      avatarBase64 = '';
      avatarPreview.innerHTML = '<span class="avatar-placeholder">+</span>';
      nicknameInput.value = '';
      profileSaveBtn.textContent = '进入大厅';
      profileSaveBtn.disabled = true;
    };
  }

  async function fetchOnlineUsers() {
    // 在线 或 最近 120 秒内有心跳
    const cutoff = new Date(Date.now() - 120000).toISOString();
    const { data } = await supabase.from('users').select('*').eq('is_online', true).gte('last_seen', cutoff).order('nickname');
    onlineUsers = data || [];
    return onlineUsers;
  }

  async function fetchLobbyRooms() {
    const { data } = await supabase.from('rooms').select('*').eq('is_active', true).order('created_at', { ascending: false });
    lobbyRooms = data || [];
    // 为每个房间附加人数，同时清理离线成员和空房间
    const clean = [];
    const cutoff = new Date(Date.now() - 60000).toISOString();
    for (const room of lobbyRooms) {
      const { data: members } = await supabase.from('room_members').select('id, user_token').eq('room_id', room.id);
      const tokens = (members || []).map(m => m.user_token);
      let staleIds = [];
      if (tokens.length > 0) {
        const { data: users } = await supabase.from('users').select('player_token, is_online, last_seen').in('player_token', tokens);
        const onlineTokens = new Set((users || []).filter(u => u.is_online || (u.last_seen && u.last_seen >= cutoff)).map(u => u.player_token));
        staleIds = (members || []).filter(m => !onlineTokens.has(m.user_token)).map(m => m.id);
      }
      // 删除离线成员
      if (staleIds.length > 0) {
        await supabase.from('room_members').delete().in('id', staleIds);
      }
      // 再查一次真实人数
      const { count } = await supabase.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', room.id);
      room._memberCount = count || 0;
      if (!count || count === 0) clean.push(room.id);
    }
    if (clean.length > 0) {
      lobbyRooms = lobbyRooms.filter(r => !clean.includes(r.id));
      for (const id of clean) {
        supabase.from('rooms').delete().eq('id', id).then(()=>{}).catch(()=>{});
      }
    }
    return lobbyRooms;
  }

  // 大厅物理引擎
  let physicsRAF = null;
  let physicsUsers = {}; // { token: { el, x, y, vx, vy } }

  function startPhysics() {
    if (physicsRAF) cancelAnimationFrame(physicsRAF);
    let lastTime = 0;
    function tick(now) {
      const dt = Math.min((now - lastTime) / 16, 3); // 限制最大步长
      lastTime = now;
      const stageW = lobbyStage.clientWidth || 500;
      const stageH = lobbyStage.clientHeight || 300;
      const tokens = Object.keys(physicsUsers);
      const avatarW = 56, avatarH = 80;

      for (const t of tokens) {
        const p = physicsUsers[t];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.9; }
        if (p.x > stageW - avatarW) { p.x = stageW - avatarW; p.vx = -Math.abs(p.vx) * 0.9; }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.9; }
        if (p.y > stageH - avatarH) { p.y = stageH - avatarH; p.vy = -Math.abs(p.vy) * 0.9; }
      }

      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const a = physicsUsers[tokens[i]], b = physicsUsers[tokens[j]];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const minDist = 56;
          if (dist < minDist && dist > 0) {
            const nx = dx / dist, ny = dy / dist;
            const overlap = minDist - dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
            const rvDotN = rvx * nx + rvy * ny;
            if (rvDotN > 0) {
              a.vx -= rvDotN * nx * 0.5;
              a.vy -= rvDotN * ny * 0.5;
              b.vx += rvDotN * nx * 0.5;
              b.vy += rvDotN * ny * 0.5;
            }
          }
        }
      }

      for (const t of tokens) {
        const p = physicsUsers[t];
        p.el.style.left = p.x + 'px';
        p.el.style.top = p.y + 'px';
      }
      physicsRAF = requestAnimationFrame(tick);
    }
    physicsRAF = requestAnimationFrame(tick);
  }

  function stopPhysics() {
    if (physicsRAF) { cancelAnimationFrame(physicsRAF); physicsRAF = null; }
    physicsUsers = {};
  }

  function renderLobbyUsers() {
    const stageW = lobbyStage.clientWidth || 500;
    const stageH = lobbyStage.clientHeight || 300;
    // 去重 + 只保留有 info 的用户
    const uniqueUsers = [];
    const seen = new Set();
    onlineUsers.forEach(u => {
      if (!seen.has(u.player_token)) { seen.add(u.player_token); uniqueUsers.push(u); }
    });
    onlineUsers = uniqueUsers;
    const currentTokens = new Set(onlineUsers.map(u => u.player_token));

    // 移除下线的（检查 DOM 是否还存在）
    Object.keys(physicsUsers).forEach(token => {
      if (!currentTokens.has(token)) {
        const u = physicsUsers[token];
        const nick = u && u.el ? (u.el.querySelector('.avatar-nick')||{}).textContent || '?' : '?';
        log('渲染','移除用户', nick);
        if (u && u.el && u.el.parentNode) u.el.remove();
        delete physicsUsers[token];
      }
    });

    // 添加 / 更新
    onlineUsers.forEach(user => {
      const isSelf = user.player_token === playerToken;
      // 双重检查：physicsUsers 和 DOM
      const domExists = lobbyStage.querySelector(`[data-token="${user.player_token}"]`);
      if (domExists && !physicsUsers[user.player_token]) {
        // DOM 有但 physics 没追踪 → 清除旧 DOM
        domExists.remove();
      }
      if (!physicsUsers[user.player_token]) {
        log('物理','新增用户', user.nickname);
        const div = document.createElement('div');
        div.className = 'float-avatar';
        div.dataset.token = user.player_token;
        div.innerHTML = `
          <div class="avatar-circle">${user.avatar_b64 ? `<img src="${user.avatar_b64}">` : ''}</div>
          <span class="avatar-nick">${escapeHTML(user.nickname)}</span>`;
        if (!isSelf) div.addEventListener('click', () => openItemPopup(user));
        lobbyStage.appendChild(div);
        physicsUsers[user.player_token] = {
          el: div,
          x: 20 + Math.random() * (stageW - 80),
          y: 20 + Math.random() * (stageH - 100),
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4
        };
      } else {
        physicsUsers[user.player_token].el.querySelector('.avatar-nick').textContent = user.nickname;
      }
    });

    if (!physicsRAF) startPhysics();
  }

  function renderLobbyRooms() {
    if (lobbyRooms.length === 0) {
      roomList.innerHTML = '<p class="empty-hint" style="font-size:.75rem;padding:12px 0">暂无房间</p>';
      return;
    }
    roomList.innerHTML = lobbyRooms.map(r => `
      <div class="room-card" data-room-id="${r.id}">
        <div class="room-name">${r.password ? '🔒 ' : ''}${escapeHTML(r.name)}</div>
        <div class="room-info">${r._memberCount || 0} 人</div>
      </div>
    `).join('');

    roomList.querySelectorAll('.room-card').forEach(card => {
      card.addEventListener('click', () => joinRoom(card.dataset.roomId));
    });
  }

  // 创建房间
  createRoomBtn.addEventListener('click', () => {
    roomCreateForm.style.display = 'flex';
    roomNameInput.focus();
    createRoomBtn.style.display = 'none';
    if (lobbyBottom) lobbyBottom.style.display = 'none'; // 移动端隐藏底部弹幕栏，避免键盘遮挡
  });

  roomCreateCancel.addEventListener('click', () => {
    roomCreateForm.style.display = 'none';
    roomNameInput.value = '';
    createRoomBtn.style.display = 'block';
    if (lobbyBottom) lobbyBottom.style.display = '';
  });

  roomCreateConfirm.addEventListener('click', async () => {
    const name = roomNameInput.value.trim();
    if (!name) return showToast('输入房间名');
    const pwd = roomPasswordInput.value.trim();
    roomCreateConfirm.disabled = true;
    const { data, error } = await supabase.from('rooms').insert({
      name, password: pwd, creator_token: playerToken, is_active: true
    }).select().single();
    if (error) { showToast('创建失败'); roomCreateConfirm.disabled = false; return; }

    await supabase.from('room_members').insert({ room_id: data.id, user_token: playerToken, is_owner: true });
    roomCreateForm.style.display = 'none';
    roomNameInput.value = '';
    roomPasswordInput.value = '';
    roomCreateConfirm.disabled = false;
    createRoomBtn.style.display = 'block';
    if (lobbyBottom) lobbyBottom.style.display = '';
    currentRoom = data;
    isRoomOwner = true;
    enterWaitingRoom(data);
  });

  // 加入房间
  async function joinRoom(roomId, needPwd) {
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room) return showToast('房间不存在');
    if (room.password) {
      if (needPwd === undefined) {
        // 需要密码 → 弹出密码弹窗
        showPwdModal(room);
        return;
      }
      if (needPwd !== room.password) return showToast('密码错误');
    }
    const { data: existing } = await supabase.from('room_members').select('*').eq('room_id', roomId).eq('user_token', playerToken);
    if (existing && existing.length === 0) {
      const { error } = await supabase.from('room_members').insert({ room_id: roomId, user_token: playerToken, is_owner: false });
      if (error) { showToast('加入失败'); return; }
    }
    currentRoom = room;
    isRoomOwner = room.creator_token === playerToken;
    enterWaitingRoom(room);
  }

  // 密码弹窗
  let pendingRoom = null;
  function showPwdModal(room) {
    pendingRoom = room;
    pwdInput.value = '';
    pwdModal.style.display = 'flex';
    setTimeout(() => pwdInput.focus(), 100);
  }
  pwdConfirm.addEventListener('click', () => {
    const pwd = pwdInput.value.trim();
    pwdModal.style.display = 'none';
    if (pendingRoom) joinRoom(pendingRoom.id, pwd);
    pendingRoom = null;
  });
  pwdCancel.addEventListener('click', () => {
    pwdModal.style.display = 'none';
    pendingRoom = null;
  });
  pwdInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') pwdConfirm.click();
  });
  pwdModal.addEventListener('click', e => {
    if (e.target === pwdModal) { pwdModal.style.display = 'none'; pendingRoom = null; }
  });

  // 道具赛开关 → 向所有人展示道具说明
  propModeCheck.addEventListener('change', () => {
    if (propModeCheck.checked && isRoomOwner) {
      gameChannel.send({ type: 'broadcast', event: 'prop_intro', payload: {} });
      showPropIntro();
    }
  });
  // 道具说明弹窗
  function showPropIntro() {
    propIntroList.innerHTML = BUFFS.map(b =>
      `<div class="prop-intro-item">
        <span class="prop-intro-icon">${b.icon}</span>
        <div class="prop-intro-text">
          <div class="prop-intro-name">${b.name} <span style="font-size:.7rem;color:var(--text-muted)">${b.w}%</span></div>
          <div class="prop-intro-desc">${b.desc}</div>
        </div>
      </div>`
    ).join('');
    propIntroModal.style.display = 'flex';
  }
  propIntroClose.addEventListener('click', () => { propIntroModal.style.display = 'none'; });
  propIntroModal.addEventListener('click', e => { if (e.target === propIntroModal) propIntroModal.style.display = 'none'; });

  // 进入等待室
  async function enterWaitingRoom(room) {
    stopAllIntervals();
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    // 保持在线（人在房间也是在线，否则会被大厅清理逻辑误删）
    supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('player_token', playerToken).then(()=>{}).catch(()=>{});
    // 清空上轮游戏状态
    gameResults.clear();
    gameActive = false; gameFinished = false;
    clickCount = 0;
    // 持久化房间状态（刷新后能恢复）
    localStorage.setItem('active_room_id', room.id);
    localStorage.setItem('active_room_name', room.name);
    localStorage.setItem('active_room_owner', isRoomOwner ? '1' : '0');
    currentRoom = room;
    roomId = room.id;
    switchView('waiting');
    waitingRoomTitle.textContent = '⚔️ ' + room.name;
    roomSubtitle.textContent = isRoomOwner ? '你是房主，等人齐就能开始！' : '等待房主开始...';
    if (isRoomOwner) { ownerActions.style.display = 'block'; propModeLabel.style.display = 'block'; }
    else { ownerActions.style.display = 'none'; propModeLabel.style.display = 'none'; }
    replayBtn.style.display = 'none';
    // 重置开始按钮状态
    startBtn.disabled = false;
    startBtn.textContent = '全军出击';
    allPlayers = [];
    gameActive = false; gameFinished = false;
    await fetchWaitingPlayers();
    setupGameRealtime();
    pollInterval = setInterval(fetchWaitingPlayers, 2000);
  }

  async function fetchWaitingPlayers() {
    const { data: members } = await supabase.from('room_members').select('*').eq('room_id', roomId);
    const tokens = (members || []).map(m => m.user_token);
    const { data: users } = await supabase.from('users').select('*').in('player_token', tokens);
    allPlayers = (users || []).map(u => ({
      id: u.id, name: u.nickname, player_token: u.player_token,
      click_count: 0, buff: '', final_score: 0, is_finished: false,
      is_owner: u.player_token === (currentRoom ? currentRoom.creator_token : ''),
      game_started: false
    }));
    // 检测房主是否已切换到自己
    const myMember = (members || []).find(m => m.user_token === playerToken);
    if (myMember && myMember.is_owner && !isRoomOwner) {
      isRoomOwner = true;
      currentRoom.creator_token = playerToken;
      localStorage.setItem('active_room_owner', '1');
      roomSubtitle.textContent = '你是房主，等人齐就能开始！';
    }

    // 如果房间没有人是 owner（比如房主关网页了），第一个成员自动晋升
    const hasOwner = (members || []).some(m => m.is_owner);
    if (!hasOwner && (members || []).length > 0) {
      const first = members[0]; // 已按 joined_at 排序
      // 只有第一个成员的客户端执行晋升，避免多人同时操作
      if (first.user_token === playerToken) {
        await supabase.from('room_members').update({ is_owner: true }).eq('id', first.id);
        await supabase.from('rooms').update({ creator_token: first.user_token }).eq('id', roomId);
        isRoomOwner = true;
        currentRoom.creator_token = playerToken;
        localStorage.setItem('active_room_owner', '1');
        roomSubtitle.textContent = '你是房主，等人齐就能开始！';
        if (gameChannel) {
          gameChannel.send({ type: 'broadcast', event: 'owner_changed', payload: { new_owner: first.user_token } });
        }
      }
    }
    // 清理离线超过 60 秒的成员
    const cutoff = new Date(Date.now() - 60000).toISOString();
    const offlineTokens = (users || []).filter(u =>
      u.player_token !== playerToken && !u.is_online && u.last_seen < cutoff
    ).map(u => u.player_token);
    if (offlineTokens.length > 0) {
      await supabase.from('room_members').delete().eq('room_id', roomId).in('user_token', offlineTokens);
      // 检查房间是否还有人
      const { count: remain } = await supabase.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', roomId);
      if (!remain || remain === 0) {
        // 房间空了，解散
        await supabase.from('rooms').delete().eq('id', roomId);
        currentRoom = null; isRoomOwner = false; roomId = null; allPlayers = [];
        localStorage.removeItem('active_room_id');
        localStorage.removeItem('active_room_name');
        localStorage.removeItem('active_room_owner');
        enterLobby();
        return;
      }
      // 如果被移除的是 owner，触发晋升
      const stillHasOwner = await supabase.from('room_members').select('id').eq('room_id', roomId).eq('is_owner', true).limit(1);
      const { data: still } = stillHasOwner;
      if (!still || still.length === 0) {
        // 没有 owner 了，promote 第一个
        const { data: first } = await supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at', { ascending: true }).limit(1);
        if (first && first.length > 0) {
          await supabase.from('room_members').update({ is_owner: true }).eq('id', first[0].id);
          await supabase.from('rooms').update({ creator_token: first[0].user_token }).eq('id', roomId);
          if (gameChannel) gameChannel.send({ type: 'broadcast', event: 'owner_changed', payload: { new_owner: first[0].user_token } });
        }
      }
    }
    renderPlayerListUI();
    playerCountEl.textContent = allPlayers.length;
    if (isRoomOwner) { ownerActions.style.display = 'block'; propModeLabel.style.display = 'block'; }
    else { ownerActions.style.display = 'none'; propModeLabel.style.display = 'none'; }
  }

  let lastPlayerNames = ''; // 避免 DOM 闪烁

  function renderPlayerListUI() {
    if (allPlayers.length === 0) {
      playerListEl.innerHTML = '<p class="empty-hint">虚位以待...</p>';
      lastPlayerNames = '';
      return;
    }
    const names = allPlayers.map(p => p.name).sort().join(',');
    if (names === lastPlayerNames) return;
    lastPlayerNames = names;
    playerListEl.innerHTML = allPlayers.map(p =>
      `<span class="player-tag${p.is_owner ? ' owner-tag' : ''}">${p.is_owner ? '👑 ' : ''}${escapeHTML(p.name)}</span>`
    ).join('');
  }

  leaveRoomBtn.addEventListener('click', exitRoomToLobby);

  // ===================== 游戏（广播模式，不依赖 players 表）=====================
  startBtn.addEventListener('click', async () => {
    if (!isRoomOwner) return;
    // 重新拉取当前房间人员（防止上一轮残留）
    await fetchWaitingPlayers();
    if (allPlayers.length < 2) return showToast('至少 2 人才能开始！');

    startBtn.disabled = true;
    startBtn.textContent = '启动中...';
    // 彻底清空上轮所有数据
    gameResults.clear();
    // 清除 DB 中上轮结果
    supabase.from('room_members').update({ result_json: null }).eq('room_id', roomId).then(()=>{}).catch(()=>{});
    // 广播游戏开始 + 玩家名单
    gameChannel.send({
      type: 'broadcast', event: 'game_start',
      payload: { players: allPlayers.map(p => ({ name: p.name, player_token: p.player_token })) }
    });
    gameActive = true;
    enterGamePhase();
  });

  function enterGamePhase() {
    stopAllIntervals();
    gameResults.clear();
    switchView('game');
    countdownDisplay.style.display = 'block';
    countdownLabel.style.display = 'block';
    clickArea.style.display = 'none';
    buffReveal.style.display = 'none';
    clickCount = 0;
    gameActive = true;
    gameFinished = false;
    clickScoreDisplay.textContent = '0';
    clickBtn.disabled = false;
    startPrepCountdown();
  }

  function startPrepCountdown() {
    let prep = COUNTDOWN_PREP;
    countdownDisplay.textContent = prep;
    countdownDisplay.className = 'countdown-display';
    countdownLabel.textContent = '全军出击！';
    const iv = setInterval(() => {
      prep--;
      if (prep <= 0) { clearInterval(iv); countdownDisplay.textContent='GO!'; countdownDisplay.className='countdown-display go'; countdownLabel.textContent='疯狂点击！'; setTimeout(startMainCountdown,500); }
      else countdownDisplay.textContent = prep;
    }, 800);
  }

  function startMainCountdown() {
    countdownDisplay.textContent = COUNTDOWN_SECONDS;
    countdownDisplay.className = 'countdown-display';
    clickArea.style.display = 'flex';
    let remaining = COUNTDOWN_SECONDS;
    const iv = setInterval(() => {
      remaining--;
      countdownDisplay.textContent = remaining;
      if (remaining <= 0) { clearInterval(iv); endClickPhase(); }
    }, 1000);
  }

  function endClickPhase() {
    gameActive = false;
    clickBtn.disabled = true;
    countdownDisplay.textContent = '0';
    countdownDisplay.className = 'countdown-display';
    countdownLabel.textContent = '时间到！';
    setTimeout(() => {
      countdownDisplay.style.display = 'none';
      countdownLabel.style.display = 'none';
      clickArea.style.display = 'none';
      calculateAndRevealBuff();
    }, 800);
  }

  function handleClick(e) {
    if (!gameActive) return;
    clickCount++;
    clickScoreDisplay.textContent = clickCount;
    spawnFloatPlus(e);
  }

  function spawnFloatPlus(e) {
    const el = document.createElement('span');
    el.className = 'float-plus';
    el.textContent = '+1';
    const colors = ['#a855f7','#06b6d4','#ec4899','#fbbf24','#22c55e'];
    el.style.color = colors[Math.floor(Math.random()*colors.length)];
    let x, y;
    if (e.touches && e.touches.length > 0) { x = e.touches[0].clientX; y = e.touches[0].clientY; }
    else if (e.clientX !== undefined) { x = e.clientX; y = e.clientY; }
    else { const rect = clickBtn.getBoundingClientRect(); x = rect.left+rect.width/2; y = rect.top+rect.height/2; }
    el.style.left = (x-20+(Math.random()-.5)*60)+'px';
    el.style.top = (y-10)+'px';
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1200);
  }

  // Buff 系统
  const BUFFS = [
    { name:'🚀 火箭加速', desc:'总分翻倍！', icon:'🚀', fn: s=>s*2, w:10 },
    { name:'💣 哑弹', desc:'扣5分...', icon:'💣', fn: s=>Math.max(0,s-5), w:10 },
    { name:'🎯 精准打击', desc:'不是第一则+5分', icon:'🎯', fn: s=>s, w:10 },
    { name:'🛡️ 无事发生', desc:'维持原分', icon:'🛡️', fn: s=>s, w:70 },
  ];
  const BUFF_ROULETTE = (() => {
    let arr = [];
    BUFFS.forEach((b, i) => { for (let j = 0; j < b.w; j++) arr.push(i); });
    return arr;
  })();

  async function calculateAndRevealBuff() {
    const b = BUFFS[BUFF_ROULETTE[Math.floor(Math.random() * BUFF_ROULETTE.length)]];
    const finalScore = b.fn(clickCount, allPlayers, { player_token: playerToken });
    buffIconEl.textContent = b.icon;
    buffNameEl.textContent = b.name;
    buffDescEl.textContent = b.desc;
    buffScoreEl.textContent = finalScore+' 分';
    buffReveal.style.display = 'flex';
    waitingOthers.style.display = 'block';

    // 写入 room_members.result_json（可靠 UPDATE，不依赖 players 表）
    const myResult = {
      player_token: playerToken, name: myProfile.nickname,
      click_count: clickCount, buff: b.name, final_score: finalScore
    };
    gameResults.set(playerToken, myResult);
    await supabase.from('room_members')
      .update({ result_json: JSON.stringify(myResult) })
      .eq('room_id', roomId).eq('user_token', playerToken);
    // 广播通知其他人"我结算完了"
    gameChannel.send({ type: 'broadcast', event: 'player_result', payload: myResult });
    // 尝试写 players 表（尽力而为，用于历史记录）
    try {
      await supabase.from('players').upsert({
        room_id: String(roomId), name: myProfile.nickname, player_token: playerToken,
        click_count: clickCount, buff: b.name, final_score: finalScore,
        is_finished: true, is_owner: isRoomOwner, game_started: true
      });
    } catch(e) {}
    gameFinished = true;
    pollCompletion();
  }

  function pollCompletion() {
    let polls = 0;
    const expectedCount = allPlayers.length || 1;
    // 保存自己的结果，供重发使用
    const myResult = gameResults.get(playerToken);
    const doPoll = async () => {
      polls++;
      // 1) 从 DB 查 room_members.result_json（可靠存储）
      try {
        const { data: members } = await supabase.from('room_members')
          .select('user_token, result_json').eq('room_id', roomId).not('result_json', 'is', null);
        if (members) {
          members.forEach(m => {
            try {
              const r = JSON.parse(m.result_json);
              if (r && r.player_token && !gameResults.has(r.player_token)) {
                gameResults.set(r.player_token, r);
              }
            } catch(e) {}
          });
        }
      } catch(e) { /* 查询失败（未建列等），继续用广播收集 */ }
      // 2) 如果还没集齐，重发自己的结果（广播兜底）
      if (myResult && gameResults.size < expectedCount && polls > 1) {
        gameChannel.send({ type: 'broadcast', event: 'player_result', payload: myResult });
      }
      const collected = gameResults.size;
      log('结算轮询', `${collected}/${expectedCount} 人, polls=${polls}`);
      if (collected >= expectedCount || polls >= 20) {
        clearInterval(iv);
        const results = Array.from(gameResults.values());
        showResults(results);
      } else {
        waitingOthers.textContent = `已结算 ${collected}/${expectedCount} 人...`;
      }
    };
    // 立即执行第一轮，然后每秒轮询
    doPoll();
    const iv = setInterval(() => doPoll(), 1000);
  }

  async function showResults(players) {
    const sorted = (players||[]).sort((a,b)=>b.final_score-a.final_score);
    // 精准打击：不是点击之王则抢最高点击者 5 分（自己 +5，对方 -5）
    const maxClicks = Math.max(...sorted.map(p => p.click_count || 0), 0);
    const striker = sorted.find(p => (p.buff || '').includes('精准打击'));
    if (striker && (striker.click_count || 0) < maxClicks) {
      striker.final_score += 5;
      // 找点击次数最高的人，扣 5 分
      const victim = sorted.find(p => p.player_token !== striker.player_token && (p.click_count || 0) === maxClicks);
      if (victim) victim.final_score = Math.max(0, victim.final_score - 5);
    }
    // 重新排序
    sorted.sort((a,b)=>b.final_score-a.final_score);
    // 获取头像：优先 onlineUsers（大厅在线数据），兜底从 users 表查
    const tokenMap = {};
    onlineUsers.forEach(u => { tokenMap[u.player_token] = { nick: u.nickname, avatar: u.avatar_b64 }; });
    // 从 users 表补充缺失的头像
    const missing = sorted.filter(p => !tokenMap[p.player_token]);
    if (missing.length > 0) {
      const { data: users } = await supabase.from('users').select('player_token,avatar_b64')
        .in('player_token', missing.map(p => p.player_token));
      (users||[]).forEach(u => { tokenMap[u.player_token] = { nick: '', avatar: u.avatar_b64 }; });
    }

    rankingList.innerHTML = sorted.map((p,i)=>{
      const cls = i===sorted.length-1&&sorted.length>1?'rank-item last-place':'rank-item';
      const badge = i<3 ? ['🥇','🥈','🥉'][i] : `${i+1}`;
      const info = tokenMap[p.player_token] || {};
      const avatarImg = info.avatar ? `<img src="${info.avatar}" class="rank-avatar">` : '<span class="rank-avatar-empty">👤</span>';
      return `<div class="${cls}">
        <span class="rank-badge">${badge}</span>
        <div class="rank-avatar-wrap">${avatarImg}</div>
        <div class="rank-info">
          <div class="rank-name">${escapeHTML(p.name)}</div>
          <div class="rank-buff">${escapeHTML(p.buff||'无Buff')} | 点击 ${p.click_count} 次</div>
        </div>
        <span class="rank-score">${p.final_score}分</span>
      </div>`;
    }).join('');
    if (sorted.length>0) {
      loserNameEl.textContent = sorted[sorted.length-1].name;
      // 异步存历史（失败不阻塞）
      (async () => {
        try {
          await supabase.from('game_history').insert({
            room_name: currentRoom ? currentRoom.name : '',
            room_id: currentRoom ? currentRoom.id : '',
            players_json: JSON.stringify(sorted.map(p=>({
              name:p.name, nickname:p.name, score:p.final_score, clicks:p.click_count,
              buff:p.buff, avatar:(tokenMap[p.player_token]||{}).avatar||''
            }))),
            loser: sorted[sorted.length-1].player_token,
            loser_nickname: sorted[sorted.length-1].name,
            played_at: new Date().toISOString()
          });
        } catch(e) { console.warn('history save failed', e); }
      })();
    } else {
      loserNameEl.textContent = '???';
      rankingList.innerHTML = '<p class="empty-hint" style="text-align:center;padding:24px">⏳ 等待玩家结算中...</p>';
    }
    switchView('result');
    if (isRoomOwner) { ownerReset.style.display = 'block'; replayBtn.style.display = 'block'; }
    else { ownerReset.style.display = 'none'; replayBtn.style.display = 'none'; }
    // 非房主也可看到返回大厅
    backToLobbyBtn.style.display = 'block';
  }

  // 房主离开后顺延下一位
  async function promoteNextOwner() {
    const { data: members } = await supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at', { ascending: true });
    if (!members || members.length === 0) return;
    const newOwner = members[0];
    // 确保只有新 owner 的 is_owner 为 true
    await supabase.from('room_members').update({ is_owner: false }).eq('room_id', roomId).neq('id', newOwner.id);
    await supabase.from('room_members').update({ is_owner: true }).eq('id', newOwner.id);
    await supabase.from('rooms').update({ creator_token: newOwner.user_token }).eq('id', roomId);
    // 广播通知房间内所有人
    if (gameChannel) {
      gameChannel.send({ type: 'broadcast', event: 'owner_changed', payload: { new_owner: newOwner.user_token } });
    }
  }

  async function exitRoomToLobby() {
    const wasOwner = isRoomOwner;
    await supabase.from('room_members').delete().eq('user_token', playerToken).eq('room_id', roomId);
    if (wasOwner) await promoteNextOwner();
    // 查询当前房间是否还有人，没人则直接删掉房间（兜底，防止 trigger 未生效）
    const { count } = await supabase.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', roomId);
    if (!count || count === 0) {
      await supabase.from('rooms').delete().eq('id', roomId).then(()=>{}).catch(()=>{});
    }
    stopAllIntervals();
    currentRoom = null; isRoomOwner = false; roomId = null; allPlayers = [];
    localStorage.removeItem('active_room_id');
    localStorage.removeItem('active_room_name');
    localStorage.removeItem('active_room_owner');
    enterLobby();
  }

  resetBtn.addEventListener('click', async () => {
    gameResults.clear();
    gameActive = false; gameFinished = false;
    clickCount = 0;
    // 广播通知所有人重置
    gameChannel.send({ type: 'broadcast', event: 'game_reset', payload: {} });
    enterWaitingRoom(currentRoom);
  });

  replayBtn.addEventListener('click', async () => {
    gameResults.clear();
    gameActive = false; gameFinished = false;
    clickCount = 0;
    gameChannel.send({ type: 'broadcast', event: 'game_reset', payload: {} });
    enterWaitingRoom(currentRoom);
  });

  backToLobbyBtn.addEventListener('click', exitRoomToLobby);

  // 历史记录
  historyBtn.addEventListener('click', () => showHistory());
  historyClose.addEventListener('click', () => { historyModal.style.display = 'none'; });
  historyModal.addEventListener('click', e => { if (e.target === historyModal) historyModal.style.display = 'none'; });

  async function showHistory() {
    historyModal.style.display = 'flex';
    try {
      const { data } = await supabase.from('game_history').select('*').order('played_at', { ascending: false }).limit(50);
      // 过滤：只显示当前用户参与过的场次
      const myNick = (myProfile && myProfile.nickname) ? myProfile.nickname : '';
      const records = (data || []).filter(r => {
        try {
          const players = JSON.parse(r.players_json || '[]');
          return players.some(p => p.name === myNick || p.nickname === myNick);
        } catch(e) { return false; }
      });
      if (records.length === 0) {
        historyList.innerHTML = '<p class="empty-hint">暂无记录，快去来一局！</p>';
        return;
      }
      historyList.innerHTML = records.map((r, idx) => {
        const players = JSON.parse(r.players_json || '[]');
        const sorted = players.sort((a,b) => b.score - a.score);
        const dt = new Date(r.played_at);
        const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        // 生成排名详情 HTML
        const detailHTML = sorted.map((p,i) => {
          const badge = i===0 ? '🥇' : (i===1 ? '🥈' : (i===2 ? '🥉' : `${i+1}`));
          const isMe = (p.name === myNick || p.nickname === myNick);
          return `<div class="h-detail-row${isMe ? ' h-highlight' : ''}">
            <span class="h-detail-rank">${badge}</span>
            <span class="h-detail-name">${escapeHTML(p.name||p.nickname)}${isMe?' (我)':''}</span>
            <span class="h-detail-stats">${escapeHTML(p.buff||'')} · ${p.clicks}次点击 · ${p.score}分</span>
          </div>`;
        }).join('');
        return `<div class="history-card" onclick="this.classList.toggle('expanded')">
          <div class="h-header">
            <span class="h-date">${dateStr}</span>
            <span class="h-room">${escapeHTML(r.room_name)}</span>
            <span class="h-count">${sorted.length}人</span>
          </div>
          <div class="h-detail">${detailHTML}</div>
        </div>`;
      }).join('');
    } catch(e) {
      historyList.innerHTML = '<p class="empty-hint">暂无记录（需先执行建表 SQL）</p>';
    }
  }

  // ===================== 道具 & 弹幕 =====================
  function openItemPopup(targetUser) {
    if (targetUser.player_token === playerToken) return;
    selectedTarget = targetUser;
    itemTargetName.textContent = targetUser.nickname;
    itemPopup.style.display = 'flex';
  }

  itemPopupClose.addEventListener('click', () => { itemPopup.style.display = 'none'; selectedTarget = null; });
  itemPopup.addEventListener('click', e => { if (e.target === itemPopup) { itemPopup.style.display = 'none'; selectedTarget = null; } });

  itemPopup.querySelectorAll('.item-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.dataset.item;
      itemPopup.style.display = 'none';
      throwItem(selectedTarget, item);
      selectedTarget = null;
    });
  });

  function throwItem(target, itemType) {
    const now = Date.now();
    if (now - lastItemTime < ITEM_COOLDOWN) { showToast('冷却中...'); return; }
    lastItemTime = now;
    // Broadcast 广播（不存库）
    lobbyChannel.send({ type: 'broadcast', event: 'item_thrown', payload: { from_token: playerToken, to_token: target.player_token, item_type: itemType } });
    animateItemFly(playerToken, target.player_token, itemType);
  }

  // 道具效果映射：{ cssClass, pushStrength, duration }
  const ITEM_EFFECTS = {
    tomato:  { cls:'avatar-hit-red',    push:8,  dur:2000, emoji:'🍅' },
    egg:     { cls:'avatar-hit-yellow', push:5,  dur:2000, emoji:'🥚' },
    broccoli:{ cls:'avatar-hit-green',  push:5,  dur:2000, emoji:'🥦' },
    drumstick:{ cls:'avatar-hit-brown', push:6,  dur:2000, emoji:'🍗' },
    bomb:    { cls:'avatar-hit-burnt',  push:15, dur:2000, emoji:'💣' },
    rocket:  { cls:'avatar-hit-burnt',  push:20, dur:2000, emoji:'🚀' },
    '666':   { cls:'',                  push:4,  dur:1500, emoji:'6️⃣' },
    poop:    { cls:'avatar-hit-brown',  push:6,  dur:2000, emoji:'💩' },
  };

  function animateItemFly(fromToken, toToken, itemType) {
    const fromPhys = physicsUsers[fromToken];
    const toPhys = physicsUsers[toToken];
    if (!fromPhys || !toPhys) return;
    const eff = ITEM_EFFECTS[itemType] || ITEM_EFFECTS.tomato;
    const stageRect = lobbyStage.getBoundingClientRect();

    const fly = document.createElement('span');
    fly.className = 'item-fly';
    fly.textContent = eff.emoji;
    fly.style.position = 'fixed';
    fly.style.fontSize = '1.8rem';
    fly.style.pointerEvents = 'none';
    fly.style.zIndex = '1000';
    document.body.appendChild(fly);

    const startTime = performance.now();
    const duration = 800; // ms
    const arcHeight = 80;

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

      const sx = stageRect.left + fromPhys.x + 26;
      const sy = stageRect.top + fromPhys.y + 26;
      const tx = stageRect.left + toPhys.x + 26;
      const ty = stageRect.top + toPhys.y + 26;

      const cx = sx + (tx - sx) * ease;
      const cy = sy + (ty - sy) * ease - Math.sin(t * Math.PI) * arcHeight;
      fly.style.left = cx + 'px';
      fly.style.top = cy + 'px';
      fly.style.transform = `translate(-50%,-50%) scale(${1 + Math.sin(t*Math.PI)*0.4}) rotate(${t*360}deg)`;

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        fly.remove();
        // 命中效果精确落在目标位置
        const hit = document.createElement('span');
        hit.className = 'hit-effect';
        hit.textContent = eff.emoji;
        hit.style.left = tx + 'px';
        hit.style.top = ty + 'px';
        document.body.appendChild(hit);
        setTimeout(() => hit.remove(), 600);

        // 目标头像效果（作用在外层 .float-avatar 上）
        const toEl = lobbyStage.querySelector(`[data-token="${toToken}"]`);
        if (toEl) {
          if (eff.cls) {
            toEl.classList.add(eff.cls);
            setTimeout(() => toEl.classList.remove(eff.cls), eff.dur);
          }
          toEl.classList.add('avatar-impact');
          setTimeout(() => toEl.classList.remove('avatar-impact'), 500);
        }
        // 物理推力
        const pu = physicsUsers[toToken];
        const pf = physicsUsers[fromToken];
        if (pu && pf) {
          const dx = pu.x - pf.x;
          const dy = pu.y - pf.y;
          const dist = Math.sqrt(dx*dx+dy*dy) || 1;
          pu.vx += (dx/dist) * (eff.push || 30) * 0.5;
          pu.vy += (dy/dist) * (eff.push || 30) * 0.5;
        }
      }
    }
    requestAnimationFrame(frame);
  }

  // 弹幕（Broadcast 广播，不存库）
  commentSendBtn.addEventListener('click', sendComment);
  commentInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendComment(); });

  function sendComment() {
    const msg = commentInput.value.trim();
    if (!msg) return;
    commentInput.value = '';
    lobbyChannel.send({ type: 'broadcast', event: 'barrage', payload: { from_token: playerToken, comment: msg } });
    showBubble(playerToken, myProfile.nickname, msg);
  }

  function showBubble(token, nick, msg) {
    const avatar = lobbyStage.querySelector(`[data-token="${token}"]`);
    if (!avatar) return;
    // 多个气泡堆叠：count 已有的 bubble，给新的分配 stack 层级
    const existing = avatar.querySelectorAll('.chat-bubble');
    const stackIdx = existing.length % 3;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (stackIdx > 0) bubble.classList.add('stack' + stackIdx);
    bubble.textContent = `${nick}: ${msg}`;
    avatar.appendChild(bubble);
    setTimeout(() => bubble.remove(), 5000);
  }

  // ===================== Realtime =====================
  function setupLobbyRealtime() {
    if (lobbyChannel) supabase.removeChannel(lobbyChannel);
    lobbyChannel = supabase.channel('lobby')
      .on('broadcast', { event: 'presence' }, payload => {
        const p = payload.payload;
        if (p.from_token !== playerToken) {
          if (!presenceMap[p.from_token]) log('presence','新用户加入', p.nickname);
          presenceMap[p.from_token] = Date.now();
          presenceUserInfo[p.from_token] = { nickname: p.nickname, avatar_b64: p.avatar_b64 };
        }
      })
      .on('broadcast', { event: 'item_thrown' }, payload => {
        if (payload.payload.from_token !== playerToken) {
          animateItemFly(payload.payload.from_token, payload.payload.to_token, payload.payload.item_type);
        }
      })
      .on('broadcast', { event: 'barrage' }, payload => {
        const u = onlineUsers.find(x => x.player_token === payload.payload.from_token);
        if (u) showBubble(payload.payload.from_token, u.nickname, payload.payload.comment);
      })
      .subscribe();
  }

  function setupGameRealtime() {
    if (gameChannel) supabase.removeChannel(gameChannel);
    gameChannel = supabase.channel('game-'+roomId)
      .on('broadcast', { event: 'game_start' }, payload => {
        if (!gameActive && !gameFinished) {
          // 从广播获取玩家名单（非 owner 也需要知道等谁）
          if (payload.payload && payload.payload.players) {
            allPlayers = payload.payload.players;
          }
          gameResults.clear();
          gameActive = true;
          stopAllIntervals();
          enterGamePhase();
        }
      })
      .on('broadcast', { event: 'player_result' }, payload => {
        const r = payload.payload;
        if (r && r.player_token) {
          log('结算', `收到 ${r.name} 的结果: ${r.final_score}分`);
          gameResults.set(r.player_token, r);
        }
      })
      .on('broadcast', { event: 'owner_changed' }, () => {
        fetchWaitingPlayers();
      })
      .on('broadcast', { event: 'game_reset' }, () => {
        // 房主开启了新一轮，所有人回到等待室
        gameResults.clear();
        gameActive = false;
        gameFinished = false;
        clickCount = 0;
        stopAllIntervals();
        enterWaitingRoom(currentRoom);
      })
      .on('broadcast', { event: 'prop_intro' }, () => {
        showPropIntro();
      })
      .subscribe();
  }

  function stopAllIntervals() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (lobbyUsersInterval) { clearInterval(lobbyUsersInterval); lobbyUsersInterval = null; }
    stopPhysics();
  }

  // ===================== 全局 Realtime 事件 =====================
  clickBtn.addEventListener('mousedown', e => { e.preventDefault(); handleClick(e); });
  clickBtn.addEventListener('touchstart', e => { e.preventDefault(); handleClick(e); });
  clickBtn.addEventListener('dblclick', e => e.preventDefault());

  // ===================== 初始化 =====================
  async function init() {
    playerToken = localStorage.getItem('player_token');
    if (!playerToken) { playerToken = generateUUID(); localStorage.setItem('player_token', playerToken); }

    const savedNick = localStorage.getItem('profile_nickname');
    const savedAvatar = localStorage.getItem('profile_avatar');

    if (savedNick) {
      myProfile = { nickname: savedNick, avatar_b64: savedAvatar || '' };
      // 以 DB 中的 player_token 为准，确保 room_members 关联不丢
      const { data: dbUser } = await supabase.from('users').select('player_token,avatar_b64').eq('nickname', savedNick).limit(1);
      if (dbUser && dbUser.length > 0) {
        playerToken = dbUser[0].player_token;
        localStorage.setItem('player_token', playerToken);
        myProfile.avatar_b64 = dbUser[0].avatar_b64 || savedAvatar || '';
      } else {
        // 新设备第一次：用当前 token 创建记录
        await supabase.from('users').insert({
          nickname: savedNick, avatar_b64: savedAvatar || '',
          player_token: playerToken, is_online: true, last_seen: new Date().toISOString()
        });
      }
      // 检查是否有未退出的房间
      const savedRoomId = localStorage.getItem('active_room_id');
      const savedRoomName = localStorage.getItem('active_room_name');
      const savedRoomOwner = localStorage.getItem('active_room_owner');
      if (savedRoomId && savedRoomName) {
        // 恢复房间状态
        const { data: room } = await supabase.from('rooms').select('*').eq('id', savedRoomId).single();
        if (room && room.is_active) {
          currentRoom = room;
          roomId = room.id;
          isRoomOwner = savedRoomOwner === '1';
          // 确保成员记录存在
          const { data: member } = await supabase.from('room_members').select('*').eq('room_id', roomId).eq('user_token', playerToken);
          if (!member || member.length === 0) {
            await supabase.from('room_members').insert({ room_id: roomId, user_token: playerToken, is_owner: isRoomOwner });
          }
          // 在线（不覆盖 player_token，避免 room_members 关联丢失）
          await supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('nickname', savedNick);
          enterWaitingRoom(room);
          return;
        }
        // 房间已不存在
        localStorage.removeItem('active_room_id');
        localStorage.removeItem('active_room_name');
        localStorage.removeItem('active_room_owner');
      }
      // 没有活跃房间 → 正常进大厅
      enterLobby();
    } else {
      switchView('profile');
    }
  }

  init();

  // 可靠退出：sendBeacon 确保关闭网页也能发送离线信号
  function markOffline() {
    if (!playerToken) return;
    const url = `${SUPABASE_CONFIG.url}/rest/v1/users?player_token=eq.${playerToken}`;
    const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
    navigator.sendBeacon(url, new Blob([body], {type:'application/json'}));
  }

  window.addEventListener('beforeunload', markOffline);
  window.addEventListener('pagehide', markOffline);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && playerToken) {
      supabase.from('users').update({ is_online: false, last_seen: new Date().toISOString() }).eq('player_token', playerToken);
    } else if (document.visibilityState === 'visible' && myProfile && playerToken) {
      supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('player_token', playerToken);
      // 息屏/切后台超过 30 秒回来自动刷新，避免状态不同步
      if (window._hiddenAt && Date.now() - window._hiddenAt > 30000) {
        location.reload();
      }
    }
    if (document.visibilityState === 'hidden') {
      window._hiddenAt = Date.now();
    }
  });

})();
