// src/reorder.js
export function mount(root, data) {
  const CORRECT = Array.isArray(data.correct) ? data.correct : [];
  const BASE_TILES = Array.isArray(data.tiles) ? data.tiles : [];

  // --- Optional color grouping from JSON (for future games) ---
  // You can add this to a game JSON if you want:
  // "colorGroups": { "top": [...], "mid": [...], "bottom": [...] }
  const colorGroups = data.colorGroups || null;

  // Default grouping (works for your Salvation Story game)
  const DEFAULT_TOP = new Set(["创造", "堕落", "亚伯拉罕", "出埃及记", "应许之地"]);
  const DEFAULT_MID = new Set(["王国", "南北国", "被掳", "归回"]);
  const DEFAULT_BOT = new Set(["耶稣基督", "教会", "新天新地"]);

  function tileColor(label) {
    // If JSON provides grouping, use it
    if (colorGroups && typeof colorGroups === "object") {
      const top = new Set(colorGroups.top || []);
      const mid = new Set(colorGroups.mid || []);
      const bottom = new Set(colorGroups.bottom || []);

      if (top.has(label)) return "#f2994a";    // orange
      if (mid.has(label)) return "#6fcf97";    // green
      if (bottom.has(label)) return "#1f8a70"; // teal
    }

    // Otherwise fallback to default salvation-history grouping
    if (DEFAULT_TOP.has(label)) return "#f2994a";
    if (DEFAULT_MID.has(label)) return "#6fcf97";
    if (DEFAULT_BOT.has(label)) return "#1f8a70";

    // Generic fallback
    return "rgba(122,162,255,0.22)";
  }

  // --- State ---
  // Each slot is { label: string, locked: boolean }
  let slots = [];
  let selectedIndex = null;
  let history = []; // snapshots for undo

  // --- UI ---
  root.innerHTML = `
    <style>
      .rs-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;}
      .rs-pill{padding:8px 12px;border-radius:999px;background:rgba(255,255,255,0.08);font-weight:800;color:#b8c0d9;}
      .rs-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;}
      .rs-slot{min-height:64px;border-radius:14px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.03);
               display:flex;align-items:center;justify-content:center;position:relative;padding:6px;user-select:none;}
      .rs-idx{position:absolute;top:6px;left:8px;font-size:12px;color:rgba(184,192,217,0.7);font-weight:900;}
      .rs-tile{width:100%;border-radius:12px;padding:10px 8px;font-weight:900;text-align:center;font-size:18px;line-height:1.1;
               border:1px solid rgba(255,255,255,0.12);cursor:pointer;user-select:none;touch-action:manipulation;
               box-shadow:0 8px 18px rgba(0,0,0,0.25);}
      .rs-tile.rs-small{font-size:16px;}
      .rs-tile.rs-selected{outline:3px solid rgba(122,162,255,0.85);transform:translateY(-1px);}
      .rs-tile.rs-locked{outline:2px solid rgba(34,197,94,0.85);opacity:0.95;}
      .rs-msg{margin-top:12px;font-weight:900;}
      .rs-msg.good{color:#22c55e;}
      .rs-msg.bad{color:#ef4444;}
      .rs-msg.neutral{color:#b8c0d9;}

      /* Button emphasis (play.html provides base button styling already) */
      .rs-btn-primary{background:rgba(122,162,255,0.22)!important;border:1px solid rgba(122,162,255,0.35)!important;}
      .rs-btn-good{background:rgba(34,197,94,0.18)!important;border:1px solid rgba(34,197,94,0.35)!important;}
    </style>

    <div class="rs-toolbar">
      <button class="rs-btn-primary" id="shuffle">Shuffle 打乱</button>
      <button id="reset">Reset 重新开始</button>
      <button id="undo">Undo 撤销一步</button>
      <button class="rs-btn-good" id="check">Check 检查答案</button>
      <button id="hint">Hint 提示下一个</button>
      <button id="lock">Lock 正确的先锁住</button>
      <span class="rs-pill" id="pill"></span>
    </div>

    <div class="rs-board" id="board"></div>
    <div class="rs-msg neutral" id="msg"></div>
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
    if (history.length > 50) history.shift();
  }

  function setMessage(text, kind = "neutral") {
    msgEl.className = `rs-msg ${kind}`;
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
      slot.className = "rs-slot";

      const idx = document.createElement("div");
      idx.className = "rs-idx";
      idx.textContent = String(i + 1);
      slot.appendChild(idx);

      const tile = document.createElement("div");
      tile.className = "rs-tile";

      const label = slots[i].label || "";
      tile.textContent = label;

      // Slightly smaller text for longer labels
      if (label.length >= 4) tile.classList.add("rs-small");

      // Color by group
      tile.style.background = tileColor(label);

      // Selected / Locked styling
      if (selectedIndex === i) tile.classList.add("rs-selected");
      if (slots[i].locked) tile.classList.add("rs-locked");

      slot.appendChild(tile);
      boardEl.appendChild(slot);

      slot.addEventListener("click", () => onSlotClick(i));
    }

    updatePill();
  }

  function onSlotClick(i) {
    // select
    if (selectedIndex === null) {
      selectedIndex = i;
      render();
      return;
    }

    // unselect same
    if (selectedIndex === i) {
      selectedIndex = null;
      render();
      return;
    }

    // swap
    swap(selectedIndex, i);
  }

  function swap(i, j) {
    if (i === j) return;

    if (slots[i].locked || slots[j].locked) {
      setMessage("这格已经锁住了，不能换。", "bad");
      selectedIndex = null;
      render();
      return;
    }

    saveHistory();
    const tmp = slots[i].label;
    slots[i].label = slots[j].label;
    slots[j].label = tmp;

    selectedIndex = null;
    render();
    setMessage("");
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

  // Shuffle behavior (different from Reset):
  // - Reset: fresh shuffle from BASE_TILES, clears locks/history
  // - Shuffle: reshuffle ONLY the unlocked tiles, keeping locked ones in place
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
  shuffleBtn.addEventListener("click", () => {
    shuffleUnlockedTiles();
  });

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
    } else {
      setMessage(`目前对了 ${c}/${CORRECT.length}。继续加油！可以用 Hint 或先 Lock 正确的。`, "bad");
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

  lockBtn.addEventListener("click", () => {
    lockCorrectOnes();
  });

  // Play.html "Restart" button calls api.restart()
  // We'll make restart behave like Reset (fresh new game).
  function restart() {
    initFreshShuffle();
  }

  // Start
  initFreshShuffle();
  return { restart };
}


function confetti(root){
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
