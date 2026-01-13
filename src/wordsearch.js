export function mount(root, data){
  const size = data.size ?? 12;
  const words = (data.words ?? []).map(w => w.toUpperCase());
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  let grid = makeEmpty(size);
  let placed = [];

  root.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
      <button id="new">New Grid</button>
      <button id="clear">Clear Selection</button>
      <span id="pill" style="padding:8px 12px;border-radius:999px;background:rgba(255,255,255,0.08);font-weight:800;color:#b8c0d9;"></span>
    </div>

    <div style="display:grid;grid-template-columns:1fr;gap:14px;">
      <div id="gridWrap"></div>
      <div>
        <div style="font-weight:900;margin-bottom:8px;">Find these words:</div>
        <div id="wordList" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
        <div id="msg" style="margin-top:10px;font-weight:900;color:#b8c0d9;"></div>
      </div>
    </div>
  `;

  const pill = root.querySelector("#pill");
  const msg = root.querySelector("#msg");
  const gridWrap = root.querySelector("#gridWrap");
  const wordList = root.querySelector("#wordList");

  let selectedCells = [];

  function build(){
    grid = makeEmpty(size);
    placed = [];
    selectedCells = [];
    msg.textContent = "";

    // place words (horizontal/vertical/diagonal + backwards)
    for(const w of words){
      const ok = placeWord(grid, w, 200);
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
    // pill
    const found = data._found ?? new Set();
    pill.textContent = `${found.size} / ${placed.length} found`;

    // word list
    wordList.innerHTML = "";
    for(const w of placed){
      const tag = document.createElement("span");
      tag.textContent = w;
      tag.style.padding = "6px 10px";
      tag.style.borderRadius = "999px";
      tag.style.fontWeight = "900";
      tag.style.fontSize = "12px";
      tag.style.border = "1px solid rgba(255,255,255,0.14)";
      tag.style.background = found.has(w) ? "rgba(34,197,94,0.18)" : "rgba(122,162,255,0.18)";
      wordList.appendChild(tag);
    }

    // grid UI
    gridWrap.innerHTML = "";
    const table = document.createElement("div");
    table.style.display = "grid";
    table.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    table.style.gap = "6px";

    for(let r=0;r<size;r++){
      for(let c=0;c<size;c++){
        const cell = document.createElement("button");
        cell.textContent = grid[r][c];
        cell.style.padding = "10px 0";
        cell.style.borderRadius = "10px";
        cell.style.fontWeight = "900";
        cell.style.background = "rgba(255,255,255,0.08)";
        cell.style.border = "1px solid rgba(255,255,255,0.12)";
        cell.style.cursor = "pointer";

        const key = `${r},${c}`;
        if(selectedCells.some(x => x === key)){
          cell.style.outline = "3px solid rgba(122,162,255,0.85)";
        }

        cell.onclick = () => {
          // Toggle selection
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
      msg.textContent = `Found: ${letters}`;
      selectedCells = [];
    }else if(placed.includes(rev) && !found.has(rev)){
      found.add(rev);
      msg.textContent = `Found: ${rev}`;
      selectedCells = [];
    }else{
      msg.textContent = letters.length ? `Selected: ${letters}` : "";
    }
  }

  root.querySelector("#new").onclick = () => {
    data._found = new Set();
    build();
  };

  root.querySelector("#clear").onclick = () => {
    selectedCells = [];
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
