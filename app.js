// 1. SUPABASE SECURITY & CONNECTION
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";

// We changed the name to 'supabaseClient' to stop the browser from crashing!
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function checkUserSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
  }
}
checkUserSession();

// Setup the broadcasting radio channel on the teacher's side
const channel = supabaseClient ? supabaseClient.channel('room_8492') : null;
if (channel) {
  channel
    .on('broadcast', { event: 'submit-answer' }, ({ payload }) => {
      // CATCHES LIVE STUDENT SHOW-ME BOARDS
      handleIncomingStudentAnswer(payload);
    })
    .subscribe();
}

// DOM Element Declarations
const canvas = document.getElementById('teacherCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const colorPicker = document.getElementById('penColor');
const clearBtn = document.getElementById('clearBtn');

// Toolbar buttons
const penToolBtn = document.getElementById('penToolBtn');
const textToolBtn = document.getElementById('textToolBtn');
const imgToolBtn = document.getElementById('imgToolBtn');

// Pagination elements
const prevPageBtn = document.querySelector('.pagination .page-btn:first-child');
const nextPageBtn = document.querySelector('.pagination .page-btn:last-child');
const pageText = document.querySelector('.page-text');

// Utility Row Elements (Timer & Freeze Class)
const timerDisplay = document.querySelector('.timer');
const freezeBtn = document.getElementById('freezeBtn');
const signOutBtn = document.querySelector('.sign-out'); 

// Application Functional State Variables
let currentTool = 'pen'; 
let isDrawing = false;
let classIsFrozen = false;

// Timer State Variables
let countdownInterval;
let totalSeconds = 300; 

// Slide Deck System Variables
let boardsData = []; 
let currentBoardIndex = 0;

// Context Parameter Tuning
if (ctx && colorPicker) {
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = colorPicker.value;
}

// ==========================================
// NEW: SHOW-ME BOARD REAL-TIME DISPLAY SYSTEM
// ==========================================
function handleIncomingStudentAnswer(studentData) {
  // 1. Locate the container row running along the bottom right under the big board
  // We targets the parent box holding your 'See All' button
  const seeAllBtn = document.querySelector('button[style*="purple"], button', '#seeAllBtn');
  const targetRow = seeAllBtn ? seeAllBtn.parentElement : null;
  
  if (!targetRow) return;

  // Make sure the target row can neatly align boxes horizontally
  targetRow.style.display = "flex";
  targetRow.style.gap = "15px";
  targetRow.style.alignItems = "center";
  targetRow.style.flexWrap = "wrap";

  // Normalize name to use as a valid HTML element ID
  const elementId = `card-${studentData.name.replace(/\s+/g, '-')}`;
  let studentCard = document.getElementById(elementId);

  if (!studentCard) {
    // 2. Create the white box skeleton container
    studentCard = document.createElement('div');
    studentCard.id = elementId;
    
    // Style matches your layout requirements perfectly
    studentCard.style.width = "140px";
    studentCard.style.height = "100px";
    studentCard.style.backgroundColor = "#ffffff";
    studentCard.style.border = "2px solid #dcdce6";
    studentCard.style.borderRadius = "8px";
    studentCard.style.position = "relative";
    studentCard.style.display = "flex";
    studentCard.style.flexDirection = "column";
    studentCard.style.alignItems = "center";
    studentCard.style.justifyContent = "center";
    studentCard.style.overflow = "hidden";
    studentCard.style.cursor = "pointer";
    studentCard.style.boxShadow = "0 4px 8px rgba(0,0,0,0.03)";
    studentCard.style.transition = "transform 0.2s, border-color 0.2s";

    // Hover effect
    studentCard.onmouseenter = () => { studentCard.style.borderColor = "#4a4a68"; studentCard.style.transform = "scale(1.03)"; };
    studentCard.onmouseleave = () => { studentCard.style.borderColor = "#dcdce6"; studentCard.style.transform = "scale(1)"; };

    // 3. Create the inner canvas snapshot display image
    const previewImg = document.createElement('img');
    previewImg.className = "student-thumb-src";
    previewImg.style.width = "100%";
    previewImg.style.height = "80%";
    previewImg.style.objectFit = "contain";
    previewImg.style.backgroundImage = "radial-gradient(#f0f0f5 1px, transparent 1px)";
    previewImg.style.backgroundSize = "10px 10px";

    // 4. Create the stylized label overlay text for student name
    const nameLabel = document.createElement('div');
    nameLabel.textContent = studentData.name;
    nameLabel.style.width = "100%";
    nameLabel.style.backgroundColor = "#4a4a68";
    nameLabel.style.color = "#ffffff";
    nameLabel.style.fontSize = "11px";
    nameLabel.style.fontWeight = "bold";
    nameLabel.style.textAlign = "center";
    nameLabel.style.padding = "3px 0";

    // Assemble components
    studentCard.appendChild(previewImg);
    studentCard.appendChild(nameLabel);
    targetRow.appendChild(studentCard);

    // 5. INTERACTION: Clicking a kid's card projects their answer full-size onto your board!
    studentCard.addEventListener('click', () => {
      if (!ctx || !canvas) return;
      const zoomImg = new Image();
      zoomImg.onload = () => {
        saveCurrentBoardState(); // Save whatever you were doing first
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(zoomImg, 0, 0, canvas.width, canvas.height);
      };
      zoomImg.src = studentData.boardImage;
    });
  }

  // 6. Direct data injection ensures fast real-time thumbnail frames
  const liveImg = studentCard.querySelector('.student-thumb-src');
  if (liveImg) {
    liveImg.src = studentData.boardImage;
  }
}

// 1. TOOL SELECTION MANAGEMENT
function setActiveTool(tool, activeBtn) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  activeBtn.classList.add('active');
  if (!canvas) return;
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

if (colorPicker && ctx) {
  colorPicker.addEventListener('input', (e) => {
    ctx.strokeStyle = e.target.value;
  });
}

// 2. RENDERING ENGINE (PEN DRAWING)
if (canvas && ctx) {
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool !== 'pen') return;
    isDrawing = true;
    draw(e);
  });
  canvas.addEventListener('mouseup', () => { isDrawing = false; ctx.beginPath(); });
  canvas.addEventListener('mouseout', () => { isDrawing = false; ctx.beginPath(); });
  canvas.addEventListener('mousemove', draw);
}

function getCanvasCoordinates(e) {
  if (!canvas) return { x: 0, y: 0, clientX: 0, clientY: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
    clientX: e.clientX,
    clientY: e.clientY
  };
}

function draw(e) {
  if (!isDrawing || currentTool !== 'pen' || !ctx || !channel) return;
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

// 3. INTERACTIVE CANVAS TOOLS (TEXT & IMAGES)
function renderAndBroadcastImage(file, x, y) {
  if (!ctx || !canvas || !channel) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const maxDimension = 400;
      let width = img.width;
      let height = img.height;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) { height *= maxDimension / width; width = maxDimension; }
        else { width *= maxDimension / height; height = maxDimension; }
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

if (canvas) {
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
        if (textVal && ctx && channel) {
          ctx.font = 'bold 20px "Segoe UI", sans-serif';
          ctx.fillStyle = document.getElementById('penColor').value; 
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
      input.addEventListener('keydown', (keyEvent) => { if (keyEvent.key === 'Enter') finalizeText(); });
    }
    if (currentTool === 'img') {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (file) renderAndBroadcastImage(file, coords.x, coords.y);
      };
      fileInput.click();
    }
  });
}

// 4. MULTI-BOARD SLIDE PRESENTATION LOGIC
function updatePaginationUI() {
  if (pageText) pageText.textContent = `Board ${currentBoardIndex + 1} of ${Math.max(boardsData.length, 1)}`;
}
function saveCurrentBoardState() { if (canvas) boardsData[currentBoardIndex] = canvas.toDataURL(); }
function loadBoardState(index) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updatePaginationUI();
  if (boardsData[index]) {
    const img = new Image();
    img.src = boardsData[index];
    img.onload = () => { ctx.drawImage(img, 0, 0); };
  }
}

if (nextPageBtn) {
  nextPageBtn.addEventListener('click', () => {
    saveCurrentBoardState();
    currentBoardIndex++;
    if (currentBoardIndex >= boardsData.length) {
      boardsData.push(''); 
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      updatePaginationUI();
    } else {
      loadBoardState(currentBoardIndex);
    }
    if (channel) channel.send({ type: 'broadcast', event: 'clear' });
  });
}

if (prevPageBtn) {
  prevPageBtn.addEventListener('click', () => {
    if (currentBoardIndex === 0) return; 
    saveCurrentBoardState();
    currentBoardIndex--;
    loadBoardState(currentBoardIndex);
    if (channel) channel.send({ type: 'broadcast', event: 'clear' });
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (channel) channel.send({ type: 'broadcast', event: 'clear' });
  });
}
if (canvas) boardsData[0] = canvas.toDataURL();
updatePaginationUI();

// 5. UTILITY CONTROLS (LIVE TIMER, FREEZE & SIGN OUT)
function formatTimerDisplay(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `Timer: ${mins}:${secs}`;
}

if (timerDisplay) {
  timerDisplay.style.cursor = "pointer";
  timerDisplay.style.color = "#ff4d4d"; 
  timerDisplay.style.transition = "color 0.3s ease";

  timerDisplay.addEventListener('click', () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      timerDisplay.style.color = "#ff4d4d"; 
    } else {
      timerDisplay.style.color = "#2ecc71"; 
      countdownInterval = setInterval(() => {
        if (totalSeconds > 0) {
          totalSeconds--;
          timerDisplay.textContent = formatTimerDisplay(totalSeconds);
          if (channel) channel.send({ type: 'broadcast', event: 'timer-tick', payload: { seconds: totalSeconds } });
        } else {
          clearInterval(countdownInterval);
          countdownInterval = null;
          timerDisplay.style.color = "#ff4d4d"; 
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
    if (channel) channel.send({ type: 'broadcast', event: 'freeze-state', payload: { isFrozen: classIsFrozen } });
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });
}

// 6. PDF GENERATION ENGINE
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
        if (pagesAdded > 0) { pdf.addPage([1100, 520], 'landscape'); }
        pdf.addImage(boardSnapshot, 'PNG', 0, 0, 1100, 520);
        pagesAdded++;
      }
    }
    if (pagesAdded === 0 && canvas) { pdf.addImage(canvas.toDataURL(), 'PNG', 0, 0, 1100, 520); }
    pdf.save('whiteboard-lesson-session.pdf');
  });
}