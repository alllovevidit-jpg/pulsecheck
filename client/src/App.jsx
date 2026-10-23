import { useState, useEffect } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function TelemetryInspector({ endpoint }) {
  if (!endpoint) return null;
  const history = endpoint.history || [];

  if (history.length < 2) {
    return (
      <div className="empty-state">
        Awaiting at least 2 telemetry data points for <strong>{endpoint.name}</strong>.
        <br />Click <strong>"Run Health Check"</strong> in the top bar.
      </div>
    );
  }

  const width = 420;
  const height = 140;
  const maxLatency = Math.max(...history.map((h) => h.latency), 250);
  const minLatency = Math.min(...history.map((h) => h.latency));

  const coords = history.map((h, i) => {
    const x = (i / (history.length - 1)) * (width - 24) + 12;
    const y = height - 20 - (h.latency / maxLatency) * (height - 40);
    return { x, y, ...h };
  });

  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPoints = `${coords[0].x},${height - 10} ${linePoints} ${coords[coords.length - 1].x},${height - 10}`;

  return (
    <div className="chart-box">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{endpoint.name}</div>
          <div className="mono" style={{ fontSize: '0.75rem', color: '#52525b' }}>{endpoint.url}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="mono" style={{ fontSize: '1.1rem', fontWeight: 600 }}>{endpoint.latency}ms</span>
          <div style={{ fontSize: '0.7rem', color: '#52525b' }}>Peak {maxLatency}ms · Min {minLatency}ms</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '140px', overflow: 'visible' }}>
        <defs>
          <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle horizontal reference lines */}
        <line x1="12" y1="20" x2={width - 12} y2="20" stroke="#f4f4f5" strokeWidth="1" />
        <line x1="12" y1={height / 2} x2={width - 12} y2={height / 2} stroke="#f4f4f5" strokeWidth="1" />
        <line x1="12" y1={height - 10} x2={width - 12} y2={height - 10} stroke="#e4e4e7" strokeWidth="1" />

        <polygon points={areaPoints} fill="url(#latencyGrad)" />
        <polyline
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePoints}
        />

        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r="3.5"
            fill={c.status === 'Operational' ? '#10b981' : '#ef4444'}
            stroke="#ffffff"
            strokeWidth="1.5"
          >
            <title>{`${c.timestamp} — ${c.latency}ms (${c.status})`}</title>
          </circle>
        ))}
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
    if (selectedId === id) setSelectedId(null);
  };

  const totalEndpoints = data.endpoints.length;
  const operationalCount = data.endpoints.filter((e) => e.status === 'Operational').length;
  const allOperational = totalEndpoints > 0 && operationalCount === totalEndpoints;
  const avgLatency = totalEndpoints
    ? Math.round(data.endpoints.reduce((acc, ep) => acc + ep.latency, 0) / totalEndpoints)
    : 0;

  const activeEndpoint = data.endpoints.find((e) => e.id === selectedId) || data.endpoints[0];

  return (
    <div>
      {/* Sticky Top Header */}
      <nav className="top-nav">
        <div className="nav-inner">
          <div className="brand-group">
            <div className="brand-logo">P</div>
            <span className="brand-name">PulseCheck</span>
            <span className={`system-pill ${!allOperational && totalEndpoints > 0 ? 'degraded' : ''}`}>
              <span className={`pulse-dot ${!allOperational && totalEndpoints > 0 ? 'down' : ''}`} />
              {allOperational ? 'All Systems Operational' : `${totalEndpoints - operationalCount} Degraded`}
            </span>
          </div>

          <button className="btn-primary" onClick={handleCheckNow} disabled={loading}>
            {loading ? 'Polling Endpoints...' : '↻ Run Health Check'}
          </button>
        </div>
      </nav>

      <main className="workspace">
        {/* Unified 4-Column KPI Strip */}
        <section className="kpi-strip">
          <div className="kpi-cell">
            <span className="kpi-label">Active Monitors</span>
            <div className="kpi-value mono">{totalEndpoints}</div>
          </div>
          <div className="kpi-cell">
            <span className="kpi-label">Operational</span>
            <div className="kpi-value mono" style={{ color: '#10b981' }}>
              {operationalCount}/{totalEndpoints}
            </div>
          </div>
          <div className="kpi-cell">
            <span className="kpi-label">Global Mean Latency</span>
            <div className="kpi-value mono">{avgLatency} ms</div>
          </div>
          <div className="kpi-cell">
            <span className="kpi-label">Logged Incidents (24h)</span>
            <div className="kpi-value mono" style={{ color: data.incidents.length > 0 ? '#ef4444' : '#09090b' }}>
              {data.incidents.length}
            </div>
          </div>
        </section>

        <form className="command-bar" onSubmit={handleAddEndpoint}>
          <input
            type="text"
            placeholder="Service identifier (e.g., StudyOS Production)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="cmd-input"
          />
          <input
            type="text"
            placeholder="Target endpoint URL (https://...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="cmd-input mono"
          />
          <button type="submit" className="btn-secondary" disabled={loading}>
            + Register Endpoint
          </button>
        </form>

        <div className="bento-grid">
          {/* Left: Structured Uptime Matrix */}
          <div className="surface-card">
            <div className="card-header">
              <span className="card-title">Monitored Endpoints</span>
              <span className="card-subtitle">20-check rolling window · 60s interval</span>
            </div>

            <div className="monitor-list">
              {data.endpoints.map((ep) => {
                const isSelected = activeEndpoint && activeEndpoint.id === ep.id;
                const paddedHistory = [
                  ...Array(Math.max(0, 20 - ep.history.length)).fill(null),
                  ...ep.history
                ];

                return (
                  <div
                    key={ep.id}
                    className={`monitor-row ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedId(ep.id)}
                  >
                    <div className="row-top">
                      <div>
                        <div className="service-meta">
                          <span className={`pulse-dot ${ep.status === 'Operational' ? '' : 'down'}`} />
                          <span className="service-name">{ep.name}</span>
                        </div>
                        <div className="service-url mono" style={{ marginTop: '2px', marginLeft: '17px' }}>
                          {ep.url}
                        </div>
                      </div>

                      <div className="row-stats">
                        <span className="mono" style={{ fontSize: '0.8rem', color: '#52525b' }}>
                          {ep.latency} ms
                        </span>
                        <span className={`status-badge ${ep.status === 'Operational' ? 'up' : 'down'}`}>
                          {ep.status}
                        </span>
                      </div>
                    </div>

                    <div className="uptime-track">
                      {paddedHistory.map((item, idx) => (
                        <div
                          key={idx}
                          className={`uptime-pill ${item ? (item.status === 'Operational' ? 'up' : 'down') : ''}`}
                          title={item ? `${item.timestamp} — ${item.latency}ms (${item.status})` : 'No check recorded'}
                        />
                      ))}
                    </div>

                    <div className="row-footer">
                      <span className="mono">{ep.uptime}% uptime</span>
                      <button className="btn-remove" onClick={(e) => handleDelete(ep.id, e)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="right-column">
            <div className="surface-card">
              <div className="card-header">
                <span className="card-title">Latency Telemetry</span>
                <span className="card-subtitle">Real-time response curve</span>
              </div>
              <TelemetryInspector endpoint={activeEndpoint} />
            </div>

            <div className="surface-card">
              <div className="card-header">
                <span className="card-title">Incident Log</span>
                <span className="card-subtitle">Automated failure alerts</span>
              </div>

              {data.incidents.length === 0 ? (
                <div className="empty-state">
                  No downtime anomalies detected across active endpoints.
                </div>
              ) : (
                <div className="incident-list">
                  {data.incidents.map((inc) => (
                    <div key={inc.id} className="incident-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#991b1b' }}>
                        <span>{inc.endpointName}</span>
                        <span className="mono">HTTP {inc.statusCode}</span>
                      </div>
                      <p style={{ color: '#7f1d1d', marginTop: '4px', fontSize: '0.78rem' }}>{inc.message}</p>
                      <div className="mono" style={{ color: '#b91c1c', fontSize: '0.7rem', marginTop: '6px' }}>
                        {inc.date} · {inc.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;