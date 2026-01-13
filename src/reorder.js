// src/reorder.js
// Reorder game engine (drag from tray into numbered boxes).
// Features: Shuffle tray, Reset, Undo, Hint, Lock-correct, Auto-check, Confetti + Badge, Sound hooks.
// Works on laptop + iPhone/iPad (pointer-based dragging + tap fallback).

export function mount(root, data) {
  const NORMALIZED = normalizeGameData(data);
  const ORDER = NORMALIZED.correctOrder; // array of tile ids
  const TILES = NORMALIZED.tiles;        // array of {id,en,zh}
  const TILE_BY_ID = new Map(TILES.map(t => [t.id, t]));

  // Optional color grouping from JSON:
  // "colorGroups": { "top": ["id1"...], "mid": [...], "bottom": [...] }
  const colorGroups = (data && typeof data.colorGroups === "object") ? data.colorGroups : null;

  // Default grouping for Salvation Story (by ids)
  const DEFAULT_TOP = new Set(["creation", "fall", "abraham", "exodus", "promised_land"]);
  const DEFAULT_MID = new Set(["kingdom", "divided_kingdom", "exile", "return"]);
  const DEFAULT_BOT = new Set(["jesus_christ", "church", "new_heaven_new_earth"]);

  function tileColor(tileId) {
    if (colorGroups && typeof colorGroups === "object") {
      const top = new Set(colorGroups.top || []);
      const mid = new Set(colorGroups.mid || []);
      const bottom = new Set(colorGroups.bottom || []);
      if (top.has(tileId)) return "var(--tileTop)";
      if (mid.has(tileId)) return "var(--tileMid)";
      if (bottom.has(tileId)) return "var(--tileBot)";
    }
    if (DEFAULT_TOP.has(tileId)) return "var(--tileTop)";
    if (DEFAULT_MID.has(tileId)) return "var(--tileMid)";
    if (DEFAULT_BOT.has(tileId)) return "var(--tileBot)";
    return "rgba(96,165,250,0.25)";
  }

  // --- State ---
  /** @type {{tileId: string|null, locked: boolean}[]} */
  let slots = [];
  /** @type {string[]} */
  let tray = [];
  /** @type {{source:"tray"|"slot", tileId:string, slotIndex?:number} | null} */
  let selected = null;
  /** @type {any[]} */
  let history = [];

  // --- UI ---
  root.innerHTML = `
    <div class="reorderToolbar">
      <button class="btn btn-primary" id="shuffle">Shuffle / 打乱</button>
      <button class="btn" id="reset">Reset / 重新开始</button>
      <button class="btn" id="undo">Undo / 撤销</button>
      <button class="btn btn-good" id="check">Check / 检查</button>
      <button class="btn" id="hint">Hint / 提示</button>
      <button class="btn" id="lock">Lock correct / 锁住正确</button>
      <span class="pill" id="pill"></span>
    </div>

    <div class="reorderBoard" id="board" aria-label="Answer boxes"></div>

    <div class="reorderTrayWrap">
      <div class="reorderTrayTitle">Card tray</div>
      <div class="reorderTray" id="tray" aria-label="Card tray"></div>
    </div>

    <div class="msg neutral" id="msg"></div>
  `;

  const boardEl = root.querySelector("#board");
  const trayEl = root.querySelector("#tray");
  const msgEl = root.querySelector("#msg");
  const pillEl = root.querySelector("#pill");

  const shuffleBtn = root.querySelector("#shuffle");
  const resetBtn = root.querySelector("#reset");
  const undoBtn = root.querySelector("#undo");
  const checkBtn = root.querySelector("#check");
  const hintBtn = root.querySelector("#hint");
  const lockBtn = root.querySelector("#lock");

  // --- Helpers ---
  function setMessage(text, kind = "neutral") {
    msgEl.className = `msg ${kind}`;
    msgEl.textContent = text;
  }

  function fisherYates(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function snapshot() {
    return {
      slots: slots.map(s => ({ tileId: s.tileId, locked: s.locked })),
      tray: tray.slice(),
    };
  }

  function restore(snap) {
    slots = snap.slots.map(s => ({ tileId: s.tileId, locked: s.locked }));
    tray = snap.tray.slice();
    selected = null;
  }

  function saveHistory() {
    history.push(snapshot());
    if (history.length > 80) history.shift();
  }

  function tileText(tileId) {
    const t = TILE_BY_ID.get(tileId);
    if (!t) return { en: String(tileId), zh: "" };
    return { en: t.en || "", zh: t.zh || "" };
  }

  function correctCount() {
    let c = 0;
    for (let i = 0; i < ORDER.length; i++) {
      if (slots[i]?.tileId === ORDER[i]) c++;
    }
    return c;
  }

  function updatePill() {
    pillEl.textContent = `${correctCount()} / ${ORDER.length} correct`;
  }

  function clearSelection() {
    selected = null;
    render();
  }

  function initFreshShuffle() {
    slots = ORDER.map(() => ({ tileId: null, locked: false }));
    tray = fisherYates(TILES.map(t => t.id));
    selected = null;
    history = [];
    render();
    setMessage("");
  }

  // --- Rendering ---
  function render() {
    renderBoard();
    renderTray();
    updatePill();
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < ORDER.length; i++) {
      const slot = document.createElement("div");
      slot.className = "reorderSlot";
      slot.dataset.index = String(i);

      const idx = document.createElement("div");
      idx.className = "reorderIdx";
      idx.textContent = String(i + 1);
      slot.appendChild(idx);

      const tileId = slots[i].tileId;
      if (tileId) {
        const tile = buildTile(tileId);
        tile.classList.add("inSlot");

        if (slots[i].locked) tile.classList.add("locked");
        if (tileId === ORDER[i]) tile.classList.add("correct");
        if (selected && selected.source === "slot" && selected.slotIndex === i) tile.classList.add("selected");

        // Tap fallback
        tile.addEventListener("click", (e) => {
          e.stopPropagation();
          onTileTapFromSlot(i);
        });

        // Drag support
        bindDrag(tile, { source: "slot", tileId, slotIndex: i });

        slot.appendChild(tile);
      } else {
        // Empty slot tap
        slot.addEventListener("click", () => onSlotTap(i));
      }

      // Allow tap-to-place even if the slot has a tile (swap)
      slot.addEventListener("click", () => onSlotTap(i));
      boardEl.appendChild(slot);
    }
  }

  function renderTray() {
    trayEl.innerHTML = "";
    tray.forEach((tileId) => {
      const tile = buildTile(tileId);
      tile.classList.add("inTray");
      if (selected && selected.source === "tray" && selected.tileId === tileId) tile.classList.add("selected");

      tile.addEventListener("click", (e) => {
        e.stopPropagation();
        onTileTapFromTray(tileId);
      });

      bindDrag(tile, { source: "tray", tileId });
      trayEl.appendChild(tile);
    });

    // Tap fallback: move selected-from-slot back to tray
    trayEl.addEventListener("click", () => {
      if (selected && selected.source === "slot") {
        moveSlotToTray(selected.slotIndex);
      }
    }, { once: true });
  }

  function buildTile(tileId) {
    const { en, zh } = tileText(tileId);
    const el = document.createElement("div");
    el.className = "reorderTile";
    el.style.background = tileColor(tileId);
    el.dataset.tileId = tileId;
    el.innerHTML = `
      <div class="tileEn">${escapeHtml(en)}</div>
      <div class="tileZh">${escapeHtml(zh)}</div>
    `;
    return el;
  }

  // --- Tap interactions (fallback) ---
  function onTileTapFromTray(tileId) {
    if (selected && selected.source === "tray" && selected.tileId === tileId) {
      selected = null;
    } else {
      selected = { source: "tray", tileId };
    }
    render();
    playSfx("pop");
  }

  function onTileTapFromSlot(slotIndex) {
    const tileId = slots[slotIndex].tileId;
    if (!tileId) return;
    if (slots[slotIndex].locked) {
      setMessage("That card is locked (already correct).", "neutral");
      playSfx("pop");
      return;
    }
    if (selected && selected.source === "slot" && selected.slotIndex === slotIndex) {
      selected = null;
    } else {
      selected = { source: "slot", tileId, slotIndex };
    }
    render();
    playSfx("pop");
  }

  function onSlotTap(slotIndex) {
    if (!selected) return;

    if (selected.source === "tray") {
      placeFromTray(selected.tileId, slotIndex);
      return;
    }

    if (selected.source === "slot") {
      if (selected.slotIndex === slotIndex) {
        selected = null;
        render();
        return;
      }
      swapSlots(selected.slotIndex, slotIndex);
      return;
    }
  }

  // --- Moves ---
  function placeFromTray(tileId, slotIndex, { animate = true } = {}) {
    if (slots[slotIndex].locked) {
      setMessage("That box is locked.", "bad");
      playSfx("pop");
      clearSelection();
      return;
    }

    saveHistory();

    // If slot occupied, send that tile back to tray.
    const existing = slots[slotIndex].tileId;
    if (existing) {
      tray.push(existing);
    }

    // Remove tile from tray
    const idx = tray.indexOf(tileId);
    if (idx >= 0) tray.splice(idx, 1);

    slots[slotIndex].tileId = tileId;
    selected = null;

    render();
    if (animate) pulseSlot(slotIndex);
    afterMove();
  }

  function swapSlots(a, b, { animate = true } = {}) {
    if (a === b) return;
    if (slots[a].locked || slots[b].locked) {
      setMessage("Locked cards can’t be moved.", "bad");
      playSfx("pop");
      clearSelection();
      return;
    }

    saveHistory();
    const tmp = slots[a].tileId;
    slots[a].tileId = slots[b].tileId;
    slots[b].tileId = tmp;
    selected = null;
    render();
    if (animate) {
      pulseSlot(a);
      pulseSlot(b);
    }
    afterMove();
  }

  function moveSlotToTray(slotIndex, { animate = true } = {}) {
    if (slots[slotIndex].locked) {
      setMessage("That card is locked.", "bad");
      playSfx("pop");
      clearSelection();
      return;
    }
    const tileId = slots[slotIndex].tileId;
    if (!tileId) {
      clearSelection();
      return;
    }

    saveHistory();
    slots[slotIndex].tileId = null;
    tray.push(tileId);
    selected = null;
    render();
    if (animate) pulseTray();
    afterMove();
  }

  function afterMove() {
    setMessage("");
    playSfx("pop");
    autoCheck();
  }

  function autoCheck() {
    // Only celebrate when all are correct.
    if (correctCount() === ORDER.length) {
      setMessage("All correct — great teamwork!", "good");
      playSfx("ding");
      confetti();
      showBadge({
        title: "Great teamwork!",
        sub: "You put the story in the right order.",
        badge: "Bible Explorer"
      });
    }
  }

  // --- Buttons ---
  shuffleBtn.addEventListener("click", () => {
    saveHistory();
    tray = fisherYates(tray);
    selected = null;
    render();
    setMessage("Shuffled the tray.", "neutral");
    playSfx("pop");
  });

  resetBtn.addEventListener("click", () => {
    initFreshShuffle();
    setMessage("Reset. Start again!", "neutral");
  });

  undoBtn.addEventListener("click", () => {
    if (history.length === 0) {
      setMessage("Nothing to undo.", "neutral");
      return;
    }
    const snap = history.pop();
    restore(snap);
    render();
    setMessage("Undid one step.", "neutral");
    playSfx("pop");
  });

  checkBtn.addEventListener("click", () => {
    const c = correctCount();
    if (c === ORDER.length) {
      // autoCheck already handles celebration; keep this light.
      setMessage("All correct — great teamwork!", "good");
      playSfx("ding");
      confetti();
      showBadge({
        title: "Great teamwork!",
        sub: "You put the story in the right order.",
        badge: "Bible Explorer"
      });
      return;
    }
    setMessage(`So far: ${c}/${ORDER.length} correct. Try Hint or Lock correct.`, "bad");
    playSfx("pop");
  });

  hintBtn.addEventListener("click", () => {
    for (let i = 0; i < ORDER.length; i++) {
      if (slots[i].tileId !== ORDER[i]) {
        const { en, zh } = tileText(ORDER[i]);
        setMessage(`Hint: Box ${i + 1} should be “${en} / ${zh}”.`, "neutral");
        pulseSlot(i, "hint");
        pulseTileInTray(ORDER[i]);
        playSfx("pop");
        return;
      }
    }
    setMessage("Already perfect!", "good");
    playSfx("ding");
  });

  lockBtn.addEventListener("click", () => {
    saveHistory();
    for (let i = 0; i < ORDER.length; i++) {
      if (slots[i].tileId && slots[i].tileId === ORDER[i]) {
        slots[i].locked = true;
      }
    }
    selected = null;
    render();
    setMessage("Locked the cards that are currently correct.", "neutral");
    playSfx("pop");
  });

  // --- Drag (pointer-based, mobile-friendly) ---
  let drag = null;

  function bindDrag(tileEl, meta) {
    tileEl.style.touchAction = "none";
    tileEl.addEventListener("pointerdown", (e) => {
      // If locked in slot, don't drag.
      if (meta.source === "slot" && slots[meta.slotIndex].locked) return;

      drag = {
        meta,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        ghost: null,
        originEl: tileEl,
        pointerId: e.pointerId,
      };

      tileEl.setPointerCapture(e.pointerId);
    });

    tileEl.addEventListener("pointermove", (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const dist = Math.hypot(dx, dy);

      if (!drag.moved && dist > 6) {
        drag.moved = true;
        drag.ghost = makeGhost(tileEl);
        tileEl.classList.add("dragOrigin");
        playSfx("pop");
      }

      if (drag.ghost) {
        drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      }
    });

    tileEl.addEventListener("pointerup", (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;

      // Tap fallback (no drag)
      if (!drag.moved) {
        if (meta.source === "tray") onTileTapFromTray(meta.tileId);
        else onTileTapFromSlot(meta.slotIndex);
        drag = null;
        return;
      }

      const drop = pickDropTarget(e.clientX, e.clientY);
      cleanupDrag();

      if (!drop) {
        // No valid target; do nothing.
        setMessage("", "neutral");
        drag = null;
        return;
      }

      if (drop.type === "slot") {
        if (meta.source === "tray") {
          placeFromTray(meta.tileId, drop.index);
        } else {
          // From slot to slot
          swapSlots(meta.slotIndex, drop.index);
        }
        drag = null;
        return;
      }

      if (drop.type === "tray") {
        if (meta.source === "slot") {
          moveSlotToTray(meta.slotIndex);
        }
        drag = null;
        return;
      }
    });

    tileEl.addEventListener("pointercancel", (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      cleanupDrag();
      drag = null;
    });
  }

  function cleanupDrag() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    if (drag.originEl) drag.originEl.classList.remove("dragOrigin");
  }

  function makeGhost(tileEl) {
    const ghost = tileEl.cloneNode(true);
    ghost.classList.add("dragGhost");
    ghost.style.position = "fixed";
    ghost.style.left = "0";
    ghost.style.top = "0";
    ghost.style.zIndex = "9999";
    ghost.style.pointerEvents = "none";
    ghost.style.transform = "translate(-9999px,-9999px)";
    document.body.appendChild(ghost);
    return ghost;
  }

  function pickDropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slot = el.closest?.(".reorderSlot");
    if (slot && slot.dataset.index != null) {
      return { type: "slot", index: Number(slot.dataset.index) };
    }
    const trayWrap = el.closest?.(".reorderTrayWrap");
    if (trayWrap) return { type: "tray" };
    return null;
  }

  // --- Small animations / helpers ---
  function pulseSlot(index, cls = "snap") {
    const slot = boardEl.querySelector(`.reorderSlot[data-index="${index}"]`);
    if (!slot) return;
    const tile = slot.querySelector(".reorderTile");
    if (!tile) return;
    tile.classList.remove("snap", "hint");
    // force reflow
    void tile.offsetWidth;
    tile.classList.add(cls);
    setTimeout(() => tile.classList.remove(cls), 420);
  }

  function pulseTray() {
    trayEl.classList.add("trayPulse");
    setTimeout(() => trayEl.classList.remove("trayPulse"), 420);
  }

  function pulseTileInTray(tileId) {
    const el = trayEl.querySelector(`.reorderTile[data-tile-id="${cssEscape(tileId)}"]`);
    if (!el) return;
    el.classList.remove("hint");
    void el.offsetWidth;
    el.classList.add("hint");
    setTimeout(() => el.classList.remove("hint"), 520);
  }

  function cssEscape(s) {
    // Basic escape for attribute selector usage.
    return String(s).replaceAll('"', '\\"');
  }

  function restart() {
    initFreshShuffle();
  }

  initFreshShuffle();
  return { restart };
}

function normalizeGameData(data) {
  const rawTiles = Array.isArray(data?.tiles) ? data.tiles : [];
  const tiles = rawTiles.map((t, i) => {
    if (t && typeof t === "object") {
      const id = String(t.id ?? `tile_${i}`);
      return { id, en: String(t.en ?? t.label ?? id), zh: String(t.zh ?? "") };
    }
    const s = String(t);
    return { id: s, en: s, zh: "" };
  });

  const correctOrder = Array.isArray(data?.correct) ? data.correct.map(String) : tiles.map(t => t.id);
  return { tiles, correctOrder };
}

/* ---------- Rewards & SFX helpers ---------- */

function soundEnabled() {
  return document.documentElement.dataset.sound === "1";
}

function playSfx(kind) {
  if (!soundEnabled()) return;
  try {
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
  } catch (_) {}
}

function showBadge({ title, sub, badge }) {
  // Remove any existing overlay
  const old = document.querySelector(".badgeOverlay");
  if (old) old.remove();

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
    if (e.target === overlay) overlay.remove();
  });

  overlay.querySelector("#badgeAgain").onclick = () => {
    overlay.remove();
    const restartBtn = document.getElementById("restartBtn");
    if (restartBtn) restartBtn.click();
  };

  overlay.querySelector("#badgeBack").onclick = () => {
    window.location.href = "index.html";
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function confetti() {
  const layer = document.createElement("div");
  layer.style.position = "fixed";
  layer.style.inset = "0";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "9999";
  document.body.appendChild(layer);

  const n = 120;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    p.style.position = "absolute";
    p.style.left = Math.random() * 100 + "vw";
    p.style.top = (-10 - Math.random() * 30) + "vh";
    p.style.width = (6 + Math.random() * 8) + "px";
    p.style.height = (10 + Math.random() * 14) + "px";
    p.style.borderRadius = "6px";
    p.style.background = `hsl(${Math.floor(Math.random() * 360)} 90% 60%)`;
    p.style.opacity = "0.95";
    p.style.transform = `rotate(${Math.random() * 180}deg)`;
    p.style.transition = "transform 1.2s linear, top 1.2s linear, left 1.2s linear, opacity 1.2s linear";
    layer.appendChild(p);

    requestAnimationFrame(() => {
      p.style.top = (110 + Math.random() * 20) + "vh";
      p.style.left = (parseFloat(p.style.left) + (Math.random() * 20 - 10)) + "vw";
      p.style.transform = `rotate(${600 + Math.random() * 600}deg)`;
      p.style.opacity = "0.0";
    });
  }

  setTimeout(() => layer.remove(), 1400);
}
