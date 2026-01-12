const fs = require('fs');
const path = require('path');
const http = require('http');
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

function persist(){
  try{ fs.writeFileSync(DATA_FILE, JSON.stringify(detailData, null, 2)); }catch(e){ console.warn('persist failed', e); }
}

const server = http.createServer((req, res) => {
  // Simple JSON endpoints for clients to fallback
  if (req.method === 'GET' && req.url === '/data'){
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({ type: 'data', data: detailData }));
  }
  if (req.method === 'POST' && req.url === '/update'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', ()=>{
      try{
        const msg = JSON.parse(body);
        if(Array.isArray(msg.data)){
          detailData = msg.data;
          persist();
          // broadcast to ws clients
          broadcast({ type: 'update', data: detailData });
          res.writeHead(200, {'Content-Type':'application/json'});
          return res.end(JSON.stringify({ ok:true }));
        }
      }catch(e){ /* fallthrough */ }
      res.writeHead(400); res.end('invalid');
    });
    return;
  }
  // default: not found
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocket.Server({ server });

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

server.listen(PORT, () => console.log(`Server listening on ${PORT}`));

process.on('SIGINT', ()=>{ console.log('SIGINT, shutting down'); server.close(()=>process.exit()); });
