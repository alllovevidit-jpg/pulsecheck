const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'db.json');

// Initialize local JSON database if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  const initialData = {
    endpoints: [
      {
        id: '1',
        name: 'GitHub Public API',
        url: 'https://api.github.com',
        status: 'Pending',
        latency: 0,
        uptime: 100,
        history: []
      },
      {
        id: '2',
        name: 'JSONPlaceholder Test API',
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        status: 'Pending',
        latency: 0,
        uptime: 100,
        history: []
      }
    ],
    incidents: []
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Core function that pings an endpoint and measures response time
async function checkEndpoint(ep, db) {
  const start = Date.now();
  let isUp = false;
  let statusCode = 0;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8-second timeout
    const res = await fetch(ep.url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    statusCode = res.status;
    isUp = res.ok; // True if HTTP status is 200-299
  } catch (err) {
    isUp = false;
    statusCode = 500;
  }

  const latency = Date.now() - start;
  const newStatus = isUp ? 'Operational' : 'Down';

  // Log an incident if the endpoint is Down
  if (newStatus === 'Down' && ep.status !== 'Down') {
    db.incidents.unshift({
      id: Date.now().toString() + Math.random(),
      endpointName: ep.name,
      url: ep.url,
      statusCode,
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      message: `Endpoint unreachable or returned HTTP ${statusCode}`
    });
    db.incidents = db.incidents.slice(0, 25); // Keep latest 25 incidents
  }

  // Update history (keep last 20 checks for the UI sparkline/bars)
  ep.history.push({
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency,
    status: newStatus
  });
  if (ep.history.length > 20) ep.history.shift();

  // Calculate Uptime %
  const upCount = ep.history.filter(h => h.status === 'Operational').length;
  ep.uptime = ((upCount / ep.history.length) * 100).toFixed(1);
  ep.status = newStatus;
  ep.latency = latency;
}

// Function to loop through all registered endpoints
async function runHealthChecks() {
  const db = readDB();
  for (let ep of db.endpoints) {
    await checkEndpoint(ep, db);
  }
  writeDB(db);
  console.log(`[PulseCheck] Health check completed at ${new Date().toLocaleTimeString()}`);
}

// Schedule background checks every 1 minute
cron.schedule('* * * * *', () => {
  runHealthChecks();
});

// --- API ROUTES ---

// 1. Get all endpoints and incidents
app.get('/api/status', (req, res) => {
  res.json(readDB());
});

// 2. Register a new endpoint
app.post('/api/endpoints', async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });

  const db = readDB();
  const newEp = {
    id: Date.now().toString(),
    name,
    url: url.startsWith('http') ? url : `https://${url}`,
    status: 'Pending',
    latency: 0,
    uptime: 100,
    history: []
  };

  await checkEndpoint(newEp, db);
  db.endpoints.unshift(newEp);
  writeDB(db);
  res.json(db);
});

// 3. Trigger an immediate manual check
app.post('/api/check-now', async (req, res) => {
  await runHealthChecks();
  res.json(readDB());
});

// 4. Delete an endpoint
app.delete('/api/endpoints/:id', (req, res) => {
  const db = readDB();
  db.endpoints = db.endpoints.filter(ep => ep.id !== req.params.id);
  writeDB(db);
  res.json(db);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`⚡ PulseCheck Backend running on http://localhost:${PORT}`);
  runHealthChecks(); // Run an immediate check on startup
});