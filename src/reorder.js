// src/reorder.js
// Reorder game engine with: Lock, Undo, Hint, Confetti, Badge reward, Sound hooks, Tap-friendly sizing via CSS.

export function mount(root, data) {
  const CORRECT = Array.isArray(data.correct) ? data.correct : [];
  const BASE_TILES = Array.isArray(data.tiles) ? data.tiles : [];

  // Optional color grouping from JSON:
  // "colorGroups": { "top": [...], "mid": [...], "bottom": [...] }
  const colorGroups = data.colorGroups || null;

  // Default grouping for Salvation Story
  const DEFAULT_TOP = new Set(["创造", "堕落", "亚伯拉罕", "出埃及记", "应许之地"]);
  const DEFAULT_MID = new Set(["王国", "南北国", "被掳", "归回"]);
  const DEFAULT_BOT = new Set(["耶稣基督", "教会", "新天新地"]);

  function tileColor(label) {
    if (colorGroups && typeof colorGroups === "object") {
      const top = new Set(colorGroups.top || []);
      const mid = new Set(colorGroups.mid || []);
      const bottom = new Set(colorGroups.bottom || []);
      if (top.has(label)) return "var(--tileTop)";
      if (mid.has(label)) return "var(--tileMid)";
      if (bottom.has(label)) return "var(--tileBot)";
    }
    if (DEFAULT_TOP.has(label)) return "var(--tileTop)";
    if (DEFAULT_MID.has(label)) return "var(--tileMid)";
    if (DEFAULT_BOT.has(label)) return "var(--tileBot)";
    return "rgba(96,165,250,0.25)";
  }

  // --- State ---
  let slots = []; // {label, locked}
  let selectedIndex = null;
  let history = [];

  // --- UI ---
  root.innerHTML = `
    <div class="reorderToolbar">
      <button class="btn btn-primary" id="shuffle">Shuffle 打乱</button>
      <button class="btn" id="reset">Reset 重新开始</button>
      <button class="btn" id="undo">Undo 撤销一步</button>
      <button class="btn btn-good" id="check">Check 检查答案</button>
      <button class="btn" id="hint">Hint 提示下一个</button>
      <button class="btn" id="lock">Lock 正确的先锁住</button>
      <span class="pill" id="pill"></span>
    </div>

    <div class="reorderBoard" id="board"></div>
    <div class="msg neutral" id="msg"></div>

    <div class="sub" style="margin-top:14px;">
      小玩法：大家轮流当 <b>读的人</b> / <b>移的人</b> / <b>检查的人</b>。完成后一起复述一遍“上帝救恩的大故事”。
    </div>
  `;

  const boardEl = root.querySelector("#board");
  const msgEl = root.querySelector("#msg");
  const pillEl = root.querySelector("#pill");

  const shuffleBtn = root.querySelector("#shuffle");
  const resetBtn = root.querySelector("#reset");
  const undoBtn = root.querySelector("#undo");
  const checkBtn = root.querySelector("#check");
  const hintBtn = root.querySelector("#hint");
  const lockBtn = root.querySelector("#lock");

  // --- Helpers ---
  function cloneSlots(s) {
    return s.map(x => ({ label: x.label, locked: x.locked }));
  }

  function saveHistory() {
    history.push(cloneSlots(slots));
    if (history.length > 60) history.shift();
  }

  function setMessage(text, kind = "neutral") {
    msgEl.className = `msg ${kind}`;
    msgEl.textContent = text;
  }

  function correctCount() {
    let c = 0;
    for (let i = 0; i < CORRECT.length; i++) {
      if (slots[i]?.label === CORRECT[i]) c++;
    }
    return c;
  }

  function updatePill() {
    pillEl.textContent = `${correctCount()} / ${CORRECT.length} correct`;
  }

  function fisherYates(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function initFreshShuffle() {
    const labels = fisherYates(BASE_TILES);
    slots = labels.map(l => ({ label: l, locked: false }));
    selectedIndex = null;
    history = [];
    render();
    setMessage("");
  }

  function render() {
    boardEl.innerHTML = "";

    for (let i = 0; i < slots.length; i++) {
      const slot = document.createElement("div");
      slot.className = "reorderSlot";

      const idx = document.createElement("div");
      idx.className = "reorderIdx";
      idx.textContent = String(i + 1);
      slot.appendChild(idx);

      const tile = document.createElement("div");
      tile.className = "reorderTile";

      const label = slots[i].label || "";
      tile.textContent = label;
      tile.style.background = tileColor(label);

      if (label.length >= 4) tile.classList.add("small");
      if (selectedIndex === i) tile.classList.add("selected");
      if (slots[i].locked) tile.classList.add("locked");

      slot.appendChild(tile);
      boardEl.appendChild(slot);

      slot.addEventListener("click", () => onSlotClick(i));
    }

    updatePill();
  }

  function onSlotClick(i) {
    if (selectedIndex === null) {
      selectedIndex = i;
      render();
      return;
    }
    if (selectedIndex === i) {
      selectedIndex = null;
      render();
      return;
    }
    swap(selectedIndex, i);
  }

  function swap(i, j) {
    if (i === j) return;

    if (slots[i].locked || slots[j].locked) {
      setMessage("这格已经锁住了，不能换。", "bad");
      selectedIndex = null;
      render();
      playSfx("pop");
      return;
    }

    saveHistory();
    const tmp = slots[i].label;
    slots[i].label = slots[j].label;
    slots[j].label = tmp;

    selectedIndex = null;
    render();
    setMessage("");
    playSfx("pop");
  }

  function lockCorrectOnes() {
    saveHistory();
    for (let i = 0; i < CORRECT.length; i++) {
      slots[i].locked = (slots[i].label === CORRECT[i]);
    }
    selectedIndex = null;
    render();
    setMessage("已锁住目前放对的格子。", "neutral");
  }

  // Shuffle unlocked tiles only (keeps locked tiles in place)
  function shuffleUnlockedTiles() {
    saveHistory();

    const idxs = [];
    const labels = [];
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].locked) {
        idxs.push(i);
        labels.push(slots[i].label);
      }
    }

    const shuffled = fisherYates(labels);
    idxs.forEach((slotIndex, k) => {
      slots[slotIndex].label = shuffled[k];
    });

    selectedIndex = null;
    render();
    setMessage("已打乱（保留锁住的格子）。", "neutral");
  }

  // --- Buttons ---
  shuffleBtn.addEventListener("click", () => shuffleUnlockedTiles());

  resetBtn.addEventListener("click", () => {
    initFreshShuffle();
    setMessage("重新开始～", "neutral");
  });

  undoBtn.addEventListener("click", () => {
    if (history.length === 0) {
      setMessage("没有可以撤销的步骤。", "neutral");
      return;
    }
    slots = history.pop();
    selectedIndex = null;
    render();
    setMessage("已撤销一步。", "neutral");
  });

  checkBtn.addEventListener("click", () => {
    const c = correctCount();
    if (c === CORRECT.length) {
      setMessage("全对！你们完成了上帝救恩的大故事！", "good");
      playSfx("ding");
      confetti();
      showBadge({
        title: "Great teamwork!",
        sub: "You put the story in the right order.",
        badge: "Bible Explorer"
      });
    } else {
      setMessage(`目前对了 ${c}/${CORRECT.length}。继续加油！可以用 Hint 或先 Lock 正确的。`, "bad");
      playSfx("pop");
    }
  });

  hintBtn.addEventListener("click", () => {
    for (let i = 0; i < CORRECT.length; i++) {
      if (slots[i].label !== CORRECT[i]) {
        setMessage(`提示：第 ${i + 1} 格应该是「${CORRECT[i]}」。`, "neutral");
        return;
      }
    }
    setMessage("已经全对了！", "good");
  });

  lockBtn.addEventListener("click", () => lockCorrectOnes());

  function restart() {
    initFreshShuffle();
  }

  initFreshShuffle();
  return { restart };
}

/* ---------- Rewards & SFX helpers ---------- */

function soundEnabled(){
  return document.documentElement.dataset.sound === "1";
}

function playSfx(kind){
  if(!soundEnabled()) return;
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";

    const now = ctx.currentTime;
    const freq = kind === "pop" ? 520 : 740; // pop / ding
    o.frequency.setValueAtTime(freq, now);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.16);
    o.onended = () => ctx.close();
  }catch(_){}
}

function showBadge({ title, sub, badge }){
  // Remove any existing overlay
  const old = document.querySelector(".badgeOverlay");
  if(old) old.remove();

  const overlay = document.createElement("div");
  overlay.className = "badgeOverlay";

  overlay.innerHTML = `
    <div class="badgeCard" role="dialog" aria-modal="true">
      <div class="badgeIcon">
        <img src="assets/sheep.svg" alt="Sheep badge" />
      </div>
      <div class="badgeTitle">${escapeHtml(title)}</div>
      <div class="badgeSub">${escapeHtml(sub)}<br/><b>Badge:</b> ${escapeHtml(badge)}</div>
      <div class="badgeButtons">
        <button class="btn btn-primary" id="badgeAgain">Play again</button>
        <button class="btn" id="badgeBack">Back to library</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if(e.target === overlay) overlay.remove();
  });

  overlay.querySelector("#badgeAgain").onclick = () => {
    overlay.remove();
    // Trigger the page-level Restart button for consistency
    const restartBtn = document.getElementById("restartBtn");
    if(restartBtn) restartBtn.click();
  };

  overlay.querySelector("#badgeBack").onclick = () => {
    window.location.href = "index.html";
  };
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function confetti(){
  const layer = document.createElement("div");
  layer.style.position = "fixed";
  layer.style.inset = "0";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "9999";
  document.body.appendChild(layer);

  const n = 120;
  for(let i=0;i<n;i++){
    const p = document.createElement("div");
    p.style.position = "absolute";
    p.style.left = Math.random()*100 + "vw";
    p.style.top = (-10 - Math.random()*30) + "vh";
    p.style.width = (6 + Math.random()*8) + "px";
    p.style.height = (10 + Math.random()*14) + "px";
    p.style.borderRadius = "6px";
    p.style.background = `hsl(${Math.floor(Math.random()*360)} 90% 60%)`;
    p.style.opacity = "0.95";
    p.style.transform = `rotate(${Math.random()*180}deg)`;
    p.style.transition = "transform 1.2s linear, top 1.2s linear, left 1.2s linear, opacity 1.2s linear";
    layer.appendChild(p);

    requestAnimationFrame(() => {
      p.style.top = (110 + Math.random()*20) + "vh";
      p.style.left = (parseFloat(p.style.left) + (Math.random()*20-10)) + "vw";
      p.style.transform = `rotate(${600 + Math.random()*600}deg)`;
      p.style.opacity = "0.0";
    });
  }

  setTimeout(() => layer.remove(), 1400);
}
