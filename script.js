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
  const roomModeSelect    = $('#room-mode-select');
  const arenaDurationSelect = $('#arena-duration-select');
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

  // ========== Arena (大乱斗) ==========
  const arenaView       = $('#arena-view');
  const arenaStage      = $('#arena-stage');
  const arenaTimerEl    = $('#arena-timer');
  const arenaAliveCount = $('#arena-alive-count');
  const arenaQuitBtn    = $('#arena-quit-btn');
  const killFeed        = $('#kill-feed');
  // Arena game state
  let arenaPlayers  = {}; // { token: { el, x, y, vx, vy, hp, kills, assists, alive, eliminatedAt, nickname, avatar, targetX, targetY, lastHitBy, lastHitTime, hitHistory, survivalTime } }
  let arenaGameActive = false;
  let arenaCountdown  = 0;
  let arenaTimerIv    = null;
  let arenaPhysicsRaf = null;
  let arenaThrottle   = 0; // fire rate limiter
  let myArenaToken    = null;
  let arenaKillLog    = []; // { killer, victim, time } for assist tracking
  let roomTimerIv     = null; // 30-min room expiry timer
  let arenaPosInterval = null; // 位置广播定时器
  let arenaMoveDir    = { x: 0, y: 0 }; // 方向圆盘当前方向
  let arenaDuration   = 600; // 倒计时秒数
  let arenaStartTime  = 0; // 游戏开始时间戳
  let arenaArmedItem  = null; // 保留引用
  let currentAmmo     = 'tomato'; // 当前选中的弹药类型
  let lastMoveDir     = { x: 0, y: -1 }; // 上一次移动方向（默认朝上）

  // ===================== Supabase =====================
  const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

  // ===================== 全局状态 =====================
  let playerToken = null;
  let myProfile   = null; // { nickname, avatar_b64 }
  let myUserRecord = null;
  let roomId      = null;
  let currentRoom = null;  // 当前所在房间对象
  let isRoomOwner = false;
  let propModeEnabled = false; // 道具赛是否开启（游戏开始时锁定）
  let roomExpiryWarned = false; // 房间过期是否已提示

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
    [profileView, lobbyView, waitingView, gameView, resultView, arenaView].forEach(v => v.classList.remove('active'));
    if (name === 'profile') profileView.classList.add('active');
    if (name === 'lobby')   lobbyView.classList.add('active');
    if (name === 'waiting') waitingView.classList.add('active');
    if (name === 'game')    gameView.classList.add('active');
    if (name === 'result')  resultView.classList.add('active');
    if (name === 'arena')   arenaView.classList.add('active');
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
    // 过滤超过30分钟的房间
    const now = Date.now();
    const valid = (data || []).filter(r => {
      const age = (now - new Date(r.created_at).getTime()) / 1000;
      return age < 30 * 60;
    });
    // 删除过期房间
    const expired = (data || []).filter(r => {
      const age = (now - new Date(r.created_at).getTime()) / 1000;
      return age >= 30 * 60;
    });
    for (const r of expired) {
      supabase.from('rooms').delete().eq('id', r.id).then(()=>{}).catch(()=>{});
    }
    lobbyRooms = valid;
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
    roomList.innerHTML = lobbyRooms.map(r => {
      const modeIcon = r.game_mode === 'arena' ? '💥' : '⚡';
      return `
      <div class="room-card" data-room-id="${r.id}">
        <div class="room-name">${r.password ? '🔒 ' : ''}${modeIcon} ${escapeHTML(r.name)}</div>
        <div class="room-info">${r._memberCount || 0} 人</div>
      </div>`;
    }).join('');

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

  // 游戏模式切换 → 显示/隐藏时长选择
  roomModeSelect.addEventListener('change', () => {
    arenaDurationSelect.style.display = roomModeSelect.value === 'arena' ? 'block' : 'none';
  });

  roomCreateConfirm.addEventListener('click', async () => {
    const name = roomNameInput.value.trim();
    if (!name) return showToast('输入房间名');
    const pwd = roomPasswordInput.value.trim();
    const mode = roomModeSelect.value || 'speed';
    const duration = mode === 'arena' ? parseInt(arenaDurationSelect.value) : 0;
    roomCreateConfirm.disabled = true;
    const { data, error } = await supabase.from('rooms').insert({
      name, password: pwd, creator_token: playerToken, is_active: true,
      game_mode: mode, duration: duration
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
    arenaGameActive = false;
    // 清理 arena 资源
    if (arenaTimerIv) { clearInterval(arenaTimerIv); arenaTimerIv = null; }
    if (arenaPhysicsRaf) { cancelAnimationFrame(arenaPhysicsRaf); arenaPhysicsRaf = null; }
    if (arenaPosInterval) { clearInterval(arenaPosInterval); arenaPosInterval = null; }
    // 持久化房间状态（刷新后能恢复）
    localStorage.setItem('active_room_id', room.id);
    localStorage.setItem('active_room_name', room.name);
    localStorage.setItem('active_room_owner', isRoomOwner ? '1' : '0');
    currentRoom = room;
    roomId = room.id;
    roomExpiryWarned = false;
    switchView('waiting');
    // 模式相关显示
    const mode = room.game_mode || 'speed';
    if (mode === 'arena') {
      waitingRoomTitle.textContent = '💥 ' + room.name;
      propModeLabel.style.display = 'none';
      const dur = room.duration || 600;
      const min = Math.floor(dur / 60);
      roomSubtitle.textContent = `大乱斗 · ${min}分钟 · ${isRoomOwner ? '等人齐就能开始！' : '等待房主开始...'}`;
    } else {
      waitingRoomTitle.textContent = '⚡ ' + room.name;
      roomSubtitle.textContent = isRoomOwner ? '你是房主，等人齐就能开始！' : '等待房主开始...';
    }
    if (isRoomOwner && mode === 'speed') { ownerActions.style.display = 'block'; propModeLabel.style.display = 'block'; }
    else if (isRoomOwner && mode === 'arena') { ownerActions.style.display = 'block'; propModeLabel.style.display = 'none'; }
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
    // 启动房间过期检测
    startRoomExpiryTimer();
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
    const _mode = currentRoom ? (currentRoom.game_mode || 'speed') : 'speed';
    if (isRoomOwner && _mode === 'speed') { ownerActions.style.display = 'block'; propModeLabel.style.display = 'block'; }
    else if (isRoomOwner && _mode === 'arena') { ownerActions.style.display = 'block'; propModeLabel.style.display = 'none'; }
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

    const mode = currentRoom ? (currentRoom.game_mode || 'speed') : 'speed';
    if (mode === 'arena') {
      const duration = currentRoom.duration || 600;
      gameChannel.send({
        type: 'broadcast', event: 'arena_start',
        payload: { players: allPlayers.map(p => ({ name: p.name, player_token: p.player_token })), duration }
      });
      enterArenaPhase(allPlayers, duration);
    } else {
      propModeEnabled = propModeCheck.checked;
      // 广播游戏开始 + 玩家名单 + 道具赛开关
      gameChannel.send({
        type: 'broadcast', event: 'game_start',
        payload: { players: allPlayers.map(p => ({ name: p.name, player_token: p.player_token })), prop_mode: propModeEnabled }
      });
      gameActive = true;
      enterGamePhase();
    }
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
    { name:'🎯 精准打击', desc:'抢夺第一名5分', icon:'🎯', fn: s=>s, w:10 },
    { name:'🛡️ 无事发生', desc:'维持原分', icon:'🛡️', fn: s=>s, w:70 },
  ];
  const BUFF_ROULETTE = (() => {
    let arr = [];
    BUFFS.forEach((b, i) => { for (let j = 0; j < b.w; j++) arr.push(i); });
    return arr;
  })();

  async function calculateAndRevealBuff() {
    let b, finalScore;
    if (propModeEnabled) {
      b = BUFFS[BUFF_ROULETTE[Math.floor(Math.random() * BUFF_ROULETTE.length)]];
      finalScore = b.fn(clickCount, allPlayers, { player_token: playerToken });
    } else {
      b = { name: '无道具', desc: '本局未开启道具赛', icon: '—' };
      finalScore = clickCount;
    }
    buffIconEl.textContent = b.icon;
    buffNameEl.textContent = b.name;
    buffDescEl.textContent = b.desc;
    buffScoreEl.textContent = finalScore+' 分';
    buffReveal.style.display = 'flex';
    waitingOthers.style.display = 'block';

    // 写入 room_members.result_json（可靠 UPDATE，不依赖 players 表）
    const myResult = {
      player_token: playerToken, name: myProfile.nickname,
      click_count: clickCount, buff: propModeEnabled ? b.name : '', final_score: finalScore
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
        click_count: clickCount, buff: propModeEnabled ? b.name : '', final_score: finalScore,
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
    // 恢复手速模式标题
    const titleEl = document.querySelector('.result-title');
    const announceEl = document.querySelector('#loser-announce');
    const subEl = document.querySelector('.loser-sub');
    if (titleEl) { titleEl.textContent = '排行已定！'; titleEl.className = 'result-title neon-text-red'; }
    if (announceEl) announceEl.style.display = '';
    if (subEl) subEl.style.display = '';
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
    // 清理 arena 状态
    arenaGameActive = false;
    if (arenaKeyboardHandler) {
      window.removeEventListener('keydown', arenaKeyboardHandler.down);
      window.removeEventListener('keyup', arenaKeyboardHandler.up);
      arenaKeyboardHandler = null;
    }
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
    localStorage.removeItem('active_game_mode');
    localStorage.removeItem('active_game_data');
    enterLobby();
  }

  resetBtn.addEventListener('click', async () => {
    gameResults.clear();
    gameActive = false; gameFinished = false;
    clickCount = 0;
    arenaGameActive = false;
    if (arenaKeyboardHandler) { window.removeEventListener('keydown', arenaKeyboardHandler.down); window.removeEventListener('keyup', arenaKeyboardHandler.up); arenaKeyboardHandler = null; }
    // 广播通知所有人重置
    gameChannel.send({ type: 'broadcast', event: 'game_reset', payload: {} });
    enterWaitingRoom(currentRoom);
  });

  replayBtn.addEventListener('click', async () => {
    gameResults.clear();
    gameActive = false; gameFinished = false;
    clickCount = 0;
    arenaGameActive = false;
    if (arenaKeyboardHandler) { window.removeEventListener('keydown', arenaKeyboardHandler.down); window.removeEventListener('keyup', arenaKeyboardHandler.up); arenaKeyboardHandler = null; }
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
        const isArena = players.some(p => p.game_mode === 'arena' || p.kills !== undefined);
        const sorted = players.sort((a,b) => {
          if (isArena) return (b.survival_time||0) - (a.survival_time||0) || (b.hp||0) - (a.hp||0);
          return b.score - a.score;
        });
        const dt = new Date(r.played_at);
        const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        // 生成排名详情 HTML
        const detailHTML = sorted.map((p,i) => {
          const badge = i===0 ? '🥇' : (i===1 ? '🥈' : (i===2 ? '🥉' : `${i+1}`));
          const isMe = (p.name === myNick || p.nickname === myNick);
          let stats;
          if (isArena) {
            const survMin = Math.floor((p.survival_time||0) / 60);
            const survSec = Math.floor((p.survival_time||0) % 60);
            stats = `击杀${p.kills||0} · 助攻${p.assists||0} · HP${p.hp||0} · 存活${survMin}:${String(survSec).padStart(2,'0')}`;
          } else {
            stats = `${escapeHTML(p.buff||'')} · ${p.clicks}次点击 · ${p.score}分`;
          }
          return `<div class="h-detail-row${isMe ? ' h-highlight' : ''}">
            <span class="h-detail-rank">${badge}</span>
            <span class="h-detail-name">${escapeHTML(p.name||p.nickname)}${isMe?' (我)':''}</span>
            <span class="h-detail-stats">${stats}</span>
          </div>`;
        }).join('');
        const modeIcon = isArena ? '💥' : '⚡';
        return `<div class="history-card" onclick="this.classList.toggle('expanded')">
          <div class="h-header">
            <span class="h-date">${dateStr}</span>
            <span class="h-room">${modeIcon} ${escapeHTML(r.room_name)}</span>
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
      if (arenaGameActive) {
        arenaThrowItem(selectedTarget, item);
      } else {
        throwItem(selectedTarget, item);
      }
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
          propModeEnabled = (payload.payload && payload.payload.prop_mode) || false;
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
        arenaGameActive = false;
        if (arenaKeyboardHandler) {
          window.removeEventListener('keydown', arenaKeyboardHandler.down);
          window.removeEventListener('keyup', arenaKeyboardHandler.up);
          arenaKeyboardHandler = null;
        }
        stopAllIntervals();
        enterWaitingRoom(currentRoom);
      })
      .on('broadcast', { event: 'prop_intro' }, () => {
        showPropIntro();
      })
      // ===== 大乱斗事件 =====
      .on('broadcast', { event: 'arena_start' }, payload => {
        if (!arenaGameActive) {
          if (payload.payload && payload.payload.players) {
            allPlayers = payload.payload.players;
          }
          enterArenaPhase(allPlayers, payload.payload.duration || 600);
        }
      })
      .on('broadcast', { event: 'arena_pos' }, payload => {
        const p = payload.payload;
        if (p.token !== playerToken && arenaPlayers[p.token]) {
          arenaPlayers[p.token].targetX = p.x;
          arenaPlayers[p.token].targetY = p.y;
        }
      })
      .on('broadcast', { event: 'arena_throw' }, payload => {
        if (payload.payload.from !== playerToken) {
          animateArenaItemFly(payload.payload.from, payload.payload.to, payload.payload.item);
        }
      })
      .on('broadcast', { event: 'arena_hit' }, payload => {
        // 只有被击中者处理伤害
        if (payload.payload.to !== playerToken) return;
        if (!arenaGameActive) return;
        const me = arenaPlayers[playerToken];
        if (!me || !me.alive) return;
        me.hp = Math.max(0, me.hp - 1);
        me.lastHitBy = payload.payload.from;
        me.lastHitTime = Date.now();
        me.hitHistory.push({ attacker: payload.payload.from, time: Date.now() });
        updateArenaHpDisplay(playerToken);
        // 广播 HP 更新
        gameChannel.send({ type: 'broadcast', event: 'arena_hp_update', payload: { token: playerToken, hp: me.hp } });
        if (me.hp <= 0) {
          const assistCutoff = Date.now() - 10000;
          const assistants = [...new Set(
            me.hitHistory.filter(h => h.time > assistCutoff && h.attacker !== payload.payload.from && h.attacker !== playerToken)
              .map(h => h.attacker)
          )];
          gameChannel.send({
            type: 'broadcast', event: 'arena_eliminated',
            payload: { token: playerToken, killed_by: payload.payload.from, assistants, time: Date.now() }
          });
          arenaEliminatePlayer(playerToken, payload.payload.from, assistants);
        }
      })
      .on('broadcast', { event: 'arena_hp_update' }, payload => {
        if (payload.payload.token === playerToken) return;
        const p = arenaPlayers[payload.payload.token];
        if (p) { p.hp = payload.payload.hp; updateArenaHpDisplay(payload.payload.token); }
      })
      .on('broadcast', { event: 'arena_eliminated' }, payload => {
        const d = payload.payload;
        if (arenaPlayers[d.token]) {
          arenaEliminatePlayer(d.token, d.killed_by, d.assistants || []);
        }
      })
      .on('broadcast', { event: 'room_expired' }, () => {
        showToast('房间已到期，自动解散');
        exitRoomToLobby();
      })
      // ===== 新增：弹射物系统事件 =====
      .on('broadcast', { event: 'arena_shoot' }, payload => {
        const d = payload.payload;
        if (d.from === playerToken) return; // 自己发射的已经在本地处理了
        if (!arenaGameActive) return;
        // 在远程玩家屏幕上也创建弹射物
        const proj = {
          x: d.x, y: d.y, vx: d.vx, vy: d.vy,
          ownerToken: d.from, ammoType: d.ammo,
          alive: true, el: null,
          createdAt: Date.now(), bounces: 0
        };
        const el = document.createElement('span');
        el.className = 'arena-projectile';
        el.textContent = ITEM_EFFECTS[d.ammo] ? ITEM_EFFECTS[d.ammo].emoji : '🍅';
        el.style.left = d.x + 'px';
        el.style.top = d.y + 'px';
        arenaStage.appendChild(el);
        proj.el = el;
        arenaProjectiles.push(proj);
      })
      .on('broadcast', { event: 'arena_projectile_hit' }, payload => {
        const d = payload.payload;
        // 所有玩家同步目标的最新HP
        if (d.to !== playerToken && arenaPlayers[d.to]) {
          arenaPlayers[d.to].hp = typeof d.hp === 'number' ? d.hp : Math.max(0, (arenaPlayers[d.to].hp || 15) - 1);
          updateArenaHpDisplay(d.to);
        }
        if (d.to === playerToken) {
          // 我被打中了
          const me = arenaPlayers[playerToken];
          if (!me || !me.alive) return;
          me.hp = typeof d.hp === 'number' ? d.hp : Math.max(0, me.hp - 1);
          me.lastHitBy = d.from;
          me.lastHitTime = Date.now();
          me.hitHistory.push({ attacker: d.from, time: Date.now() });
          updateArenaHpDisplay(playerToken);
          if (me.hp <= 0) {
            const assistCutoff = Date.now() - 10000;
            const assistants = [...new Set(
              me.hitHistory.filter(h => h.time > assistCutoff && h.attacker !== d.from && h.attacker !== playerToken)
                .map(h => h.attacker)
            )];
            gameChannel.send({
              type: 'broadcast', event: 'arena_eliminated',
              payload: { token: playerToken, killed_by: d.from, assistants, time: Date.now() }
            });
            arenaEliminatePlayer(playerToken, d.from, assistants);
          }
        }
      })
      .subscribe();
  }

  function stopAllIntervals() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (lobbyUsersInterval) { clearInterval(lobbyUsersInterval); lobbyUsersInterval = null; }
    if (arenaTimerIv) { clearInterval(arenaTimerIv); arenaTimerIv = null; }
    if (arenaPosInterval) { clearInterval(arenaPosInterval); arenaPosInterval = null; }
    if (arenaPhysicsRaf) { cancelAnimationFrame(arenaPhysicsRaf); arenaPhysicsRaf = null; }
    if (roomTimerIv) { clearInterval(roomTimerIv); roomTimerIv = null; }
    stopPhysics();
  }

  // ===================== 大乱斗 (Arena) =====================
  async function enterArenaPhase(players, duration) {
    stopAllIntervals();
    gameResults.clear();
    switchView('arena');
    arenaStage.innerHTML = '';
    arenaPlayers = {};
    arenaGameActive = true;
    arenaDuration = duration || 600;
    arenaStartTime = Date.now();
    arenaMoveDir = { x: 0, y: 0 };
    arenaArmedItem = null;
    currentAmmo = 'tomato';
    lastMoveDir = { x: 0, y: -1 };
    arenaProjectiles = [];

    // 保存游戏会话，支持断线重连
    localStorage.setItem('active_game_mode', 'arena');
    localStorage.setItem('active_game_data', JSON.stringify({
      duration: duration,
      startTime: Date.now(),
      players: players.map(p => ({ player_token: p.player_token, name: p.name }))
    }));

    // 获取所有玩家头像（从users表批量查询）
    const playerTokens = players.map(p => p.player_token);
    let avatarMap = {};
    try {
      const { data: userRows } = await supabase.from('users').select('player_token, avatar_b64').in('player_token', playerTokens);
      if (userRows) {
        userRows.forEach(u => { avatarMap[u.player_token] = u.avatar_b64 || ''; });
      }
    } catch(e) {}
    // 补充在线用户数据（兜底）
    onlineUsers.forEach(u => { if (u.avatar_b64 && !avatarMap[u.player_token]) avatarMap[u.player_token] = u.avatar_b64; });
    const myAvatar = (myProfile && myProfile.avatar_b64) ? myProfile.avatar_b64 : '';
    avatarMap[playerToken] = myAvatar;

    const stageW = arenaStage.clientWidth || 400;
    const stageH = arenaStage.clientHeight || 400;
    const avatarSize = 52;

    players.forEach((p, i) => {
      const angle = (i / players.length) * Math.PI * 2;
      const radius = Math.min(stageW, stageH) * 0.28;
      const cx = stageW / 2 - avatarSize / 2;
      const cy = stageH / 2 - avatarSize / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      // 获取头像
      const avatar = avatarMap[p.player_token] || '';

      const div = document.createElement('div');
      div.className = 'arena-avatar';
      div.dataset.token = p.player_token;
      div.innerHTML = `
        <div class="arena-hp-bar"><div class="arena-hp-fill" style="width:100%"></div></div>
        <div class="arena-avatar-circle">${avatar ? `<img src="${avatar}">` : ''}</div>
        <span class="arena-avatar-nick">${escapeHTML(p.name)}</span>
        <span class="arena-hp-text">15</span>
      `;
      if (p.player_token === playerToken) {
        div.classList.add('arena-self');
      } else {
        div.addEventListener('click', () => handleArenaPlayerClick(p));
      }
      arenaStage.appendChild(div);

      arenaPlayers[p.player_token] = {
        el: div, x, y, vx: 0, vy: 0,
        hp: 15, kills: 0, assists: 0,
        alive: true, eliminatedAt: null,
        nickname: p.name, avatar: avatar,
        targetX: x, targetY: y,
        lastHitBy: null, lastHitTime: 0,
        hitHistory: [], survivalTime: 0
      };
    });

    startArenaPhysics();
    startArenaTimer();
    setupArenaJoystick();
    setupArenaKeyboard();
    arenaPosInterval = setInterval(broadcastArenaPosition, 100);
    updateArenaAliveCount();
  }

  function startArenaPhysics() {
    if (arenaPhysicsRaf) cancelAnimationFrame(arenaPhysicsRaf);
    let lastTime = 0;
    function tick(now) {
      if (!arenaGameActive) return;
      const dt = Math.min((now - lastTime) / 16, 3);
      lastTime = now;
      const stageW = arenaStage.clientWidth || 400;
      const stageH = arenaStage.clientHeight || 400;
      const avatarSize = 52;
      const moveSpeed = 2.8;
      const bounce = 0.65;
      const margin = 2;
      const maxVel = 5;

      // 本地玩家：摇杆控制速度
      const me = arenaPlayers[playerToken];
      if (me && me.alive) {
        me.vx = arenaMoveDir.x * moveSpeed;
        me.vy = arenaMoveDir.y * moveSpeed;
        me.x += me.vx * dt;
        me.y += me.vy * dt;
      }

      // 远程玩家：插值 + 派生速度用于反弹
      const tokens = Object.keys(arenaPlayers);
      for (const t of tokens) {
        if (t === playerToken) continue;
        const p = arenaPlayers[t];
        if (!p.alive) continue;
        const lerp = 0.18;
        const prevX = p.x, prevY = p.y;
        p.x += (p.targetX - p.x) * lerp * dt;
        p.y += (p.targetY - p.y) * lerp * dt;
        // 派生速度（用于反弹效果）
        p.vx = (p.x - prevX) * dt;
        p.vy = (p.y - prevY) * dt;
      }

      // 墙壁反弹（所有存活玩家）
      for (const t of tokens) {
        const p = arenaPlayers[t];
        if (!p.alive) continue;
        let bounced = false;
        if (p.x < margin) { p.x = margin; p.vx = Math.abs(p.vx) * bounce; bounced = true; }
        if (p.x > stageW - avatarSize - margin) { p.x = stageW - avatarSize - margin; p.vx = -Math.abs(p.vx) * bounce; bounced = true; }
        if (p.y < margin) { p.y = margin; p.vy = Math.abs(p.vy) * bounce; bounced = true; }
        if (p.y > stageH - avatarSize - 16 - margin) { p.y = stageH - avatarSize - 16 - margin; p.vy = -Math.abs(p.vy) * bounce; bounced = true; }
        if (bounced && t === playerToken) {
          showBounceEffect(p.x, p.y);
        }
      }

      // 玩家碰撞
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const a = arenaPlayers[tokens[i]], b = arenaPlayers[tokens[j]];
          if (!a.alive || !b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const minDist = 50;
          if (dist < minDist && dist > 0) {
            const nx = dx / dist, ny = dy / dist;
            const overlap = minDist - dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            // 碰撞反弹
            a.vx = -nx * 2; a.vy = -ny * 2;
            b.vx = nx * 2; b.vy = ny * 2;
          }
        }
      }

      // 弹射物碰撞检测
      updateArenaProjectiles(dt);

      for (const t of tokens) {
        const p = arenaPlayers[t];
        p.el.style.left = p.x + 'px';
        p.el.style.top = p.y + 'px';
      }
      arenaPhysicsRaf = requestAnimationFrame(tick);
    }
    arenaPhysicsRaf = requestAnimationFrame(tick);
  }

  // ===================== 弹射物系统 =====================
  let arenaProjectiles = [];

  function fireArenaProjectile(ammoType) {
    if (!arenaGameActive) return;
    const me = arenaPlayers[playerToken];
    if (!me || !me.alive) return;
    const now = Date.now();
    if (now - lastItemTime < 600) return;
    lastItemTime = now;

    // 发射方向：当前摇杆方向，如果不动则用上次方向
    let dx = arenaMoveDir.x;
    let dy = arenaMoveDir.y;
    if (dx === 0 && dy === 0) {
      dx = lastMoveDir.x;
      dy = lastMoveDir.y;
    } else {
      lastMoveDir.x = dx;
      lastMoveDir.y = dy;
    }
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 0.01) { dx = 0; dy = -1; }
    else { dx /= len; dy /= len; }

    const speed = 6;
    const avatarSize = 52;
    const startX = me.x + avatarSize/2 + dx * 32;
    const startY = me.y + avatarSize/2 + dy * 32;

    const proj = {
      x: startX, y: startY,
      vx: dx * speed, vy: dy * speed,
      ownerToken: playerToken,
      ammoType: ammoType,
      el: null,
      alive: true,
      createdAt: Date.now(),
      bounces: 0
    };

    // 创建 DOM 元素
    const el = document.createElement('span');
    el.className = 'arena-projectile';
    el.textContent = ITEM_EFFECTS[ammoType] ? ITEM_EFFECTS[ammoType].emoji : '🍅';
    el.style.left = startX + 'px';
    el.style.top = startY + 'px';
    arenaStage.appendChild(el);
    proj.el = el;
    arenaProjectiles.push(proj);

    // 广播
    if (gameChannel) {
      gameChannel.send({
        type: 'broadcast', event: 'arena_shoot',
        payload: { from: playerToken, x: startX, y: startY, vx: proj.vx, vy: proj.vy, ammo: ammoType }
      });
    }
  }

  function updateArenaProjectiles(dt) {
    dt = dt || 1;
    const stageW = arenaStage.clientWidth || 400;
    const stageH = arenaStage.clientHeight || 400;
    const avatarSize = 52;
    const now = Date.now();

    for (let i = arenaProjectiles.length - 1; i >= 0; i--) {
      const proj = arenaProjectiles[i];
      if (!proj.alive) continue;

      // 超时移除（2.5秒）
      if (now - proj.createdAt > 2500) { removeProjectile(i); continue; }

      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;

      // 速度太慢移除
      if (Math.abs(proj.vx) + Math.abs(proj.vy) < 0.3) { removeProjectile(i); continue; }

      // 墙壁反弹（最多3次）
      let bounced = false;
      if (proj.x < 0) { proj.x = 0; proj.vx = Math.abs(proj.vx) * 0.6; bounced = true; }
      if (proj.x > stageW) { proj.x = stageW; proj.vx = -Math.abs(proj.vx) * 0.6; bounced = true; }
      if (proj.y < 0) { proj.y = 0; proj.vy = Math.abs(proj.vy) * 0.6; bounced = true; }
      if (proj.y > stageH) { proj.y = stageH; proj.vy = -Math.abs(proj.vy) * 0.6; bounced = true; }
      if (bounced) {
        proj.bounces++;
        if (proj.bounces >= 3) { removeProjectile(i); continue; }
      }

      // 出界移除（简化判断）
      if (proj.x < -30 || proj.x > stageW + 30 || proj.y < -30 || proj.y > stageH + 30) {
        removeProjectile(i); continue;
      }

      // 碰撞检测：与所有存活玩家
      const tokens = Object.keys(arenaPlayers);
      let hit = false;
      for (const t of tokens) {
        const p = arenaPlayers[t];
        if (!p.alive || t === proj.ownerToken) continue;
        const cx = p.x + avatarSize/2, cy = p.y + avatarSize/2;
        const dx = proj.x - cx, dy = proj.y - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 28) { // 命中
          hit = true;
          // 扣血
          p.hp = Math.max(0, p.hp - 1);
          updateArenaHpDisplay(t);
          // 击中动画
          const hitEl = document.createElement('span');
          hitEl.className = 'hit-effect';
          hitEl.textContent = ITEM_EFFECTS[proj.ammoType] ? ITEM_EFFECTS[proj.ammoType].emoji : '💥';
          hitEl.style.left = (p.x + avatarSize/2) + 'px';
          hitEl.style.top = (p.y + avatarSize/2) + 'px';
          arenaStage.appendChild(hitEl);
          setTimeout(() => hitEl.remove(), 600);
          p.el.classList.add('avatar-impact');
          setTimeout(() => p.el.classList.remove('avatar-impact'), 500);

          // 广播命中（带上最新HP，让所有玩家同步）
          if (gameChannel) {
            gameChannel.send({
              type: 'broadcast', event: 'arena_projectile_hit',
              payload: { from: proj.ownerToken, to: t, ammo: proj.ammoType, hp: p.hp }
            });
          }

          // 淘汰判定
          if (p.hp <= 0) {
            arenaEliminatePlayer(t, proj.ownerToken, []);
          }
          break;
        }
      }

      if (hit) {
        removeProjectile(i);
      } else {
        proj.el.style.left = proj.x + 'px';
        proj.el.style.top = proj.y + 'px';
      }
    }
  }

  function removeProjectile(index) {
    const proj = arenaProjectiles[index];
    if (!proj) return;
    proj.alive = false;
    if (proj.el && proj.el.parentNode) proj.el.remove();
    arenaProjectiles.splice(index, 1);
  }

  function showBounceEffect(x, y) {
    // 简单的屏幕震动
  }

  function startArenaTimer() {
    let remaining = arenaDuration;
    updateArenaTimerDisplay(remaining);
    arenaTimerIv = setInterval(() => {
      if (!arenaGameActive) return;
      remaining--;
      updateArenaTimerDisplay(remaining);
      if (remaining <= 0) {
        clearInterval(arenaTimerIv);
        endArenaGame();
      }
    }, 1000);
  }

  function updateArenaTimerDisplay(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    arenaTimerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    arenaTimerEl.style.color = seconds <= 30 ? '#ef4444' : '';
  }

  function updateArenaAliveCount() {
    const alive = Object.values(arenaPlayers).filter(p => p.alive).length;
    const total = Object.keys(arenaPlayers).length;
    arenaAliveCount.textContent = `存活 ${alive}/${total}`;
  }

  function setupArenaJoystick() {
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    if (!base) return;
    const radius = base.offsetWidth / 2;
    const knobR = knob.offsetWidth / 2;
    const maxDist = radius - knobR - 4;
    let dragging = false;
    let touchId = null;

    function getPos(e) {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let clientX, clientY;
      if (e.touches) {
        const touch = Array.from(e.touches).find(t => t.identifier === touchId) || e.touches[0];
        if (!touch) return null;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 8) {
        knob.style.transform = 'translate(-50%,-50%)';
        arenaMoveDir.x = 0;
        arenaMoveDir.y = 0;
        return;
      }
      if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
      knob.style.transform = `translate(${-50 + dx / radius * 50}%,${-50 + dy / radius * 50}%)`;
      arenaMoveDir.x = dx / maxDist;
      arenaMoveDir.y = dy / maxDist;
      lastMoveDir.x = arenaMoveDir.x;
      lastMoveDir.y = arenaMoveDir.y;
    }

    function resetJoystick() {
      dragging = false;
      touchId = null;
      knob.style.transform = 'translate(-50%,-50%)';
      arenaMoveDir.x = 0;
      arenaMoveDir.y = 0;
    }

    base.addEventListener('mousedown', (e) => { e.preventDefault(); dragging = true; getPos(e); });
    window.addEventListener('mousemove', (e) => { if (dragging) getPos(e); });
    window.addEventListener('mouseup', resetJoystick);

    base.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; touchId = t.identifier; dragging = true; getPos(e); }, { passive: false });
    window.addEventListener('touchmove', (e) => { if (dragging) getPos(e); }, { passive: false });
    window.addEventListener('touchend', (e) => { if (touchId !== null && !Array.from(e.touches).some(t => t.identifier === touchId)) resetJoystick(); });
    window.addEventListener('touchcancel', resetJoystick);
  }

  let arenaKeyboardHandler = null;
  function setupArenaKeyboard() {
    if (arenaKeyboardHandler) return;
    const keys = {};
    function onKey(e, down) {
      if (!arenaGameActive) return;
      const k = e.key.toLowerCase();
      if (['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d'].includes(k)) {
        e.preventDefault();
        keys[k] = down;
        let x = 0, y = 0;
        if (keys['arrowleft'] || keys['a']) x -= 1;
        if (keys['arrowright'] || keys['d']) x += 1;
        if (keys['arrowup'] || keys['w']) y -= 1;
        if (keys['arrowdown'] || keys['s']) y += 1;
        if (x !== 0 && y !== 0) { x *= 0.707; y *= 0.707; }
        arenaMoveDir.x = x;
        arenaMoveDir.y = y;
        if (x !== 0 || y !== 0) { lastMoveDir.x = x; lastMoveDir.y = y; }
      }
      // 空格发射
      if (k === ' ' || k === 'spacebar') {
        e.preventDefault();
        if (down) fireArenaProjectile(currentAmmo);
      }
    }
    arenaKeyboardHandler = { down: e => onKey(e, true), up: e => onKey(e, false) };
    window.addEventListener('keydown', arenaKeyboardHandler.down);
    window.addEventListener('keyup', arenaKeyboardHandler.up);
  }

  function broadcastArenaPosition() {
    if (!arenaGameActive || !gameChannel) return;
    const me = arenaPlayers[playerToken];
    if (!me) return;
    gameChannel.send({
      type: 'broadcast', event: 'arena_pos',
      payload: { token: playerToken, x: Math.round(me.x), y: Math.round(me.y), hp: me.hp, alive: me.alive }
    });
  }

  function handleArenaPlayerClick(playerInfo) {
    // 点击头像不再自动发射，防止锁定太强
    if (!arenaGameActive) return;
    showToast(`朝 ${escapeHTML(playerInfo.name)} 方向发射`);
    const me = arenaPlayers[playerToken];
    const target = arenaPlayers[playerInfo.player_token];
    if (!me || !target || !me.alive || !target.alive) return;
    const avatarSize = 52;
    const dx = (target.x + avatarSize/2) - (me.x + avatarSize/2);
    const dy = (target.y + avatarSize/2) - (me.y + avatarSize/2);
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 1) return;
    arenaMoveDir.x = dx / len;
    arenaMoveDir.y = dy / len;
    lastMoveDir.x = arenaMoveDir.x;
    lastMoveDir.y = arenaMoveDir.y;
    showToast(`已瞄准 ${escapeHTML(playerInfo.name)}，点击🔥发射`);
  }

  function arenaThrowItem(target, itemType) {
    if (!arenaGameActive) return;
    const now = Date.now();
    if (now - lastItemTime < 800) { showToast('冷却中...'); return; }
    lastItemTime = now;
    const targetP = arenaPlayers[target.player_token];
    if (!targetP || !targetP.alive) return;
    // 广播投掷动画
    gameChannel.send({
      type: 'broadcast', event: 'arena_throw',
      payload: { from: playerToken, to: target.player_token, item: itemType }
    });
    // 本地播放动画，动画结束后广播命中
    animateArenaItemFly(playerToken, target.player_token, itemType, () => {
      if (!arenaGameActive || !targetP.alive) return;
      gameChannel.send({
        type: 'broadcast', event: 'arena_hit',
        payload: { from: playerToken, to: target.player_token, item: itemType }
      });
    });
  }

  function animateArenaItemFly(fromToken, toToken, itemType, onHit) {
    const fromP = arenaPlayers[fromToken];
    const toP = arenaPlayers[toToken];
    if (!fromP || !toP) { if (onHit) onHit(); return; }
    const eff = ITEM_EFFECTS[itemType] || ITEM_EFFECTS.tomato;
    const stageRect = arenaStage.getBoundingClientRect();
    const fly = document.createElement('span');
    fly.className = 'item-fly';
    fly.textContent = eff.emoji;
    fly.style.position = 'fixed';
    fly.style.fontSize = '1.6rem';
    fly.style.pointerEvents = 'none';
    fly.style.zIndex = '1000';
    document.body.appendChild(fly);
    const startTime = performance.now();
    const duration = 500;
    const arcHeight = 50;
    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const sx = stageRect.left + fromP.x + 24;
      const sy = stageRect.top + fromP.y + 24;
      const tx = stageRect.left + toP.x + 24;
      const ty = stageRect.top + toP.y + 24;
      const cx = sx + (tx - sx) * ease;
      const cy = sy + (ty - sy) * ease - Math.sin(t * Math.PI) * arcHeight;
      fly.style.left = cx + 'px';
      fly.style.top = cy + 'px';
      fly.style.transform = `translate(-50%,-50%) scale(${1 + Math.sin(t*Math.PI)*0.4}) rotate(${t*360}deg)`;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        fly.remove();
        const hit = document.createElement('span');
        hit.className = 'hit-effect';
        hit.textContent = eff.emoji;
        hit.style.left = tx + 'px';
        hit.style.top = ty + 'px';
        document.body.appendChild(hit);
        setTimeout(() => hit.remove(), 600);
        if (eff.cls) { toP.el.classList.add(eff.cls); setTimeout(() => toP.el.classList.remove(eff.cls), 1000); }
        toP.el.classList.add('avatar-impact');
        setTimeout(() => toP.el.classList.remove('avatar-impact'), 500);
        if (onHit) onHit();
      }
    }
    requestAnimationFrame(frame);
  }

  function updateArenaHpDisplay(token) {
    const p = arenaPlayers[token];
    if (!p) return;
    const fill = p.el.querySelector('.arena-hp-fill');
    const text = p.el.querySelector('.arena-hp-text');
    if (fill) {
      fill.style.width = (p.hp / 15 * 100) + '%';
      fill.style.background = p.hp > 10 ? '#22c55e' : (p.hp > 5 ? '#fbbf24' : '#ef4444');
    }
    if (text) text.textContent = p.hp;
  }

  function arenaEliminatePlayer(token, killedBy, assistants) {
    const p = arenaPlayers[token];
    if (!p || !p.alive) return;
    p.alive = false;
    p.eliminatedAt = Date.now();
    p.el.classList.add('arena-eliminated');
    if (killedBy && arenaPlayers[killedBy]) arenaPlayers[killedBy].kills++;
    (assistants || []).forEach(a => {
      if (arenaPlayers[a] && a !== killedBy && a !== token) arenaPlayers[a].assists++;
    });
    const killerName = killedBy && arenaPlayers[killedBy] ? arenaPlayers[killedBy].nickname : '系统';
    const assistNames = (assistants || []).map(a => arenaPlayers[a] ? arenaPlayers[a].nickname : '?').join(', ');
    showKillFeed(killerName, p.nickname, assistNames);
    updateArenaAliveCount();
    if (token === playerToken) {
      showToast('你被淘汰了！');
      arenaMoveDir = { x: 0, y: 0 };
    }
    const aliveCount = Object.values(arenaPlayers).filter(p => p.alive).length;
    if (aliveCount <= 1) {
      setTimeout(endArenaGame, 1500);
    }
  }

  function showKillFeed(killer, victim, assists) {
    const div = document.createElement('div');
    div.className = 'kill-feed-item';
    let html = `<span class="kf-killer">${escapeHTML(killer)}</span> 击败 <span class="kf-victim">${escapeHTML(victim)}</span>`;
    if (assists) html += ` <span class="kf-assist">助攻 ${escapeHTML(assists)}</span>`;
    div.innerHTML = html;
    killFeed.appendChild(div);
    setTimeout(() => div.remove(), 5000);
    while (killFeed.children.length > 5) killFeed.firstChild.remove();
  }

  function endArenaGame() {
    if (!arenaGameActive) return;
    arenaGameActive = false;
    if (arenaTimerIv) { clearInterval(arenaTimerIv); arenaTimerIv = null; }
    if (arenaPhysicsRaf) { cancelAnimationFrame(arenaPhysicsRaf); arenaPhysicsRaf = null; }
    if (arenaPosInterval) { clearInterval(arenaPosInterval); arenaPosInterval = null; }
    // 清理弹射物
    arenaProjectiles.forEach(p => { if (p.el && p.el.parentNode) p.el.remove(); });
    arenaProjectiles = [];
    localStorage.removeItem('active_game_mode');
    localStorage.removeItem('active_game_data');
    const gameDuration = (Date.now() - arenaStartTime) / 1000;
    Object.keys(arenaPlayers).forEach(t => {
      const p = arenaPlayers[t];
      if (p.alive) p.survivalTime = gameDuration;
      else if (p.eliminatedAt) p.survivalTime = (p.eliminatedAt - arenaStartTime) / 1000;
      else p.survivalTime = 0;
    });
    const arr = Object.entries(arenaPlayers).map(([token, p]) => ({
      token, nickname: p.nickname, avatar: p.avatar,
      hp: p.hp, kills: p.kills, assists: p.assists,
      alive: p.alive, survivalTime: p.survivalTime
    }));
    const survivors = arr.filter(p => p.alive);
    const eliminated = arr.filter(p => !p.alive);
    let ranking;
    if (survivors.length <= 1) {
      ranking = arr.sort((a, b) => b.survivalTime - a.survivalTime);
    } else {
      survivors.sort((a, b) => b.hp - a.hp);
      eliminated.sort((a, b) => b.survivalTime - a.survivalTime);
      ranking = [...survivors, ...eliminated];
    }
    showArenaResults(ranking);
  }

  function showArenaResults(ranking) {
    const titleEl = document.querySelector('.result-title');
    const announceEl = document.querySelector('#loser-announce');
    const subEl = document.querySelector('.loser-sub');
    if (titleEl) { titleEl.textContent = '大乱斗结束！'; titleEl.className = 'result-title neon-text'; }
    if (announceEl) announceEl.style.display = 'none';
    if (subEl) subEl.style.display = 'none';
    const tokenMap = {};
    onlineUsers.forEach(u => { tokenMap[u.player_token] = u.avatar_b64; });
    rankingList.innerHTML = ranking.map((p, i) => {
      const cls = i===ranking.length-1&&ranking.length>1?'rank-item last-place':'rank-item';
      const badge = i<3 ? ['🥇','🥈','🥉'][i] : `${i+1}`;
      const avatar = p.avatar || tokenMap[p.token] || '';
      const avatarImg = avatar ? `<img src="${avatar}" class="rank-avatar">` : '<span class="rank-avatar-empty">👤</span>';
      const status = p.alive ? `HP ${p.hp}` : '已淘汰';
      const survMin = Math.floor(p.survivalTime / 60);
      const survSec = Math.floor(p.survivalTime % 60);
      return `<div class="${cls}">
        <span class="rank-badge">${badge}</span>
        <div class="rank-avatar-wrap">${avatarImg}</div>
        <div class="rank-info">
          <div class="rank-name">${escapeHTML(p.nickname)}</div>
          <div class="rank-buff">击杀 ${p.kills} · 助攻 ${p.assists} · ${status} · 存活 ${survMin}:${String(survSec).padStart(2,'0')}</div>
        </div>
      </div>`;
    }).join('');
    if (ranking.length > 0) {
      loserNameEl.textContent = ranking[0].nickname;
      (async () => {
        try {
          await supabase.from('game_history').insert({
            room_name: currentRoom ? currentRoom.name : '',
            room_id: currentRoom ? currentRoom.id : '',
            players_json: JSON.stringify(ranking.map(p => ({
              name: p.nickname, nickname: p.nickname,
              kills: p.kills, assists: p.assists, hp: p.hp,
              alive: p.alive, survival_time: p.survivalTime,
              score: p.hp, avatar: p.avatar,
              game_mode: 'arena'
            }))),
            loser: ranking[ranking.length-1].token,
            loser_nickname: ranking[ranking.length-1].nickname,
            played_at: new Date().toISOString()
          });
        } catch(e) { console.warn('arena history save failed', e); }
      })();
    }
    switchView('result');
    if (isRoomOwner) { ownerReset.style.display = 'block'; replayBtn.style.display = 'block'; }
    else { ownerReset.style.display = 'none'; replayBtn.style.display = 'none'; }
    backToLobbyBtn.style.display = 'block';
  }

  // Arena 弹药选择 + 发射
  document.querySelectorAll('.ammo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!arenaGameActive) return;
      document.querySelectorAll('.ammo-btn').forEach(b => b.classList.remove('ammo-active'));
      btn.classList.add('ammo-active');
      currentAmmo = btn.dataset.ammo;
    });
  });
  const fireBtn = document.getElementById('fire-btn');
  if (fireBtn) {
    fireBtn.addEventListener('click', () => {
      if (!arenaGameActive) return;
      fireArenaProjectile(currentAmmo);
    });
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (arenaGameActive) fireArenaProjectile(currentAmmo); }, { passive: false });
  }

  // Arena 退出
  arenaQuitBtn.addEventListener('click', () => {
    if (!arenaGameActive) { exitRoomToLobby(); return; }
    const me = arenaPlayers[playerToken];
    if (me && me.alive) {
      gameChannel.send({
        type: 'broadcast', event: 'arena_eliminated',
        payload: { token: playerToken, killed_by: null, assistants: [], time: Date.now() }
      });
      arenaEliminatePlayer(playerToken, null, []);
    }
    setTimeout(() => exitRoomToLobby(), 300);
  });

  // ===================== 房间过期检测 =====================
  function startRoomExpiryTimer() {
    if (roomTimerIv) clearInterval(roomTimerIv);
    roomTimerIv = setInterval(async () => {
      if (!currentRoom || !currentRoom.created_at) return;
      const createdAt = new Date(currentRoom.created_at).getTime();
      const elapsed = (Date.now() - createdAt) / 1000;
      const remaining = 30 * 60 - elapsed;
      if (remaining <= 0) {
        clearInterval(roomTimerIv);
        if (gameChannel) gameChannel.send({ type: 'broadcast', event: 'room_expired', payload: {} });
        showToast('房间已达30分钟上限，即将解散');
        exitRoomToLobby();
      } else if (remaining <= 300 && !roomExpiryWarned) {
        roomExpiryWarned = true;
        showToast('房间将在5分钟后解散，请尽快完成游戏');
      }
    }, 5000);
  }

  // ===================== 全局 Realtime 事件 =====================
  clickBtn.addEventListener('mousedown', e => { e.preventDefault(); handleClick(e); });
  clickBtn.addEventListener('touchstart', e => { e.preventDefault(); handleClick(e); });
  clickBtn.addEventListener('dblclick', e => e.preventDefault());

  // ===================== 断线重连大乱斗 =====================
  async function reconnectArena() {
    const savedRoomId = localStorage.getItem('active_room_id');
    const savedGameData = JSON.parse(localStorage.getItem('active_game_data') || '{}');
    if (!savedRoomId) { enterLobby(); return; }

    const { data: room } = await supabase.from('rooms').select('*').eq('id', savedRoomId).single();
    if (!room || !room.is_active) {
      localStorage.removeItem('active_room_id');
      localStorage.removeItem('active_game_mode');
      localStorage.removeItem('active_game_data');
      enterLobby();
      return;
    }

    currentRoom = room;
    roomId = room.id;
    isRoomOwner = localStorage.getItem('active_room_owner') === '1';

    const { data: member } = await supabase.from('room_members').select('*').eq('room_id', roomId).eq('user_token', playerToken);
    if (!member || member.length === 0) {
      await supabase.from('room_members').insert({ room_id: roomId, user_token: playerToken, is_owner: isRoomOwner });
    }

    const savedNick = localStorage.getItem('profile_nickname');
    if (savedNick) {
      supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('nickname', savedNick).then(()=>{}).catch(()=>{});
    }

    roomExpiryWarned = false;
    startRoomExpiryTimer();
    setupGameRealtime();

    // 等频道建立
    await new Promise(r => setTimeout(r, 600));

    const players = (savedGameData.players || []).map(p => ({ name: p.name, player_token: p.player_token }));
    const elapsed = savedGameData.startTime ? Math.floor((Date.now() - savedGameData.startTime) / 1000) : 0;
    const remaining = Math.max(10, (savedGameData.duration || 600) - elapsed);

    if (gameChannel) {
      gameChannel.send({ type: 'broadcast', event: 'arena_reconnect', payload: { token: playerToken } });
    }

    await enterArenaPhase(players, remaining);
    showToast('已重连回大乱斗！');
  }

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
          // 在线
          await supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('nickname', savedNick);

          // === 检查是否有活跃的游戏（断线重连）===
          const savedGameMode = localStorage.getItem('active_game_mode');
          if (savedGameMode === 'arena') {
            await reconnectArena();
            return;
          }

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
