/* ============================================================
   🏆 谁是第一名 — 核心游戏逻辑
   ============================================================ */

(function () {
  'use strict';

  // ===================== 常量 =====================
  const COUNTDOWN_SECONDS = 10;
  const COUNTDOWN_PREP = 3; // 开始前 3 秒预备倒计时

  // ===================== DOM 引用 =====================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const waitingView = $('#waiting-view');
  const gameView    = $('#game-view');
  const resultView  = $('#result-view');

  const nameInput     = $('#name-input');
  const joinBtn       = $('#join-btn');
  const playerList    = $('#player-list');
  const playerCount   = $('#player-count');
  const roomTitle     = $('#room-title');
  const ownerActions  = $('#owner-actions');
  const startBtn      = $('#start-btn');

  const countdownDisplay = $('#countdown-display');
  const countdownLabel   = $('#countdown-label');
  const clickArea        = $('#click-area');
  const clickScoreDisplay = $('#click-score-display');
  const clickBtn         = $('#click-btn');

  const buffReveal    = $('#buff-reveal');
  const buffCard      = $('#buff-card');
  const buffIcon      = $('#buff-icon');
  const buffName      = $('#buff-name');
  const buffDesc      = $('#buff-desc');
  const buffScore     = $('#buff-score');
  const waitingOthers = $('#waiting-others');

  const rankingList   = $('#ranking-list');
  const loserName     = $('#loser-name');
  const ownerReset    = $('#owner-reset');
  const resetBtn      = $('#reset-btn');
  const toastContainer = $('#toast-container');

  // ===================== Supabase 初始化 =====================
  const supabase = window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.key
  );

  // ===================== 状态 =====================
  let playerToken   = null;   // 本机唯一标识
  let playerName    = null;   // 本机选手名
  let playerRecord  = null;   // 本机在数据库中的记录
  let isOwner       = false;  // 是否是房主
  let roomId        = null;   // 房间 ID（ISO 周）
  let clickCount    = 0;      // 本地点击数
  let gameActive    = false;  // 游戏是否进行中
  let gameFinished  = false;  // 本机是否已结算
  let buffResult    = null;   // Buff 结算结果
  let realtimeChannel = null; // Supabase Realtime channel
  let allPlayers    = [];     // 缓存所有玩家数据

  // ===================== 工具函数 =====================

  /** 获取当前 ISO 周编号 作为 room_id */
  function getRoomId() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + weekNo;
  }

  /** 生成 UUID v4 */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /** Toast 通知 */
  function showToast(message, type) {
    type = type || 'error';
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 5000);
  }

  /** 设置按钮 Loading 状态 */
  function setBtnLoading(btn, loading, text) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = text || '同步中...';
      btn.style.opacity = '0.6';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.style.opacity = '1';
    }
  }

  /** 切换视图 */
  function switchView(viewName) {
    waitingView.classList.remove('active');
    gameView.classList.remove('active');
    resultView.classList.remove('active');

    if (viewName === 'waiting')  waitingView.classList.add('active');
    if (viewName === 'game')     gameView.classList.add('active');
    if (viewName === 'result')   resultView.classList.add('active');
  }

  /** 锁定加入表单（已加入状态） */
  function lockJoinForm(name) {
    nameInput.disabled = true;
    nameInput.value = name;
    nameInput.style.opacity = '0.6';
    nameInput.style.borderColor = 'var(--neon-purple)';
    nameInput.style.boxShadow = '0 0 8px rgba(168,85,247,0.3)';
    joinBtn.disabled = true;
    joinBtn.textContent = '✅ 已就位';
    joinBtn.style.opacity = '0.7';
  }

  /** 解除加入表单锁定 */
  function unlockJoinForm() {
    nameInput.disabled = false;
    nameInput.value = '';
    nameInput.style.opacity = '1';
    nameInput.style.borderColor = 'var(--border-color)';
    nameInput.style.boxShadow = 'none';
    joinBtn.disabled = false;
    joinBtn.textContent = '加入战场';
    joinBtn.style.opacity = '1';
  }

  // ===================== Supabase 操作 =====================

  /** 获取房间所有玩家 */
  async function fetchPlayers() {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      allPlayers = data || [];
      return allPlayers;
    } catch (err) {
      console.error('获取玩家列表失败:', err);
      showToast('网络异常，请检查连接后刷新重试');
      return [];
    }
  }

  /** 加入游戏 */
  async function joinGame(name) {
    try {
      const { data, error } = await supabase
        .from('players')
        .insert({
          room_id: roomId,
          name: name,
          player_token: playerToken,
          click_count: 0,
          final_score: 0,
          is_finished: false,
          is_owner: false,
          game_started: false
        })
        .select()
        .single();

      if (error) throw error;
      playerRecord = data;
      return data;
    } catch (err) {
      console.error('加入失败:', err);
      if (err.code === '23505') {
        showToast('换个响亮的名号！', 'error');
      } else {
        showToast('网络异常，请检查连接后刷新重试');
      }
      return null;
    }
  }

  /** 设置房主 */
  async function setOwner(record) {
    try {
      const { error } = await supabase
        .from('players')
        .update({ is_owner: true })
        .eq('id', record.id)
        .eq('player_token', playerToken);

      if (error) throw error;
    } catch (err) {
      console.error('设置房主失败:', err);
    }
  }

  /** 开始游戏（房主操作） */
  async function startGame() {
    try {
      const { error } = await supabase
        .from('players')
        .update({ game_started: true })
        .eq('id', playerRecord.id)
        .eq('player_token', playerToken);

      if (error) throw error;

      // 同时更新所有玩家的 game_started
      await supabase
        .from('players')
        .update({ game_started: true })
        .eq('room_id', roomId)
        .eq('is_owner', true);

      return true;
    } catch (err) {
      console.error('开始游戏失败:', err);
      showToast('网络异常，请检查连接后刷新重试');
      return false;
    }
  }

  /** 提交分数 */
  async function submitScore(clickCount, buff, finalScore) {
    try {
      const { error } = await supabase
        .from('players')
        .update({
          click_count: clickCount,
          buff: buff,
          final_score: finalScore,
          is_finished: true
        })
        .eq('id', playerRecord.id)
        .eq('player_token', playerToken);

      if (error) throw error;
      gameFinished = true;
      return true;
    } catch (err) {
      console.error('提交分数失败:', err);
      showToast('网络异常，提交失败，请检查连接后刷新重试');
      return false;
    }
  }

  /** 清空当前房间（房主操作） */
  async function resetRoom() {
    try {
      const { error } = await supabase
        .from('players')
        .delete()
        .eq('room_id', roomId);

      if (error) throw error;

      // 重置本地状态
      clickCount = 0;
      gameActive = false;
      gameFinished = false;
      buffResult = null;
      playerRecord = null;
      isOwner = false;
      allPlayers = [];

      clickScoreDisplay.textContent = '0';
      clickBtn.disabled = false;
      buffReveal.style.display = 'none';
      clickArea.style.display = 'none';
      countdownDisplay.style.display = 'block';
      countdownLabel.style.display = 'block';
      countdownDisplay.textContent = '10';
      countdownDisplay.className = 'countdown-display';

      // 解锁加入表单
      unlockJoinForm();

      // 重新开始轮询
      startPolling();

      return true;
    } catch (err) {
      console.error('重置失败:', err);
      showToast('网络异常，请检查连接后刷新重试');
      return false;
    }
  }

  // ===================== 实时同步 =====================

  let pollInterval = null; // 轮询定时器（Realtime 不可用时的后备方案）

  /** 启动轮询（后备方案） */
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async function () {
      try {
        const fresh = await supabase
          .from('players')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });
        if (fresh.error) return;
        const newData = fresh.data || [];

        // 检测变化
        const oldLen = allPlayers.length;
        const newLen = newData.length;
        const hasChanges = oldLen !== newLen || newData.some(function (np) {
          const op = allPlayers.find(function (p) { return p.id === np.id; });
          if (!op) return true;
          return op.game_started !== np.game_started || op.is_finished !== np.is_finished;
        });

        if (hasChanges) {
          allPlayers = newData;
          if (waitingView.classList.contains('active')) {
            renderPlayerList();
            // 检查是否需要显示房主按钮
            const self = allPlayers.find(function (p) { return p.player_token === playerToken; });
            if (self && self.is_owner && !isOwner) {
              isOwner = true;
              playerRecord = self;
              ownerActions.style.display = 'block';
            }
          }
          // 检测游戏开始
          const started = newData.some(function (p) { return p.game_started; });
          if (started && !gameActive && !gameFinished && playerRecord && !playerRecord.is_finished) {
            gameActive = true;
            enterGamePhase();
          }
          // 检测所有人完成
          const allDone = newData.length > 0 && newData.every(function (p) { return p.is_finished; });
          if (allDone && gameFinished) {
            showResults();
          }
        }
      } catch (e) {
        // 静默处理
      }
    }, 2000);
  }

  /** 停止轮询 */
  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  /** 设置 Supabase Realtime 订阅 */
  function setupRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
      .channel('room-' + roomId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: 'room_id=eq.' + roomId
        },
        function (payload) {
          handleRealtimeChange(payload);
        }
      )
      .subscribe(function (status) {
        console.log('Realtime 订阅状态:', status);
      });
  }

  /** 处理实时数据变更 */
  function handleRealtimeChange(payload) {
    if (payload.eventType === 'INSERT') {
      handlePlayerInsert(payload.new);
    } else if (payload.eventType === 'UPDATE') {
      handlePlayerUpdate(payload.new);
    } else if (payload.eventType === 'DELETE') {
      handlePlayerDelete(payload.old);
    }
  }

  function handlePlayerInsert(record) {
    // 更新本地缓存
    const idx = allPlayers.findIndex(function (p) { return p.id === record.id; });
    if (idx === -1) {
      allPlayers.push(record);
    } else {
      allPlayers[idx] = record;
    }

    // 如果当前在等待区，刷新列表
    if (waitingView.classList.contains('active')) {
      renderPlayerList();
    }

    // 如果是本人刚加入，更新 playerRecord
    if (record.player_token === playerToken && !playerRecord) {
      playerRecord = record;
    }
  }

  function handlePlayerUpdate(record) {
    // 更新缓存
    const idx = allPlayers.findIndex(function (p) { return p.id === record.id; });
    if (idx !== -1) {
      allPlayers[idx] = record;
    } else {
      allPlayers.push(record);
    }

    // 如果是本人的记录更新
    if (record.player_token === playerToken) {
      playerRecord = record;
    }

    // 检测游戏是否开始
    if (record.game_started && !gameActive && !gameFinished) {
      // 有人开始了游戏
      gameActive = true;
      enterGamePhase();
    }

    // 刷新等待区列表
    if (waitingView.classList.contains('active')) {
      renderPlayerList();
    }

    // 检测是否所有玩家都已完成
    if (resultView.classList.contains('active') || gameFinished) {
      checkAllFinished();
    }

    // 如果在等待区且 game_started 了但还没进入游戏
    if (waitingView.classList.contains('active') && record.game_started) {
      gameActive = true;
      enterGamePhase();
    }
  }

  function handlePlayerDelete(record) {
    allPlayers = allPlayers.filter(function (p) { return p.id !== record.id; });
    if (waitingView.classList.contains('active')) {
      renderPlayerList();
    }
  }

  /** 检查是否所有玩家都已完成 */
  async function checkAllFinished() {
    // 重新获取最新数据
    await fetchPlayers();

    const allDone = allPlayers.length > 0 && allPlayers.every(function (p) { return p.is_finished; });

    if (allDone) {
      showResults();
    } else if (gameFinished) {
      // 本人已完成但还有人在进行中
      waitingOthers.style.display = 'block';
    }
  }

  // ===================== UI 渲染 =====================

  /** 渲染选手列表 */
  function renderPlayerList() {
    playerList.innerHTML = '';

    if (allPlayers.length === 0) {
      playerList.innerHTML = '<p class="empty-hint">虚位以待，等你登场...</p>';
    } else {
      allPlayers.forEach(function (p) {
        const tag = document.createElement('span');
        tag.className = 'player-tag';
        if (p.is_owner) {
          tag.classList.add('owner-tag');
          tag.innerHTML = '<span class="crown">👑</span>' + escapeHTML(p.name);
        } else {
          tag.innerHTML = '⚔️ ' + escapeHTML(p.name);
        }
        playerList.appendChild(tag);
      });
    }

    playerCount.textContent = allPlayers.length;
  }

  /** 渲染排名 */
  function renderRanking() {
    rankingList.innerHTML = '';

    // 按 final_score 降序排列
    const sorted = allPlayers.slice().sort(function (a, b) {
      return b.final_score - a.final_score;
    });

    const medals = ['🥇', '🥈', '🥉'];

    sorted.forEach(function (p, idx) {
      const div = document.createElement('div');
      div.className = 'rank-item';

      // 最后一名特殊标记
      if (idx === sorted.length - 1 && sorted.length > 1) {
        div.classList.add('last-place');
      }

      const rankNum = idx + 1;
      const medal = idx < 3 ? medals[idx] : '';
      const buffEmoji = getBuffEmoji(p.buff);

      div.innerHTML =
        '<span class="rank-badge">' + medal + ' #' + rankNum + '</span>' +
        '<div class="rank-info">' +
          '<div class="rank-name">' + escapeHTML(p.name) + '</div>' +
          '<div class="rank-buff">' + buffEmoji + ' ' + escapeHTML(p.buff || '无Buff') + ' | 点击' + p.click_count + '次</div>' +
        '</div>' +
        '<span class="rank-score">' + p.final_score + '分</span>';

      rankingList.appendChild(div);
    });

    // 设置垫底名字
    if (sorted.length > 0) {
      loserName.textContent = sorted[sorted.length - 1].name;
    }
  }

  function getBuffEmoji(buff) {
    if (!buff) return '🛡️';
    if (buff.indexOf('火箭') !== -1) return '🚀';
    if (buff.indexOf('哑弹') !== -1) return '💣';
    if (buff.indexOf('精准') !== -1) return '🎯';
    return '🛡️';
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===================== 游戏核心流程 =====================

  /** 进入游戏阶段 */
  function enterGamePhase() {
    stopPolling();
    switchView('game');

    // 显示预备倒计时
    countdownDisplay.style.display = 'block';
    countdownLabel.style.display = 'block';
    clickArea.style.display = 'none';
    buffReveal.style.display = 'none';

    startPrepCountdown();
  }

  /** 预备倒计时 3-2-1 */
  function startPrepCountdown() {
    let prepCount = COUNTDOWN_PREP;
    countdownDisplay.textContent = prepCount;
    countdownLabel.textContent = '全军出击！';
    countdownDisplay.className = 'countdown-display';

    const prepInterval = setInterval(function () {
      prepCount--;
      if (prepCount <= 0) {
        clearInterval(prepInterval);
        countdownDisplay.textContent = 'GO!';
        countdownDisplay.className = 'countdown-display go';
        countdownLabel.textContent = '疯狂点击！';
        setTimeout(function () {
          startMainCountdown();
        }, 500);
      } else {
        countdownDisplay.textContent = prepCount;
      }
    }, 800);
  }

  /** 主倒计时 10 秒 */
  function startMainCountdown() {
    countdownDisplay.textContent = COUNTDOWN_SECONDS;
    countdownDisplay.className = 'countdown-display';
    clickArea.style.display = 'flex';
    clickBtn.disabled = false;
    gameActive = true;
    clickCount = 0;
    clickScoreDisplay.textContent = '0';

    let remaining = COUNTDOWN_SECONDS;

    const countdownInterval = setInterval(function () {
      remaining--;
      countdownDisplay.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        endClickPhase();
      }
    }, 1000);
  }

  /** 结束点击阶段 */
  function endClickPhase() {
    gameActive = false;
    clickBtn.disabled = true;
    countdownDisplay.textContent = '0';
    countdownDisplay.className = 'countdown-display';
    countdownLabel.textContent = '时间到！';

    // 隐藏倒计时和点击区域
    setTimeout(function () {
      countdownDisplay.style.display = 'none';
      countdownLabel.style.display = 'none';
      clickArea.style.display = 'none';

      // 计算并展示 Buff
      calculateAndRevealBuff();
    }, 800);
  }

  /** 处理点击 */
  function handleClick(e) {
    if (!gameActive) return;

    clickCount++;
    clickScoreDisplay.textContent = clickCount;

    // 飘出 +1 动画
    spawnFloatPlus(e);
  }

  /** 生成飘出 +1 */
  function spawnFloatPlus(e) {
    const el = document.createElement('span');
    el.className = 'float-plus';
    el.textContent = '+1';

    // 随机颜色
    const colors = ['#a855f7', '#06b6d4', '#ec4899', '#fbbf24', '#22c55e'];
    el.style.color = colors[Math.floor(Math.random() * colors.length)];

    // 位置：如果有触摸事件用触摸坐标，否则用鼠标坐标
    let x, y;
    if (e.touches && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else if (e.clientX !== undefined) {
      x = e.clientX;
      y = e.clientY;
    } else {
      // 回退到按钮中心
      const rect = clickBtn.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }

    el.style.left = (x - 20 + (Math.random() - 0.5) * 60) + 'px';
    el.style.top  = (y - 10) + 'px';

    document.body.appendChild(el);

    // 动画结束后移除
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1200);
  }

  // ===================== Buff 系统 =====================

  /** Buff 池 */
  const BUFF_POOL = [
    {
      name: '🚀 火箭加速',
      desc: '最终总分翻倍！',
      icon: '🚀',
      apply: function (score, allPlayers, selfRecord) {
        return score * 2;
      }
    },
    {
      name: '💣 哑弹',
      desc: '手滑了，扣5分...',
      icon: '💣',
      apply: function (score) {
        return Math.max(0, score - 5);
      }
    },
    {
      name: '🎯 精准打击',
      desc: '抢夺最低分选手的5分！',
      icon: '🎯',
      apply: function (score, allPlayers, selfRecord) {
        // 找到当前房间内 click_count 最低的选手
        const others = allPlayers.filter(function (p) { return p.id !== selfRecord.id; });
        if (others.length === 0) return score;

        let minClick = Infinity;
        others.forEach(function (p) {
          if (p.click_count < minClick) minClick = p.click_count;
        });

        if (score <= minClick) {
          // 自己就是最低的，Buff 无效
          return score;
        }
        return score + 5;
      }
    },
    {
      name: '🛡️ 无事发生',
      desc: '风平浪静，维持原分。',
      icon: '🛡️',
      apply: function (score) {
        return score;
      }
    }
  ];

  /** 计算并展示 Buff */
  function calculateAndRevealBuff() {
    // 重新获取最新数据用于 Buff 计算
    fetchPlayers().then(function () {
      const buffIdx = Math.floor(Math.random() * BUFF_POOL.length);
      const buff = BUFF_POOL[buffIdx];
      const finalScore = buff.apply(clickCount, allPlayers, playerRecord);

      buffResult = {
        clickCount: clickCount,
        buffName: buff.name,
        buffIcon: buff.icon,
        buffDesc: buff.desc,
        finalScore: finalScore
      };

      // 展示 Buff 卡片
      buffIcon.textContent = buff.icon;
      buffName.textContent = buff.name;
      buffDesc.textContent = buff.desc;
      buffScore.textContent = finalScore + ' 分';
      buffReveal.style.display = 'flex';
      waitingOthers.style.display = 'block';

      // 提交分数到数据库
      submitScore(clickCount, buff.name, finalScore).then(function (ok) {
        if (ok) {
          waitingOthers.textContent = '等待其他选手结算...';
          // 轮询检查是否所有人都完成了
          pollForCompletion();
        }
      });
    });
  }

  /** 轮询检查所有人是否完成 */
  function pollForCompletion() {
    const maxPolls = 60; // 最多等 60 秒
    let polls = 0;

    const interval = setInterval(function () {
      polls++;
      fetchPlayers().then(function (players) {
        const allDone = players.length > 0 && players.every(function (p) { return p.is_finished; });
        if (allDone) {
          clearInterval(interval);
          showResults();
        } else if (polls >= maxPolls) {
          clearInterval(interval);
          // 超时也显示结果
          showResults();
        }
        // 更新等待文字
        const doneCount = players.filter(function (p) { return p.is_finished; }).length;
        waitingOthers.textContent = '已结算 ' + doneCount + '/' + players.length + ' 人，等待其他选手...';
      });
    }, 1000);
  }

  /** 显示结果页 */
  function showResults() {
    stopPolling();
    // 最终次获取数据确保完整
    fetchPlayers().then(function () {
      // 过滤掉未完成的 player（如果超时进入）
      allPlayers = allPlayers.filter(function (p) { return p.is_finished; });
      renderRanking();
      switchView('result');

      // 显示房主的重置按钮
      if (isOwner) {
        ownerReset.style.display = 'block';
      }

      gameActive = false;
    });
  }

  // ===================== 事件绑定 =====================

  /** 加入按钮点击 */
  joinBtn.addEventListener('click', async function () {
    // 已经加入过：拒绝
    if (playerRecord) {
      showToast('你已经加入战场了！', 'error');
      return;
    }

    const name = nameInput.value.trim();

    if (!name) {
      showToast('请输入你的大名！', 'error');
      nameInput.focus();
      return;
    }

    // 检查是否已存在同名
    const dup = allPlayers.find(function (p) {
      return p.name === name;
    });
    if (dup) {
      showToast('换个响亮的名号！', 'error');
      return;
    }

    // 检查游戏是否已开始
    const hasStarted = allPlayers.some(function (p) { return p.game_started; });
    if (hasStarted) {
      showToast('游戏已经开始，请等待下一轮！', 'error');
      return;
    }

    setBtnLoading(joinBtn, true, '加入中...');
    nameInput.disabled = true;

    const record = await joinGame(name);
    if (record) {
      playerName = name;
      playerRecord = record;

      // 如果是第一个玩家，设为房主
      if (allPlayers.length === 1 && allPlayers[0].id === record.id) {
        await setOwner(record);
        playerRecord.is_owner = true;
        isOwner = true;
        ownerActions.style.display = 'block';
        // 刷新列表
        await fetchPlayers();
        renderPlayerList();
      }

      // 加入成功 → 锁定表单，显示已就位
      lockJoinForm(playerName);
      setBtnLoading(joinBtn, false);
    } else {
      nameInput.disabled = false;
      setBtnLoading(joinBtn, false);
    }
  });

  /** 回车加入 */
  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      joinBtn.click();
    }
  });

  /** 全军出击按钮 */
  startBtn.addEventListener('click', async function () {
    if (!isOwner) return;
    if (allPlayers.length < 2) {
      showToast('至少需要 2 名选手才能开始！', 'error');
      return;
    }

    setBtnLoading(startBtn, true, '出击中...');
    const ok = await startGame();
    if (ok) {
      gameActive = true;
      enterGamePhase();
    }
    setBtnLoading(startBtn, false);
  });

  /** 点击按钮 — 同时绑定 touchstart 和 mousedown */
  clickBtn.addEventListener('mousedown', function (e) {
    e.preventDefault();
    handleClick(e);
  });

  clickBtn.addEventListener('touchstart', function (e) {
    e.preventDefault();
    handleClick(e);
  });

  /** 防止双击缩放 */
  clickBtn.addEventListener('dblclick', function (e) {
    e.preventDefault();
  });

  /** 重置按钮 */
  resetBtn.addEventListener('click', async function () {
    if (!confirm('确定要开启新一轮吗？当前轮次的排名数据将被清除。')) return;

    setBtnLoading(resetBtn, true, '重置中...');
    const ok = await resetRoom();
    if (ok) {
      switchView('waiting');
      ownerActions.style.display = 'none';
      ownerReset.style.display = 'none';
      playerList.innerHTML = '<p class="empty-hint">虚位以待，等你登场...</p>';
      playerCount.textContent = '0';
    }
    setBtnLoading(resetBtn, false);
  });

  // ===================== 初始化 =====================

  async function init() {
    // 获取或生成 playerToken
    playerToken = localStorage.getItem('player_token');
    if (!playerToken) {
      playerToken = generateUUID();
      localStorage.setItem('player_token', playerToken);
    }

    // 获取 roomId
    roomId = getRoomId();
    roomTitle.textContent = '🏆 ' + roomId + ' 主持权争夺战';

    // 建立实时连接
    setupRealtime();

    // 开启轮询后备（确保 Realtime 未配置时也能同步）
    startPolling();

    // 获取当前房间数据
    const players = await fetchPlayers();
    renderPlayerList();

    // 检查自己是否已在房间中
    const self = players.find(function (p) { return p.player_token === playerToken; });
    if (self) {
      playerRecord = self;
      playerName = self.name;
      isOwner = self.is_owner;

      if (isOwner) {
        ownerActions.style.display = 'block';
      }

      // 检查游戏状态
      if (self.game_started && !self.is_finished) {
        // 游戏已开始但自己还没结算（刷新页面等场景）
        gameActive = true;
        enterGamePhase();
      } else if (self.is_finished) {
        // 自己已完成
        gameFinished = true;
        gameActive = false;
        clickCount = self.click_count;
        buffResult = {
          clickCount: self.click_count,
          buffName: self.buff,
          buffIcon: getBuffEmoji(self.buff),
          buffDesc: '',
          finalScore: self.final_score
        };
        // 检查是否所有人完成
        fetchPlayers().then(function () {
          const allDone = allPlayers.every(function (p) { return p.is_finished; });
          if (allDone) {
            showResults();
          } else {
            // 显示等待状态
            switchView('game');
            clickArea.style.display = 'none';
            countdownDisplay.style.display = 'none';
            countdownLabel.style.display = 'none';
            buffIcon.textContent = buffResult.buffIcon;
            buffName.textContent = buffResult.buffName;
            buffScore.textContent = buffResult.finalScore + ' 分';
            buffReveal.style.display = 'flex';
            waitingOthers.style.display = 'block';
            pollForCompletion();
          }
        });
      } else if (!self.game_started) {
        // 游戏还没开始，检查是否有其他人开始了
        const started = players.some(function (p) { return p.game_started; });
        if (started) {
          gameActive = true;
          enterGamePhase();
        } else {
          // 已加入，等待房主开始 → 锁定表单
          lockJoinForm(self.name);
        }
      }
    }

    // 如果自己是房主
    if (isOwner) {
      ownerActions.style.display = 'block';
    }

    // 检查游戏已开始的情况
    if (!gameActive && !gameFinished) {
      const hasStarted = players.some(function (p) { return p.game_started; });
      if (hasStarted && playerRecord && !playerRecord.is_finished) {
        gameActive = true;
        enterGamePhase();
      }
    }
  }

  // 启动
  init();

  // 页面卸载时清理
  window.addEventListener('beforeunload', function () {
    stopPolling();
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
  });

})();
