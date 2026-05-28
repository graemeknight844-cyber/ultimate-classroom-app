// ============================================================================
// 1. SUPABASE SECURITY & CONNECTION
// ============================================================================
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

// ============================================================================
// LIVE UPDATED: SHOW-ME BOARD REAL-TIME DISPLAY SYSTEM
// ============================================================================
function handleIncomingStudentAnswer(studentData) {
  // Normalize student name to use as a unique ID for the image/card
  const safeNameId = studentData.name.replace(/\s+/g, '-');
  
  // 1. Look to see if this student already has an active image element somewhere
  let liveImg = document.getElementById(`thumb-img-${safeNameId}`);
  let nameLabel = document.getElementById(`thumb-name-${safeNameId}`);

  if (!liveImg) {
    // 2. Find all empty slots, explicitly starting with the container directly next to "See All"
    const seeAllBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('See All'));
    let openSlots = [];

    if (seeAllBtn && seeAllBtn.parentElement) {
      // Collect the adjacent sibling boxes right next to the button first
      openSlots = Array.from(seeAllBtn.parentElement.querySelectorAll('div'))
                       .filter(box => box.children.length === 0 && box !== seeAllBtn);
    }

    // Fallback: collect any other empty dashboard boxes if the immediate layout is full
    if (openSlots.length === 0) {
      openSlots = Array.from(document.querySelectorAll('.classroom-container div, .see-all-container + div > div'))
                       .filter(box => box.children.length === 0 && box.offsetWidth > 50);
    }

    const bestSlot = openSlots.length > 0 ? openSlots[0] : null;

    if (bestSlot) {
      // Set relative positioning on the parent so the banner can pin perfectly to the bottom edge
      bestSlot.style.position = "relative";
      bestSlot.style.display = "block";
      bestSlot.style.overflow = "hidden"; // Clips the banner inside the box boundaries
      bestSlot.style.cursor = "pointer";
      bestSlot.style.border = "2px solid #dcdce6";
      bestSlot.style.backgroundColor = "#ffffff";

      // 3. Create the inner thumbnail image
      liveImg = document.createElement('img');
      liveImg.id = `thumb-img-${safeNameId}`;
      liveImg.className = "student-thumb-src";
      liveImg.style.width = "100%";
      liveImg.style.height = "100%";
      liveImg.style.objectFit = "contain";
      liveImg.style.display = "block";

      // 4. RESTORED: Classic dark grey banner strip with white text
      nameLabel = document.createElement('div');
      nameLabel.id = `thumb-name-${safeNameId}`;
      nameLabel.textContent = studentData.name;
      nameLabel.style.width = "100%";
      nameLabel.style.backgroundColor = "#4c4c5e"; // Classic slate/grey background banner
      nameLabel.style.color = "#ffffff"; // Crisp white writing
      nameLabel.style.fontSize = "12px";
      nameLabel.style.fontWeight = "bold";
      nameLabel.style.textAlign = "center";
      nameLabel.style.padding = "4px 0";
      nameLabel.style.position = "absolute";
      nameLabel.style.bottom = "0"; // Locked perfectly to the floor edge of the thumbnail
      nameLabel.style.left = "0";
      nameLabel.style.boxSizing = "border-box";
      nameLabel.style.zIndex = "10"; // Ensures it sits safely on top of the image canvas layer

      // Assemble components inside the whiteboard box card layout
      bestSlot.appendChild(liveImg);
      bestSlot.appendChild(nameLabel);

      // CLICK PROJECTION ENGINE: Extracts the current multi-stroke canvas data URL
      bestSlot.addEventListener('click', () => {
        if (!ctx || !canvas) return;
        
        const currentThumb = bestSlot.querySelector('.student-thumb-src');
        if (!currentThumb || !currentThumb.src) return;

        const zoomImg = new Image();
        zoomImg.onload = () => {
          saveCurrentBoardState();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(zoomImg, 0, 0, canvas.width, canvas.height);
        };
        zoomImg.src = currentThumb.src;
      });
    } else {
      // Ultimate fallback card generation if grid divs are entirely missing
      console.warn("No pre-existing empty slots found. Appending dynamically next to See All.");
      if (seeAllBtn && seeAllBtn.parentElement) {
        const fallbackCard = document.createElement('div');
        fallbackCard.style.width = "140px";
        fallbackCard.style.height = "100px";
        fallbackCard.style.backgroundColor = "#ffffff";
        fallbackCard.style.border = "2px solid #dcdce6";
        fallbackCard.style.borderRadius = "8px";
        fallbackCard.style.cursor = "pointer";
        fallbackCard.style.position = "relative";
        fallbackCard.style.overflow = "hidden";
        
        const fbImg = document.createElement('img');
        fbImg.id = `thumb-img-${safeNameId}`;
        fbImg.className = "student-thumb-src";
        fbImg.style.width = "100%";
        fbImg.style.height = "100%";
        fbImg.style.objectFit = "contain";
        fallbackCard.appendChild(fbImg);
        
        const fbLabel = document.createElement('div');
        fbLabel.id = `thumb-name-${safeNameId}`;
        fbLabel.textContent = studentData.name;
        fbLabel.style.width = "100%";
        fbLabel.style.backgroundColor = "#4c4c5e";
        fbLabel.style.color = "#ffffff";
        fbLabel.style.fontSize = "12px";
        fbLabel.style.fontWeight = "bold";
        fbLabel.style.textAlign = "center";
        fbLabel.style.padding = "4px 0";
        fbLabel.style.position = "absolute";
        fbLabel.style.bottom = "0";
        fbLabel.style.left = "0";
        fallbackCard.appendChild(fbLabel);
        
        fallbackCard.addEventListener('click', () => {
          if (!ctx || !canvas) return;
          const currentThumb = fallbackCard.querySelector('.student-thumb-src');
          if (!currentThumb || !currentThumb.src) return;

          const zoomImg = new Image();
          zoomImg.onload = () => {
            saveCurrentBoardState();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(zoomImg, 0, 0, canvas.width, canvas.height);
          };
          zoomImg.src = currentThumb.src;
        });

        seeAllBtn.parentElement.appendChild(fallbackCard);
        liveImg = fbImg;
      }
    }
  }

  // 5. Update data source image string frame instantly with every single incoming stroke
  if (liveImg) {
    liveImg.src = studentData.boardImage;
  }
}

// ============================================================================
// 2. TOOL SELECTION MANAGEMENT
// ============================================================================
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

// ============================================================================
// 3. RENDERING ENGINE (PEN DRAWING)
// ============================================================================
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

// Vector Drawing Engine
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

// ============================================================================
// 4. INTERACTIVE CANVAS TOOLS (TEXT & IMAGES)
// ============================================================================
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

// ============================================================================
// 5. MULTI-BOARD SLIDE PRESENTATION LOGIC
// ============================================================================
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

// ============================================================================
// 6. UTILITY CONTROLS (LIVE TIMER, FREEZE & SIGN OUT)
// ============================================================================
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

// ============================================================================
// 7. PDF GENERATION ENGINE
// ============================================================================
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