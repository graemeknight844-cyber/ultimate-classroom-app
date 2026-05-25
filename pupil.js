const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const canvas = document.getElementById('pupilCanvas');
const ctx = canvas.getContext('2d');
const statusBar = document.getElementById('statusBar');

ctx.lineWidth = 4;
ctx.lineCap = 'round';

// Subscribe to the real-time broadcast channel matching the Room Code (8492)
const channel = supabase.channel('room_8492', {
  config: { broadcast: { self: false } }
});

channel
  .on('broadcast', { event: 'draw' }, ({ payload }) => {
    ctx.strokeStyle = payload.color;
    ctx.lineTo(payload.x, payload.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(payload.x, payload.y);
  })
  .on('broadcast', { event: 'clear' }, () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  })
  .on('broadcast', { event: 'text' }, ({ payload }) => {
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.fillStyle = payload.color;
    ctx.textBaseline = 'top';
    ctx.fillText(payload.text, payload.x, payload.y);
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      statusBar.textContent = "Connected live to Room 8492";
      statusBar.style.backgroundColor = "#BFEA7C";
      statusBar.style.color = "#333";
    }
  });