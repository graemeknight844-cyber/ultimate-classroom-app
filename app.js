// 1. SUPABASE SECURITY & ROUTING CONNECTION
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkUserSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
  }
}
checkUserSession();

const channel = supabase.channel('room_8492');
channel.subscribe();

// DOM Element Declarations
const canvas = document.getElementById('teacherCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('penColor');
const clearBtn = document.getElementById('clearBtn');

const penToolBtn = document.getElementById('penToolBtn');
const textToolBtn = document.getElementById('textToolBtn');
const imgToolBtn = document.getElementById('imgToolBtn');

const prevPageBtn = document.querySelector('.pagination .page-btn:first-child');
const nextPageBtn = document.querySelector('.pagination .page-btn:last-child');
const pageText = document.querySelector('.page-text');

const timerDisplay = document.querySelector('.timer');
const freezeBtn = document.getElementById('freezeBtn');

// Functional State
let currentTool = 'pen';
let isDrawing = false;
let classIsFrozen = false;
let countdownInterval;
let totalSeconds = 300; 

let boardsData = []; 
let currentBoardIndex = 0;

// Setup Pen Options Safely
ctx.lineWidth = 4;
ctx.lineCap = 'round';
ctx.strokeStyle = colorPicker ? colorPicker.value : '#333333';

// ----------------------------------------------------
// 1. TOOL SELECTION MANAGEMENT
// ----------------------------------------------------
function setActiveTool(tool, activeBtn) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  activeBtn.classList.add('active');
  
  if (currentTool === 'text') {
    canvas.style.cursor = 'text';
  } else if (currentTool === 'img') {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}

if (penToolBtn) penToolBtn.addEventListener('click', () => setActiveTool('pen', penToolBtn));
if (textToolBtn) textToolBtn.addEventListener('click', () => setActiveTool('text', textToolBtn));
if (imgToolBtn) imgToolBtn.addEventListener('click', () => setActiveTool('img', imgToolBtn));

if (colorPicker) {
  colorPicker.addEventListener('input', (e) => {
    ctx.strokeStyle = e.target.value;
  });
}

// ----------------------------------------------------
// 2. RENDERING ENGINE (PEN DRAWING)
// ----------------------------------------------------
canvas.addEventListener('mousedown', (e) => {
  if (currentTool !== 'pen') return;
  isDrawing = true;
  draw(e);
});

canvas.addEventListener('mouseup', () => {
  isDrawing = false;
  ctx.beginPath();
});

canvas.addEventListener('mouseout', () => {
  isDrawing = false;
  ctx.beginPath();
});

canvas.addEventListener('mousemove', draw);

function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
    clientX: e.clientX,
    clientY: e.clientY
  };
}

function draw(e) {
  if (!isDrawing || currentTool !== 'pen') return;
  const coords = getCanvasCoordinates(e);

  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();

  channel.send({
    type: 'broadcast',
    event: 'draw',
    payload: { x: coords.x, y: coords.y, color: ctx.strokeStyle }
  });
  
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

// ----------------------------------------------------
// 3. INTERACTIVE CANVAS TOOLS (TEXT & IMAGES)
// ----------------------------------------------------
function renderAndBroadcastImage(file, x, y) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const maxDimension = 400;
      let width = img.width;
      let height = img.height;
      
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height *= maxDimension / width;
          width = maxDimension;
        } else {
          width *= maxDimension / height;
          height = maxDimension;
        }
      }

      ctx.drawImage(img, x, y, width, height);
      saveCurrentBoardState();

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
      channel.send({
        type: 'broadcast',
        event: 'image-drop',
        payload: { x, y, width, height, dataUrl: compressedDataUrl }
      });
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

window.addEventListener('paste', (e) => {
  if (currentTool !== 'img') return;
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      renderAndBroadcastImage(file, 350, 150);
    }
  }
});

canvas.addEventListener('click', (e) => {
  const coords = getCanvasCoordinates(e);

  if (currentTool === 'text') {
    if (document.querySelector('.canvas-text-input')) return;

    const wrapper = canvas.parentElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'canvas-text-input';
    
    const wrapperRect = wrapper.getBoundingClientRect();
    input.style.left = `${coords.clientX - wrapperRect.left}px`;
    input.style.top = `${coords.clientY - wrapperRect.top}px`;
    
    wrapper.appendChild(input);
    input.focus();

    function finalizeText() {
      const textVal = input.value.trim();
      if (textVal) {
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.fillStyle = ctx.strokeStyle; 
        ctx.textBaseline = 'top';
        ctx.fillText(textVal, coords.x, coords.y);
        saveCurrentBoardState();

        channel.send({
          type: 'broadcast',
          event: 'text',
          payload: { x: coords.x, y: coords.y, text: textVal, color: ctx.strokeStyle }
        });
      }
      input.remove();
    }

    input.addEventListener('blur', finalizeText);
    input.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Enter') finalizeText();
    });
  }

  if (currentTool === 'img') {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        renderAndBroadcastImage(file, coords.x, coords.y);
      }
    };
    fileInput.click();
  }
});

// ----------------------------------------------------
// 4. MULTI-BOARD SLIDE PRESENTATION LOGIC
// ----------------------------------------------------
function updatePaginationUI() {
  if (pageText) {
    pageText.textContent = `Board ${currentBoardIndex + 1} of ${Math.max(boardsData.length, 1)}`;
  }
}

function saveCurrentBoardState() {
  boardsData[currentBoardIndex] = canvas.toDataURL();
}

function loadBoardState(index) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updatePaginationUI();

  if (boardsData[index]) {
    const img = new Image();
    img.src = boardsData[index];
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
    };
  }
}

if (nextPageBtn) {
  nextPageBtn.addEventListener('click', () => {
    saveCurrentBoardState();
    currentBoardIndex++;
    
    if (currentBoardIndex >= boardsData.length) {
      boardsData.push(''); 
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      updatePaginationUI();
    } else {
      loadBoardState(currentBoardIndex);
    }
    channel.send({ type: 'broadcast', event: 'clear' });
  });
}

if (prevPageBtn) {
  prevPageBtn.addEventListener('click', () => {
    if (currentBoardIndex === 0) return; 
    saveCurrentBoardState();
    currentBoardIndex--;
    loadBoardState(currentBoardIndex);
    channel.send({ type: 'broadcast', event: 'clear' });
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    channel.send({ type: 'broadcast', event: 'clear' });
  });
}

// Initialization Sequence
boardsData[0] = canvas.toDataURL();
updatePaginationUI();

// ----------------------------------------------------
// 5. UTILITY CONTROLS (LIVE TIMER & LOCKOUT FREEZE)
// ----------------------------------------------------
function formatTimerDisplay(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `Timer: ${mins}:${secs}`;
}

if (timerDisplay) {
  timerDisplay.addEventListener('click', () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    } else {
      countdownInterval = setInterval(() => {
        if (totalSeconds > 0) {
          totalSeconds--;
          timerDisplay.textContent = formatTimerDisplay(totalSeconds);
          channel.send({ type: 'broadcast', event: 'timer-tick', payload: { seconds: totalSeconds } });
        } else {
          clearInterval(countdownInterval);
          countdownInterval = null;
          alert("Time is up!");
        }
      }, 1000);
    }
  });
}

if (freezeBtn) {
  freezeBtn.addEventListener('click', () => {
    classIsFrozen = !classIsFrozen;
    if (classIsFrozen) {
      freezeBtn.textContent = "Unfreeze Class";
      freezeBtn.style.backgroundColor = "#ff9999";
    } else {
      freezeBtn.textContent = "Freeze Class";
      freezeBtn.style.backgroundColor = "#ffcccc";
    }
    channel.send({ type: 'broadcast', event: 'freeze-state', payload: { isFrozen: classIsFrozen } });
  });
}

// ----------------------------------------------------
// 6. PDF GENERATION ENGINE
// ----------------------------------------------------
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', async () => {
    saveCurrentBoardState();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1100, 520] });
    let pagesAdded = 0;

    for (let i = 0; i < boardsData.length; i++) {
      const boardSnapshot = boardsData[i];
      if (boardSnapshot) {
        if (pagesAdded > 0) pdf.addPage([1100, 520], 'landscape');
        pdf.addImage(boardSnapshot, 'PNG', 0, 0, 1100, 520);
        pagesAdded++;
      }
    }
    if (pagesAdded === 0) pdf.addImage(canvas.toDataURL(), 'PNG', 0, 0, 1100, 520);
    pdf.save('whiteboard-lesson-session.pdf');
  });
}