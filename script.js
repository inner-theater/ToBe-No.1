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
    const len = nicknameInput.value.length;
    nicknameCount.textContent = len;
    checkProfileReady();
  });

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
    heartbeatInterval = setInterval(broadcastPresence, 5000);

    // 加载房间 + 轮询
    await fetchLobbyRooms();
    renderLobbyRooms();

    lobbyUsersInterval = setInterval(() => {
      const now = Date.now();
      let removed = 0;
      Object.keys(presenceMap).forEach(t => {
        if (t !== playerToken && now - presenceMap[t] > 15000) {
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
    }, 3000);

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
    // 为每个房间附加人数
    for (const room of lobbyRooms) {
      const { count } = await supabase.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', room.id);
      room._memberCount = count || 0;
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
  });

  roomCreateCancel.addEventListener('click', () => {
    roomCreateForm.style.display = 'none';
    roomNameInput.value = '';
    createRoomBtn.style.display = 'block';
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
    currentRoom = data;
    isRoomOwner = true;
    enterWaitingRoom(data);
  });

  // 加入房间
  async function joinRoom(roomId) {
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room) return showToast('房间不存在');
    if (room.password) {
      const pwd = prompt('此房间需要密码：');
      if (pwd !== room.password) return showToast('密码错误');
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

  // 进入等待室
  function enterWaitingRoom(room) {
    stopAllIntervals();
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; } // 停止心跳，从大厅消失
    // 设置 DB 离线（让还在用旧逻辑的客户端也能看到）
    supabase.from('users').update({ is_online: false }).eq('player_token', playerToken).then(()=>{}).catch(()=>{});
    currentRoom = room;
    roomId = room.id;
    switchView('waiting');
    waitingRoomTitle.textContent = '⚔️ ' + room.name;
    roomSubtitle.textContent = isRoomOwner ? '你是房主，等人齐就能开始！' : '等待房主开始...';
    if (isRoomOwner) ownerActions.style.display = 'block';
    else ownerActions.style.display = 'none';
    allPlayers = [];
    gameActive = false; gameFinished = false;
    fetchWaitingPlayers();
    setupGameRealtime();
    pollInterval = setInterval(fetchWaitingPlayers, 2000);
    renderPlayerListUI();
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
    renderPlayerListUI();
    playerCountEl.textContent = allPlayers.length;
    if (isRoomOwner) ownerActions.style.display = 'block';
    else ownerActions.style.display = 'none';

    // 所有非房主检测游戏是否已开始（同时通过 players 表和 Realtime 双重保障）
    if (!gameActive && !gameFinished) {
      try {
        const { data: check } = await supabase.from('players')
          .select('game_started').eq('room_id', roomId).eq('game_started', true).limit(1);
        if (check && check.length > 0) {
          gameActive = true;
          stopAllIntervals();
          enterGamePhase();
        }
      } catch(e) {}
    }
  }

  function renderPlayerListUI() {
    if (allPlayers.length === 0) {
      playerListEl.innerHTML = '<p class="empty-hint">虚位以待...</p>';
      return;
    }
    playerListEl.innerHTML = allPlayers.map(p =>
      `<span class="player-tag${p.is_owner ? ' owner-tag' : ''}">${p.is_owner ? '👑 ' : '⚔️ '}${escapeHTML(p.name)}</span>`
    ).join('');
  }

  leaveRoomBtn.addEventListener('click', async () => {
    const wasOwner = isRoomOwner && currentRoom;
    await supabase.from('room_members').delete().eq('user_token', playerToken).eq('room_id', roomId);
    // 房主离开 → 顺延第一个人为新房主
    if (wasOwner) {
      const { data: members } = await supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at', { ascending: true }).limit(1);
      if (members && members.length > 0) {
        await supabase.from('room_members').update({ is_owner: true }).eq('id', members[0].id);
        await supabase.from('rooms').update({ creator_token: members[0].user_token }).eq('id', roomId);
      }
    }
    stopAllIntervals();
    currentRoom = null; isRoomOwner = false; roomId = null; allPlayers = [];
    enterLobby();
  });

  // ===================== 游戏（保留原逻辑，适配新流程）=====================
  startBtn.addEventListener('click', async () => {
    if (!isRoomOwner) return;
    if (allPlayers.length < 2) return showToast('至少 2 人才能开始！');

    // 把 room_members 同步到 players 表
    for (const p of allPlayers) {
      await supabase.from('players').upsert({
        room_id: roomId, name: p.name, player_token: p.player_token,
        click_count: 0, buff: '', final_score: 0, is_finished: false,
        is_owner: p.is_owner, game_started: true
      }, { onConflict: 'player_token,room_id' });
    }
    // 双重保障：广播 + 数据库
    gameChannel.send({ type: 'broadcast', event: 'game_start', payload: {} });
    gameActive = true;
    enterGamePhase();
  });

  function enterGamePhase() {
    stopAllIntervals();
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
    { name:'🚀 火箭加速', desc:'总分翻倍！', icon:'🚀', fn: s=>s*2 },
    { name:'💣 哑弹', desc:'扣5分...', icon:'💣', fn: s=>Math.max(0,s-5) },
    { name:'🎯 精准打击', desc:'抢夺最低分5分', icon:'🎯', fn: (s,players,self)=>{ let min=Infinity; players.filter(p=>p.player_token!==self.player_token).forEach(p=>{if(p.click_count<min)min=p.click_count}); return s<=min?s:s+5 } },
    { name:'🛡️ 无事发生', desc:'维持原分', icon:'🛡️', fn: s=>s },
  ];

  async function calculateAndRevealBuff() {
    const b = BUFFS[Math.floor(Math.random()*BUFFS.length)];
    const finalScore = b.fn(clickCount, allPlayers, { player_token: playerToken });
    buffIconEl.textContent = b.icon;
    buffNameEl.textContent = b.name;
    buffDescEl.textContent = b.desc;
    buffScoreEl.textContent = finalScore+' 分';
    buffReveal.style.display = 'flex';
    waitingOthers.style.display = 'block';

    await supabase.from('players').update({ click_count:clickCount, buff:b.name, final_score:finalScore, is_finished:true }).eq('player_token',playerToken).eq('room_id',roomId);
    gameFinished = true;
    pollCompletion();
  }

  function pollCompletion() {
    let polls = 0;
    const iv = setInterval(async () => {
      polls++;
      const { data } = await supabase.from('players').select('*').eq('room_id', roomId);
      const players = data || [];
      const done = players.every(p => p.is_finished);
      if (done || polls >= 60) { clearInterval(iv); showResults(players); }
      else { const dc = players.filter(p=>p.is_finished).length; waitingOthers.textContent = `已结算 ${dc}/${players.length} 人...`; }
    }, 1000);
  }

  async function showResults(players) {
    const sorted = (players||[]).filter(p=>p.is_finished).sort((a,b)=>b.final_score-a.final_score);
    rankingList.innerHTML = sorted.map((p,i)=>{
      const cls = i===sorted.length-1&&sorted.length>1?'rank-item last-place':'rank-item';
      const medal = i<3?['🥇','🥈','🥉'][i]:'';
      return `<div class="${cls}"><span class="rank-badge">${medal} #${i+1}</span><div class="rank-info"><div class="rank-name">${escapeHTML(p.name)}</div><div class="rank-buff">${p.buff||'无'} | ${p.click_count}次</div></div><span class="rank-score">${p.final_score}分</span></div>`;
    }).join('');
    if (sorted.length>0) {
      loserNameEl.textContent = sorted[sorted.length-1].name;
      try {
        await supabase.from('game_history').insert({
          room_name: currentRoom ? currentRoom.name : '',
          room_id: currentRoom ? currentRoom.id : '',
          players_json: JSON.stringify(sorted.map(p=>({name:p.name,score:p.final_score,clicks:p.click_count,buff:p.buff}))),
          loser: sorted[sorted.length-1].name,
          played_at: new Date().toISOString()
        });
      } catch(e) {}
    }
    switchView('result');
    if (isRoomOwner) ownerReset.style.display = 'block';
    else ownerReset.style.display = 'none';
  }

  resetBtn.addEventListener('click', async () => {
    if (!confirm('确定开启新一轮？')) return;
    await supabase.from('players').delete().eq('room_id', roomId);
    clickCount=0; gameActive=false; gameFinished=false;
    enterWaitingRoom(currentRoom);
  });

  backToLobbyBtn.addEventListener('click', () => {
    stopAllIntervals();
    enterLobby();
  });

  // 历史记录
  historyBtn.addEventListener('click', () => showHistory());
  historyClose.addEventListener('click', () => { historyModal.style.display = 'none'; });
  historyModal.addEventListener('click', e => { if (e.target === historyModal) historyModal.style.display = 'none'; });

  async function showHistory() {
    historyModal.style.display = 'flex';
    try {
      const { data } = await supabase.from('game_history').select('*').order('played_at', { ascending: false }).limit(50);
      const records = data || [];
      if (records.length === 0) {
        historyList.innerHTML = '<p class="empty-hint">暂无记录，快去来一局！</p>';
        return;
      }
      historyList.innerHTML = records.map(r => {
        const players = JSON.parse(r.players_json || '[]');
        const sorted = players.sort((a,b) => b.score - a.score);
        const summary = sorted.map((p,i) => `${i+1}.${p.name}(${p.score}分${i===sorted.length-1?' 👈':''})`).join(' | ');
        return `<div class="history-card">
          <div class="h-date">${new Date(r.played_at).toLocaleString('zh-CN')}</div>
          <div class="h-room">${escapeHTML(r.room_name)}</div>
          <div class="h-players">${escapeHTML(summary)}</div>
          <div class="h-loser">🎤 下周主持：${escapeHTML(r.loser)}</div>
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
    animateItemFly(target.player_token, itemType);
  }

  function animateItemFly(toToken, itemType) {
    const fromEl = lobbyStage.querySelector(`[data-token="${playerToken}"]`);
    const toEl = lobbyStage.querySelector(`[data-token="${toToken}"]`);
    if (!fromEl || !toEl) return;
    const fromR = fromEl.getBoundingClientRect();
    const toR = toEl.getBoundingClientRect();
    const emojis = { tomato:'🍅', egg:'🥚', broccoli:'🥦', drumstick:'🍗', bomb:'💣', rocket:'🚀', '666':'6️⃣6️⃣6️⃣', poop:'💩' };
    const fly = document.createElement('span');
    fly.className = 'item-fly animate';
    fly.textContent = emojis[itemType] || '💥';
    fly.style.setProperty('--fly-dx', (toR.left - fromR.left) + 'px');
    fly.style.setProperty('--fly-dy', (toR.top - fromR.top) + 'px');
    fly.style.left = fromR.left + 'px';
    fly.style.top = fromR.top + 'px';
    document.body.appendChild(fly);
    setTimeout(() => {
      fly.remove();
      const hit = document.createElement('span');
      hit.className = 'hit-effect';
      hit.textContent = emojis[itemType] || '💥';
      hit.style.left = (toR.left + toR.width/2) + 'px';
      hit.style.top = (toR.top) + 'px';
      document.body.appendChild(hit);
      setTimeout(() => hit.remove(), 600);
    }, 1000);
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
          animateItemFly(payload.payload.from_token, payload.payload.item_type);
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
      .on('broadcast', { event: 'game_start' }, () => {
        if (!gameActive && !gameFinished) {
          gameActive = true;
          stopAllIntervals();
          enterGamePhase();
        }
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'players', filter: 'room_id=eq.'+roomId }, payload => {
        if (!gameActive && !gameFinished && payload.new && payload.new.game_started) {
          gameActive = true;
          stopAllIntervals();
          enterGamePhase();
          return;
        }
        if (waitingView.classList.contains('active')) fetchWaitingPlayers().then(renderPlayerListUI);
        else if (resultView.classList.contains('active')) {
          supabase.from('players').select('*').eq('room_id',roomId).then(({data})=>{ if(data&&data.every(p=>p.is_finished)) showResults(data); });
        }
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
      // 有保存的昵称 → 以它为唯一标识更新 token，直接进大厅
      const { data: exist } = await supabase.from('users').select('*').eq('nickname', savedNick).limit(1);
      if (exist && exist.length > 0) {
        // 加载最新头像
        myProfile = { nickname: savedNick, avatar_b64: exist[0].avatar_b64 || savedAvatar || '' };
        await supabase.from('users').update({
          player_token: playerToken, is_online: true, last_seen: new Date().toISOString()
        }).eq('nickname', savedNick);
        localStorage.setItem('profile_avatar', myProfile.avatar_b64);
        enterLobby();
      } else {
        // DB 里没这条记录了，重新插入
        myProfile = { nickname: savedNick, avatar_b64: savedAvatar || '' };
        await supabase.from('users').insert({
          nickname: savedNick, avatar_b64: savedAvatar || '',
          player_token: playerToken, is_online: true, last_seen: new Date().toISOString()
        });
        enterLobby();
      }
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
    }
  });

})();
