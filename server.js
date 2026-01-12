const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'detailData.json');

// Load persisted data if exists
let detailData = [];
try{
  if (fs.existsSync(DATA_FILE)) {
    detailData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || [];
  }
}catch(e){ console.warn('Failed to read data file', e); }

const wss = new WebSocket.Server({ port: PORT }, () => console.log(`WS server listening on ${PORT}`));

function persist(){
  try{ fs.writeFileSync(DATA_FILE, JSON.stringify(detailData, null, 2)); }catch(e){ console.warn('persist failed', e); }
}

function broadcast(obj, wsExclude){
  const msg = JSON.stringify(obj);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN && c !== wsExclude) c.send(msg); });
}

wss.on('connection', (ws) => {
  // Send current state to new client
  ws.send(JSON.stringify({ type: 'init', data: detailData }));

  ws.on('message', (raw) => {
    let msg;
    try{ msg = JSON.parse(raw); }catch(e){ return; }
    if(msg && msg.type === 'update' && Array.isArray(msg.data)){
      detailData = msg.data;
      persist();
      // broadcast to others
      broadcast({ type: 'update', data: detailData }, ws);
    }
  });
});

process.on('SIGINT', ()=>{ console.log('SIGINT, shutting down'); wss.close(()=>process.exit()); });
