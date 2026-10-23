import { useState, useEffect } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function LatencyChart({ history, name }) {
  if (!history || history.length < 2) {
    return (
      <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem', color: '#64748b', fontSize: '0.85rem' }}>
        Need at least 2 checks to render the response-time curve for <strong>{name}</strong>. Click <strong>"↻ Ping All Now"</strong>!
      </div>
    );
  }

  const width = 500;
  const height = 120;
  const maxLatency = Math.max(...history.map(h => h.latency), 300);

  const points = history
    .map((h, i) => {
      const x = (i / (history.length - 1)) * (width - 20) + 10;
      const y = height - 15 - (h.latency / maxLatency) * (height - 30);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        <strong style={{ color: '#38bdf8' }}>📈 Response-Time Trend: {name}</strong>
        <span style={{ color: '#94a3b8' }}>Peak: {maxLatency} ms</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '120px', overflow: 'visible' }}>
        <polyline
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.5"
          points={points}
        />
        {history.map((h, i) => {
          const x = (i / (history.length - 1)) * (width - 20) + 10;
          const y = height - 15 - (h.latency / maxLatency) * (height - 30);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill={h.status === 'Operational' ? '#10b981' : '#ef4444'}
            >
              <title>{`${h.timestamp}: ${h.latency} ms (${h.status})`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function App() {
  const [data, setData] = useState({ endpoints: [], incidents: [] });
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to connect to PulseCheck backend:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAddEndpoint = async (e) => {
    e.preventDefault();
    if (!name || !url) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url })
      });
      const updated = await res.json();
      setData(updated);
      setName('');
      setUrl('');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckNow = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/check-now`, { method: 'POST' });
      const updated = await res.json();
      setData(updated);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    const res = await fetch(`${API_BASE}/endpoints/${id}`, { method: 'DELETE' });
    const updated = await res.json();
    setData(updated);
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const totalEndpoints = data.endpoints.length;
  const operationalCount = data.endpoints.filter(e => e.status === 'Operational').length;
  const avgLatency = totalEndpoints
    ? Math.round(data.endpoints.reduce((acc, ep) => acc + ep.latency, 0) / totalEndpoints)
    : 0;

  const activeEndpoint = data.endpoints.find(e => e.id === selectedId) || data.endpoints[0];

  return (
    <div className="dashboard-container">
      <header className="header-bar">
        <div className="header-title">
          <h1>⚡ PulseCheck</h1>
          <p>Real-Time API Uptime & Latency Monitoring Engine</p>
        </div>
        <button className="ping-btn" onClick={handleCheckNow} disabled={loading}>
          {loading ? 'Pinging Endpoints...' : '↻ Ping All Now'}
        </button>
      </header>

      <div className="metrics-grid">
        <div className="metric-card">
          <span>Monitored Endpoints</span>
          <h2>{totalEndpoints}</h2>
        </div>
        <div className="metric-card">
          <span>Healthy Services</span>
          <h2 style={{ color: '#10b981' }}>
            {operationalCount} / {totalEndpoints}
          </h2>
        </div>
        <div className="metric-card">
          <span>Avg Response Time</span>
          <h2 style={{ color: '#38bdf8' }}>{avgLatency} ms</h2>
        </div>
        <div className="metric-card">
          <span>Logged Incidents</span>
          <h2 style={{ color: data.incidents.length > 0 ? '#f87171' : '#94a3b8' }}>
            {data.incidents.length}
          </h2>
        </div>
      </div>

      <form className="endpoint-form" onSubmit={handleAddEndpoint}>
        <input
          type="text"
          placeholder="Service Name (e.g., StudyOS Production)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="endpoint-input"
        />
        <input
          type="text"
          placeholder="Endpoint URL (e.g., https://study-os.vercel.app)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="endpoint-input"
        />
        <button type="submit" className="add-btn" disabled={loading}>
          + Monitor URL
        </button>
      </form>

      <div className="main-grid">
        <div className="panel-card">
          <h3>📡 Active Monitors & Latency History</h3>

          {activeEndpoint && (
            <LatencyChart
              history={activeEndpoint.history}
              name={activeEndpoint.name}
            />
          )}

          {data.endpoints.map((ep) => {
            const isSelected = activeEndpoint && activeEndpoint.id === ep.id;
            return (
              <div
                key={ep.id}
                className="endpoint-item"
                onClick={() => setSelectedId(ep.id)}
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? '#38bdf8' : '#1e293b',
                  transition: 'border-color 0.2s'
                }}
              >
                <div className="ep-top">
                  <div>
                    <strong>{ep.name}</strong>
                    <div className="ep-url">{ep.url}</div>
                  </div>
                  <span className={`badge ${ep.status === 'Operational' ? 'badge-up' : 'badge-down'}`}>
                    ● {ep.status} ({ep.latency} ms)
                  </span>
                </div>

                <div className="history-bars" title="Recent checks (height = latency)">
                  {ep.history.map((h, i) => {
                    const heightPercent = Math.min(100, Math.max(20, Math.round((h.latency / 600) * 100)));
                    return (
                      <div
                        key={i}
                        className={`bar ${h.status === 'Operational' ? 'bar-up' : 'bar-down'}`}
                        style={{ height: `${heightPercent}%` }}
                        title={`${h.timestamp} — ${h.latency}ms (${h.status})`}
                      />
                    );
                  })}
                </div>

                <div className="ep-footer">
                  <span>Uptime: <strong>{ep.uptime}%</strong> ({ep.history.length} recent checks)</span>
                  <button className="delete-btn" onClick={(e) => handleDelete(ep.id, e)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel-card">
          <h3>🚨 Incident & Alert Log</h3>
          {data.incidents.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              No downtime incidents recorded. All systems nominal.
            </p>
          ) : (
            data.incidents.map((inc) => (
              <div key={inc.id} className="incident-item">
                <strong>{inc.endpointName}</strong>
                <p style={{ color: '#cbd5e1', marginTop: '4px' }}>{inc.message}</p>
                <div className="incident-time">
                  {inc.date} at {inc.timestamp}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;