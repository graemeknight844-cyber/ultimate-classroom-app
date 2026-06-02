// ============================================================================
// 1. SUPABASE SECURITY & CONNECTION (Runs immediately)
// ============================================================================
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function checkUserSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "index.html"; }
}
checkUserSession();

const channel = supabaseClient ? supabaseClient.channel('room_8492') : null;

// ============================================================================
// APPLICATION GLOBAL STATE VARIABLES
// ============================================================================
let currentTool = 'pen'; 
let isDrawing = false;
let classIsFrozen = false;
let countdownInterval;
let totalSeconds = 300; 

let boardsData = []; 
let currentBoardIndex = 0;
let studentSubmissionsHistory = [{}]; 
let canvasHistory = []; 

// Global DOM references to be filled once DOM is ready
let canvas, ctx, colorPicker, clearBtn, undoBtn;
let penToolBtn, textToolBtn, imgToolBtn, rubberToolBtn;
let sizeThicknessSlider, textSizeSlider;
let prevPageBtn, nextPageBtn, pageText;
let timerDisplay, freezeBtn, signOutBtn;

// ============================================================================
// INITIALIZATION ENGINE (Fires once HTML is fully loaded)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Bind DOM Elements
  canvas = document.getElementById('teacherCanvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  colorPicker = document.getElementById('penColor') || { value: '#333333' };
  clearBtn = document.getElementById('clearBtn');
  undoBtn = document.getElementById('undoBtn'); 

  penToolBtn = document.getElementById('penToolBtn');
  textToolBtn = document.getElementById('textToolBtn');
  imgToolBtn = document.getElementById('imgToolBtn');
  rubberToolBtn = document.getElementById('rubberToolBtn');

  sizeThicknessSlider = document.getElementById('penThickness') || { value: 4 };
  textSizeSlider = document.getElementById('textSizeSelector') || { value: 24 };

  prevPageBtn = document.querySelector('.pagination .page-btn:first-child');
  nextPageBtn = document.querySelector('.pagination .page-btn:last-child');
  pageText = document.querySelector('.page-text');

  timerDisplay = document.querySelector('.timer');
  freezeBtn = document.getElementById('freezeBtn');
  signOutBtn = document.querySelector('.sign-out'); 

  // Initialize Canvas Properties
  if (ctx) {
    ctx.lineWidth = sizeThicknessSlider.value;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colorPicker.value;
    
    // Establish Baseline History Snapshot
    boardsData[0] = canvas.toDataURL();
    canvasHistory.push(boardsData[0]); 
  }
  
  updatePaginationUI();
  setupEventListeners();

  // Connect Realtime Broadcasts
  if (channel) {
    channel
      .on('broadcast', { event: 'submit-answer' }, ({ payload }) => { handleIncomingStudentAnswer(payload); })
      .subscribe();
  }
});

// History Engine Helper
function pushToHistory() {
  if (!canvas) return;
  canvasHistory.push(canvas.toDataURL());
  if (canvasHistory.length > 30) canvasHistory.shift(); 
}

// ============================================================================
// TOOL CONTROL SYSTEM
// ============================================================================
function setActiveTool(tool, activeBtn) {
  bakeFloatingObjects(); 
  currentTool = tool;
  
  document.querySelectorAll('.tool-btn').forEach(btn => {
    if (btn.id !== 'undoBtn') btn.classList.remove('active');
  });
  if (activeBtn && activeBtn.id !== 'undoBtn') activeBtn.classList.add('active');
  
  if (!canvas || !ctx) return;
  
  if (currentTool === 'rubber') {
    ctx.globalCompositeOperation = 'destination-out';
    canvas.style.cursor = 'cell';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    if (currentTool === 'text') { canvas.style.cursor = 'text'; }
    else if (currentTool === 'img') { canvas.style.cursor = 'pointer'; }
    else { canvas.style.cursor = 'crosshair'; }
  }
}

// ============================================================================
// EVENT LISTENERS WIRING SETUP
// ============================================================================
function setupEventListeners() {
  if (penToolBtn) penToolBtn.addEventListener('click', () => setActiveTool('pen', penToolBtn));
  if (textToolBtn) textToolBtn.addEventListener('click', () => setActiveTool('text', textToolBtn));
  if (imgToolBtn) imgToolBtn.addEventListener('click', () => setActiveTool('img', imgToolBtn));
  if (rubberToolBtn) rubberToolBtn.addEventListener('click', () => setActiveTool('rubber', rubberToolBtn));

  if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
      if (currentTool === 'rubber') setActiveTool('pen', penToolBtn);
      if (ctx) ctx.strokeStyle = e.target.value;
    });
  }

  // Drawing Engine Events
  if (canvas && ctx) {
    canvas.addEventListener('mousedown', (e) => {
      if (currentTool !== 'pen' && currentTool !== 'rubber') return;
      isDrawing = true;
      draw(e);
    });
    canvas.addEventListener('mouseup', () => { 
      if (isDrawing) { isDrawing = false; ctx.beginPath(); pushToHistory(); }
    });
    canvas.addEventListener('mouseout', () => { 
      if (isDrawing) { isDrawing = false; ctx.beginPath(); pushToHistory(); }
    });
    canvas.addEventListener('mousemove', draw);
    
    // Canvas Click Interface Gateway (Text & Image Placement)
    canvas.addEventListener('click', handleCanvasClick);
  }

  // Undo Activation Wire
  if (undoBtn) {
    undoBtn.addEventListener('click', handleUndoAction);
  }

  // Pagination Action Triggers
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      saveCurrentBoardState();
      currentBoardIndex++;
      if (currentBoardIndex >= boardsData.length) {
        boardsData.push(''); 
        studentSubmissionsHistory.push({}); 
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvasHistory = [canvas.toDataURL()];
        }
        clearStudentThumbnailsDOM();
        updatePaginationUI();
        if (channel) channel.send({ type: 'broadcast', event: 'switch-board', payload: { index: currentBoardIndex } });
      } else {
        loadBoardState(currentBoardIndex);
      }
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentBoardIndex === 0) return; 
      saveCurrentBoardState();
      currentBoardIndex--;
      loadBoardState(currentBoardIndex);
    });
  }

  // Board Clearing Trigger
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (canvas) {
        const activeObjects = canvas.parentElement.querySelectorAll('.floating-canvas-object');
        activeObjects.forEach(o => o.remove());
      }
      if (ctx && canvas) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pushToHistory(); 
      }
      if (channel) channel.send({ type: 'broadcast', event: 'clear' });
    });
  }

  // Timer Click Action Wire
  if (timerDisplay) {
    timerDisplay.style.cursor = "pointer";
    timerDisplay.addEventListener('click', () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      } else {
        countdownInterval = setInterval(() => {
          if (totalSeconds > 0) {
            totalSeconds--;
            const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const secs = (totalSeconds % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `Timer: ${mins}:${secs}`;
            if (channel) channel.send({ type: 'broadcast', event: 'timer-tick', payload: { seconds: totalSeconds } });
          } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            alert("Time is up!");
          }
        }, 1000);
      }
    });
  }

  // Class Freeze Control Wire
  if (freezeBtn) {
    freezeBtn.addEventListener('click', () => {
      classIsFrozen = !classIsFrozen;
      freezeBtn.textContent = classIsFrozen ? "Unfreeze Class" : "Freeze Class";
      freezeBtn.style.backgroundColor = classIsFrozen ? "#ff9999" : "#ffcccc";
      if (channel) channel.send({ type: 'broadcast', event: 'freeze-state', payload: { isFrozen: classIsFrozen } });
    });
  }

  // Global Session Sign-Out Action Wire
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  }
}

// ============================================================================
// DRAWING ENGINE MECHANICS
// ============================================================================
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
  if (!isDrawing || (currentTool !== 'pen' && currentTool !== 'rubber') || !ctx) return;
  const coords = getCanvasCoordinates(e);
  
  ctx.lineWidth = sizeThicknessSlider.value || 4;
  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

// ============================================================================
// CANVAS MOUSE INTERACTION ROUTER (TEXT & IMAGE POPPERS)
// ============================================================================
function handleCanvasClick(e) {
  const wrapper = canvas.parentElement;
  const wrapperRect = wrapper.getBoundingClientRect();
  const clickX = e.clientX - wrapperRect.left;
  const clickY = e.clientY - wrapperRect.top;

  if (currentTool === 'text') {
    const userSelectedSize = parseInt(textSizeSlider.value) || 24;
    
    const textWrapper = document.createElement('div');
    textWrapper.className = 'floating-canvas-object text-type-wrapper';
    textWrapper.style.cssText = `position: absolute; left: ${clickX}px; top: ${clickY - (userSelectedSize / 2)}px; border: 2px dashed #4a4a68; cursor: move; background: transparent; padding: 4px; display: inline-block; z-index: 1000;`;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = "Type here...";
    input.style.cssText = `font-size: ${userSelectedSize}px; font-weight: bold; font-family: "Segoe UI", sans-serif; border: none; background: transparent; color: ${colorPicker.value}; outline: none; min-width: 120px; padding: 0; margin: 0; line-height: 1;`;
    
    const autoGrowWidth = () => {
      const textLength = input.value.length || input.placeholder.length;
      const dynamicCalculatedWidth = textLength * (userSelectedSize * 0.62) + 20;
      input.style.width = `${Math.max(120, dynamicCalculatedWidth)}px`;
    };

    autoGrowWidth();
    input.addEventListener('input', autoGrowWidth);
    
    textWrapper.appendChild(input);
    wrapper.appendChild(textWrapper);
    
    input.focus();
    input.select();

    makeElementDraggableAndResizable(textWrapper, false);

    input.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') { setActiveTool('pen', penToolBtn); }
    });
  }

  if (currentTool === 'img') {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { spawnMovableImage(ev.target.result, clickX, clickY); };
        reader.readAsDataURL(file);
      }
    };
    fileInput.click();
    setActiveTool('pen', penToolBtn);
  }
}

// ============================================================================
// DRAG & RESIZE VECTOR ENGINE
// ============================================================================
function makeElementDraggableAndResizable(el, allowResize) {
  let isDragging = false;
  let isResizing = false;
  let startX, startY, startLeft, startTop, startWidth, startHeight;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = el.offsetLeft;
    startTop = el.offsetTop;
    e.preventDefault();
  });

  if (allowResize) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.style.cssText = 'width:14px; height:14px; background:#4a4a68; position:absolute; bottom:0; right:0; cursor:se-resize; border-radius:50%; border:2px solid white;';
    el.appendChild(handle);

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = el.offsetWidth;
      startHeight = el.offsetHeight;
      e.stopPropagation();
      e.preventDefault();
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = `${startLeft + dx}px`;
      el.style.top = `${startTop + dy}px`;
    }
    if (isResizing) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.width = `${Math.max(50, startWidth + dx)}px`;
      el.style.height = `${Math.max(30, startHeight + dy)}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
  });
}

// BAKING ENGINE: Flattens movable DOM items onto the layout
function bakeFloatingObjects() {
  if (!canvas || !ctx) return;
  const wrapper = canvas.parentElement;
  const floatingObjects = wrapper.querySelectorAll('.floating-canvas-object');
  
  if (floatingObjects.length === 0) return;

  const scaleX = canvas.width / canvas.getBoundingClientRect().width;
  const scaleY = canvas.height / canvas.getBoundingClientRect().height;

  floatingObjects.forEach(obj => {
    const rect = obj.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const x = (rect.left - canvasRect.left) * scaleX;
    const y = (rect.top - canvasRect.top) * scaleY;
    const w = rect.width * scaleX;
    const h = rect.height * scaleY;

    ctx.globalCompositeOperation = 'source-over';

    if (obj.classList.contains('text-type-wrapper')) {
      const inputEl = obj.querySelector('input');
      const textVal = inputEl ? inputEl.value.trim() : '';
      if (textVal) {
        const localFontSize = parseInt(window.getComputedStyle(inputEl).fontSize);
        const dynamicFontSize = localFontSize * scaleY;
        ctx.font = `bold ${dynamicFontSize}px "Segoe UI", sans-serif`;
        ctx.fillStyle = colorPicker.value || '#000000';
        ctx.textBaseline = 'top';
        ctx.fillText(textVal, x, y + (4 * scaleY));
      }
    } else if (obj.classList.contains('image-type-wrapper')) {
      const imgEl = obj.querySelector('img');
      if (imgEl && imgEl.src) {
        ctx.drawImage(imgEl, x, y, w, h);
      }
    }
    obj.remove();
  });

  pushToHistory(); 
}

function spawnMovableImage(srcDataUrl, initialX, initialY) {
  const wrapper = canvas.parentElement;
  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'floating-canvas-object image-type-wrapper';
  imgWrapper.style.cssText = `position: absolute; left: ${initialX}px; top: ${initialY}px; width: 220px; height: 150px; border: 2px dashed #4a4a68; cursor: move; padding: 2px; background: rgba(255,255,255,0.4);`;

  const img = document.createElement('img');
  img.src = srcDataUrl;
  img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; pointer-events: none;';
  
  imgWrapper.appendChild(img);
  wrapper.appendChild(imgWrapper);
  makeElementDraggableAndResizable(imgWrapper, true);
}

window.addEventListener('paste', (e) => {
  if (currentTool !== 'img') return;
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => { spawnMovableImage(event.target.result, 150, 100); };
      reader.readAsDataURL(file);
    }
  }
});

// ============================================================================
// UNDO ACTION ENGINE
// ============================================================================
function handleUndoAction() {
  if (canvas) {
    const activeFloatingObjects = canvas.parentElement.querySelectorAll('.floating-canvas-object');
    if (activeFloatingObjects.length > 0) {
      activeFloatingObjects[activeFloatingObjects.length - 1].remove();
      return;
    }
  }

  if (canvasHistory.length > 1) {
    canvasHistory.pop(); 
    const previousStoredState = canvasHistory[canvasHistory.length - 1];
    
    const img = new Image();
    img.src = previousStoredState;
    img.onload = () => {
      if (!ctx || !canvas) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      boardsData[currentBoardIndex] = canvas.toDataURL(); 
    };
  }
}

// ============================================================================
// LIVE STUDENT BOARD DISTRIBUTION SYSTEM
// ============================================================================
function handleIncomingStudentAnswer(studentData) {
  if (!studentSubmissionsHistory[currentBoardIndex]) {
    studentSubmissionsHistory[currentBoardIndex] = {};
  }
  studentSubmissionsHistory[currentBoardIndex][studentData.name] = studentData.boardImage;
  renderStudentThumbnailDOM(studentData);
}

function renderStudentThumbnailDOM(studentData) {
  const safeNameId = studentData.name.replace(/\s+/g, '-');
  let liveImg = document.getElementById(`thumb-img-${safeNameId}`);

  if (!liveImg) {
    const slots = Array.from(document.querySelectorAll('.mini-board'));
    const emptySlot = slots.find(slot => slot.children.length === 0);
    
    let targetTarget = emptySlot;
    if (!targetTarget) {
      targetTarget = document.createElement('div');
      targetTarget.className = 'mini-board';
      document.querySelector('.pupil-boards').appendChild(targetTarget);
    }

    targetTarget.style.position = "relative";
    targetTarget.style.display = "block";
    targetTarget.style.overflow = "hidden"; 
    targetTarget.style.cursor = "pointer";

    liveImg = document.createElement('img');
    liveImg.id = `thumb-img-${safeNameId}`;
    liveImg.style.width = "100%";
    liveImg.style.height = "100%";
    liveImg.style.objectFit = "contain";

    const nameLabel = document.createElement('div');
    nameLabel.id = `thumb-name-${safeNameId}`;
    nameLabel.textContent = studentData.name;
    nameLabel.style.cssText = "width:100%; background:#4c4c5e; color:#fff; font-size:12px; font-weight:bold; text-align:center; padding:4px 0; position:absolute; bottom:0; left:0; box-sizing:border-box; z-index:10;";

    targetTarget.appendChild(liveImg);
    targetTarget.appendChild(nameLabel);

    targetTarget.addEventListener('click', () => {
      if (!ctx || !canvas) return;
      const zoomImg = new Image();
      zoomImg.onload = () => {
        bakeFloatingObjects();
        saveCurrentBoardState();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(zoomImg, 0, 0, canvas.width, canvas.height);
        pushToHistory();
      };
      zoomImg.src = liveImg.src;
    });
  }
  
  if (liveImg) { liveImg.src = studentData.boardImage; }
}

function clearStudentThumbnailsDOM() {
  document.querySelectorAll('.mini-board').forEach(slot => { slot.innerHTML = ''; });
  const allMiniBoards = document.querySelectorAll('.mini-board');
  if (allMiniBoards.length > 4) {
    for (let i = 4; i < allMiniBoards.length; i++) { allMiniBoards[i].remove(); }
  }
}

// ============================================================================
// MULTI-BOARD RE-SYNCHRONIZATION LOGIC
// ============================================================================
function updatePaginationUI() {
  if (pageText) pageText.textContent = `Board ${currentBoardIndex + 1} of ${Math.max(boardsData.length, 1)}`;
}

function saveCurrentBoardState() { 
  if (!canvas) return;
  boardsData[currentBoardIndex] = canvas.toDataURL(); 
}

function loadBoardState(index) {
  if (!ctx || !canvas) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updatePaginationUI();
  
  if (boardsData[index]) {
    const img = new Image();
    img.src = boardsData[index];
    img.onload = () => { 
      ctx.drawImage(img, 0, 0); 
      canvasHistory = [canvas.toDataURL()]; 
    };
  } else {
    canvasHistory = [canvas.toDataURL()];
  }

  clearStudentThumbnailsDOM();
  const historicalAnswers = studentSubmissionsHistory[index] || {};
  Object.keys(historicalAnswers).forEach(name => {
    renderStudentThumbnailDOM({ name: name, boardImage: historicalAnswers[name] });
  });

  if (channel) {
    channel.send({
      type: 'broadcast',
      event: 'switch-board',
      payload: { index: index }
    });
  }
}

// ============================================================================
// REPORT BOOKLET EXPORT MODULE
// ============================================================================
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', async () => {
    saveCurrentBoardState(); 
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1100, 520] });
    let isFirstPage = true;

    for (let i = 0; i < boardsData.length; i++) {
      if (!boardsData[i]) continue;

      if (!isFirstPage) { pdf.addPage([1100, 520], 'landscape'); }
      isFirstPage = false;

      pdf.setFillColor(74, 74, 104); 
      pdf.rect(0, 0, 1100, 45, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("Helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text(`LESSON SLIDE SHEET ${i + 1} - TEACHER QUESTION/TASK`, 30, 28);

      pdf.addImage(boardsData[i], 'PNG', 30, 65, 1040, 435);

      const answersForThisBoard = studentSubmissionsHistory[i] || {};
      const studentNames = Object.keys(answersForThisBoard);

      if (studentNames.length > 0) {
        let pupilCellCounter = 0;

        for (let s = 0; s < studentNames.length; s++) {
          if (pupilCellCounter % 4 === 0) {
            pdf.addPage([1100, 520], 'landscape');
            
            pdf.setFillColor(90, 90, 115);
            pdf.rect(0, 0, 1100, 40, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFont("Helvetica", "bold");
            pdf.setFontSize(14);
            pdf.text(`PUPIL SUBMISSIONS FOR SLIDE SHEET ${i + 1}`, 30, 25);
          }

          const currentPupilName = studentNames[s];
          const pupilImgData = answersForThisBoard[currentPupilName];

          const col = pupilCellCounter % 2; 
          const row = Math.floor((pupilCellCounter % 4) / 2);

          const x = 40 + (col * 530);
          const y = 65 + (row * 225);

          pdf.setFillColor(245, 245, 250);
          pdf.rect(x, y, 500, 210, 'F');
          pdf.setDrawColor(215, 215, 225);
          pdf.rect(x, y, 500, 210, 'S');

          pdf.setTextColor(50, 50, 70);
          pdf.setFont("Helvetica", "bold");
          pdf.setFontSize(13);
          pdf.text(`Pupil Workspace: ${currentPupilName}`, x + 15, y + 22);

          if (pupilImgData) {
            pdf.addImage(pupilImgData, 'PNG', x + 15, y + 32, 470, 163);
          }

          pupilCellCounter++;
        }
      }
    }
    
    pdf.save('complete-classroom-lesson-session.pdf');
  });
}