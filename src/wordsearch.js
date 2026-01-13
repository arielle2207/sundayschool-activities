// src/wordsearch.js
// Word search engine with: cute styling classes, sound (pop), confetti + badge on completion, tap-friendly sizing via CSS.

export function mount(root, data){
  const size = data.size ?? 12;
  const words = (data.words ?? []).map(w => w.toUpperCase());
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  let grid = makeEmpty(size);
  let placed = [];
  let selectedCells = [];

  root.innerHTML = `
    <div class="reorderToolbar" style="margin-bottom:12px;">
      <button class="btn btn-primary" id="new">New Grid</button>
      <button class="btn" id="clear">Clear Selection</button>
      <span class="pill" id="pill"></span>
    </div>

    <div class="wsLayout">
      <div id="gridWrap"></div>
      <div>
        <div style="font-weight:1000;margin-bottom:10px;">Find these words:</div>
        <div class="wsWordList" id="wordList"></div>
        <div class="msg neutral" id="msg" style="margin-top:10px;"></div>
      </div>
    </div>
  `;

  const pill = root.querySelector("#pill");
  const msg = root.querySelector("#msg");
  const gridWrap = root.querySelector("#gridWrap");
  const wordList = root.querySelector("#wordList");

  function build(){
    grid = makeEmpty(size);
    placed = [];
    selectedCells = [];
    msg.textContent = "";

    // place words (horizontal/vertical/diagonal + backwards)
    for(const w of words){
      const ok = placeWord(grid, w, 240);
      if(ok) placed.push(w);
    }

    // fill blanks
    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        if(!grid[r][c]) grid[r][c] = alphabet[Math.floor(Math.random()*alphabet.length)];
      }
    }

    render();
  }

  function render(){
    const found = data._found ?? (data._found = new Set());
    pill.textContent = `${found.size} / ${placed.length} found`;

    // word list
    wordList.innerHTML = "";
    for(const w of placed){
      const tag = document.createElement("span");
      tag.className = "wsTag" + (found.has(w) ? " found" : "");
      tag.textContent = w;
      wordList.appendChild(tag);
    }

    // grid
    gridWrap.innerHTML = "";
    const table = document.createElement("div");
    table.className = "wsGrid";
    table.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const cell = document.createElement("button");
        cell.className = "wsCell";
        cell.textContent = grid[r][c];

        const key = `${r},${c}`;
        if(selectedCells.includes(key)){
          cell.classList.add("selected");
        }

        cell.onclick = () => {
          if(selectedCells.includes(key)){
            selectedCells = selectedCells.filter(x => x !== key);
          }else{
            selectedCells.push(key);
          }
          checkSelection();
          render();
        };

        table.appendChild(cell);
      }
    }

    gridWrap.appendChild(table);
  }

  function checkSelection(){
    const letters = selectedCells.map(k => {
      const [r,c] = k.split(",").map(Number);
      return grid[r][c];
    }).join("");

    const rev = letters.split("").reverse().join("");
    const found = data._found ?? (data._found = new Set());

    if(placed.includes(letters) && !found.has(letters)){
      found.add(letters);
      msg.className = "msg good";
      msg.textContent = `Found: ${letters}`;
      selectedCells = [];
      playSfx("pop");
      maybeComplete(found);
      return;
    }

    if(placed.includes(rev) && !found.has(rev)){
      found.add(rev);
      msg.className = "msg good";
      msg.textContent = `Found: ${rev}`;
      selectedCells = [];
      playSfx("pop");
      maybeComplete(found);
      return;
    }

    msg.className = "msg neutral";
    msg.textContent = letters.length ? `Selected: ${letters}` : "";
  }

  function maybeComplete(found){
    if(found.size === placed.length && placed.length > 0){
      playSfx("ding");
      confetti();
      showBadge({
        title: "Well done!",
        sub: "You found all the words.",
        badge: "Word Search Star"
      });
    }
  }

  root.querySelector("#new").onclick = () => {
    data._found = new Set();
    build();
  };

  root.querySelector("#clear").onclick = () => {
    selectedCells = [];
    msg.className = "msg neutral";
    msg.textContent = "";
    render();
  };

  function restart(){
    data._found = new Set();
    build();
  }

  build();
  return { restart };
}

function makeEmpty(n){
  return Array.from({length:n}, () => Array.from({length:n}, () => ""));
}

function placeWord(grid, word, attempts){
  const n = grid.length;
  const dirs = [
    [0,1],[1,0],[1,1],[0,-1],[-1,0],[-1,-1],[1,-1],[-1,1]
  ];

  for(let t=0;t<attempts;t++){
    const [dr,dc] = dirs[Math.floor(Math.random()*dirs.length)];
    const r0 = Math.floor(Math.random()*n);
    const c0 = Math.floor(Math.random()*n);

    const rEnd = r0 + dr*(word.length-1);
    const cEnd = c0 + dc*(word.length-1);
    if(rEnd<0 || rEnd>=n || cEnd<0 || cEnd>=n) continue;

    // check fit
    let ok = true;
    for(let i=0;i<word.length;i++){
      const r = r0 + dr*i;
      const c = c0 + dc*i;
      const ch = grid[r][c];
      if(ch && ch !== word[i]) { ok=false; break; }
    }
    if(!ok) continue;

    // place
    for(let i=0;i<word.length;i++){
      const r = r0 + dr*i;
      const c = c0 + dc*i;
      grid[r][c] = word[i];
    }
    return true;
  }
  return false;
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
    const freq = kind === "pop" ? 520 : 740;
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
