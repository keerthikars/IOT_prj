import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, BatteryCharging, Bell, Bluetooth, CheckCircle2,
  Cloud, CloudOff, Droplets, Gauge, History, LayoutDashboard, Lightbulb,
  Moon, Radio, Settings, ShieldCheck, Sun, Volume2, Wifi, X, PlugZap
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, push, set } from 'firebase/database';
import './styles.css';

const SERVICE_UUID = '12345678-1234-1234-1234-123456789001';
const CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789002';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const cloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId && firebaseConfig.appId);
let database = null;
let authReady = Promise.resolve();
if (cloudConfigured) {
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    database = getDatabase(firebaseApp);
    const auth = getAuth(firebaseApp);
    // Enable Anonymous sign-in in Firebase Console > Authentication > Sign-in method.
    authReady = signInAnonymously(auth);
  } catch (error) { console.error('Firebase initialization failed:', error); }
}
const timeText = (date) => new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function App() {
  const [page, setPage] = useState('dashboard');
  const [dark, setDark] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('Not connected');
  const [level, setLevel] = useState('UNKNOWN');
  const [last, setLast] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [cloudState, setCloudState] = useState(cloudConfigured ? 'Ready to upload' : 'Not configured');
  const [error, setError] = useState('');
  const deviceRef = useRef(null);
  const characteristicRef = useRef(null);
  const previousLevelRef = useRef(null);
  const low = level === 'LOW';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    return () => document.documentElement.classList.remove('dark');
  }, [dark]);

  async function uploadReading(next, timestamp, isAlert) {
    if (!database) { setCloudState(cloudConfigured ? 'Initialization error' : 'Not configured'); return; }
    try {
      setCloudState('Uploading…');
      await authReady;
      const record = { waterLevel: next, led: next === 'LOW', buzzer: next === 'LOW', source: 'ESP32-C3 BLE', timestamp, alert: Boolean(isAlert) };
      await set(ref(database, 'battery/latest'), record);
      await set(push(ref(database, 'battery/readings')), record);
      if (isAlert) await set(push(ref(database, 'battery/alerts')), { waterLevel: next, message: 'Low water level detected', timestamp, acknowledged: false });
      setCloudState('Synced to cloud');
    } catch (e) {
      console.error(e);
      setCloudState('Upload failed');
      setError('Cloud upload failed. Check Firebase configuration and Realtime Database rules.');
    }
  }

  function updateLevel(raw) {
    const text = String(raw ?? '').trim().toUpperCase();
    // Accept NORMAL / LOW and the firmware's "Water Level: ..." messages.
    let next;
    if (text.includes('LOW')) next = 'LOW';
    else if (text.includes('NORMAL') || text === 'OK' || text === '1') next = 'NORMAL';
    else { setError(`Unrecognized BLE message: ${String(raw)}`); return; }
    const now = Date.now();
    const isAlert = next === 'LOW' && previousLevelRef.current !== 'LOW';
    previousLevelRef.current = next;
    setLevel(next);
    setLast(now);
    const item = { id: `${now}-${Math.random()}`, level: next, timestamp: now };
    setHistory((old) => [item, ...old].slice(0, 100));
    if (isAlert) setAlerts((old) => [{ id: item.id, text: 'Low water level detected', timestamp: now }, ...old].slice(0, 100));
    void uploadReading(next, now, isAlert);
  }

  async function connectBLE() {
    setError('');
    if (!navigator.bluetooth) {
      setError('Web Bluetooth is unavailable. Use current Chrome or Edge on your laptop and open the dashboard at localhost.');
      return;
    }
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      });
      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', () => {
        setConnected(false);
        setDeviceName('Disconnected');
        characteristicRef.current = null;
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
      characteristicRef.current = characteristic;
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = event.target.value;
        updateLevel(new TextDecoder().decode(value));
      });
      if (characteristic.properties.notify || characteristic.properties.indicate) await characteristic.startNotifications();
      if (characteristic.properties.read) {
        const value = await characteristic.readValue();
        updateLevel(new TextDecoder().decode(value));
      }
      setConnected(true);
      setDeviceName(device.name || 'Smart Battery Cap');
    } catch (e) {
      if (e.name !== 'NotFoundError') setError(`Bluetooth connection failed: ${e.message || e}`);
    }
  }

  async function disconnectBLE() {
    try { if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect(); }
    finally { setConnected(false); setDeviceName('Not connected'); characteristicRef.current = null; }
  }

  const normalCount = useMemo(() => history.filter((x) => x.level === 'NORMAL').length, [history]);
  const lowCount = history.length - normalCount;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><BatteryCharging size={23}/></div><div><b>Smart Battery</b><small>CAP · IOT MONITOR</small></div></div>
      <div className="nav-label">MONITORING</div>
      <Nav icon={<LayoutDashboard/>} text="Dashboard" active={page === 'dashboard'} onClick={() => setPage('dashboard')}/>
      <Nav icon={<Radio/>} text="Live Monitor" active={page === 'live'} onClick={() => setPage('live')}/>
      <Nav icon={<History/>} text="History" active={page === 'history'} onClick={() => setPage('history')}/>
      <Nav icon={<Bell/>} text="Alerts" badge={alerts.length || null} active={page === 'alerts'} onClick={() => setPage('alerts')}/>
      <div className="nav-label">DEVICE</div>
      <Nav icon={<Bluetooth/>} text="Smart Cap" active={page === 'device'} onClick={() => setPage('device')}/>
      <Nav icon={<Settings/>} text="Settings" active={page === 'settings'} onClick={() => setPage('settings')}/>
      <div className="side-bottom">
        <div className={`connection ${connected ? 'online' : ''}`}><i/><div><b>{connected ? 'Connected' : 'Offline'}</b><small>{deviceName}</small></div></div>
        <button className="theme-button" onClick={() => setDark((v) => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>} {dark ? 'Light mode' : 'Dark mode'}</button>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div><small className="breadcrumb">SMART BATTERY CAP / {page.toUpperCase()}</small><h1>{pageTitle(page)}</h1></div><div className="top-actions"><button className="icon-button" aria-label="Toggle theme" onClick={() => setDark((v) => !v)}>{dark ? <Sun/> : <Moon/>}</button>{connected ? <button className="connect-button connected" onClick={disconnectBLE}><Bluetooth size={17}/> Disconnect</button> : <button className="connect-button" onClick={connectBLE}><Bluetooth size={17}/> Connect Smart Cap</button>}</div></header>
      {error && <div className="error-banner"><AlertTriangle size={18}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
      {page === 'dashboard' && <Dashboard low={low} level={level} connected={connected} last={last} history={history} alerts={alerts} cloudState={cloudState} normalCount={normalCount} lowCount={lowCount}/>}
      {page === 'live' && <section className="page"><div className={`live-banner ${low ? 'danger' : ''}`}><div className="water-orb"><Droplets size={42}/></div><div><small>REAL-TIME WATER LEVEL</small><h2>{level}</h2><p>{level === 'UNKNOWN' ? 'Connect the Smart Cap to receive sensor data.' : low ? 'Low level detected. Check the battery according to its manufacturer instructions.' : 'The sensor currently reports a normal level.'}</p><span>Last update: {last ? timeText(last) : 'No reading received'}</span></div></div><div className="metric-grid four"><Metric icon={<Bluetooth/>} name="Bluetooth" value={connected ? 'CONNECTED' : 'OFFLINE'}/><Metric icon={<Lightbulb/>} name="Warning LED" value={level === 'UNKNOWN' ? 'UNKNOWN' : low ? 'ON' : 'OFF'}/><Metric icon={<Volume2/>} name="Buzzer" value={level === 'UNKNOWN' ? 'UNKNOWN' : low ? 'ON' : 'OFF'}/><Metric icon={<Cloud/>} name="Cloud" value={cloudState}/></div></section>}
      {page === 'history' && <section className="page"><Intro eyebrow="READINGS" title="Level history" sub="Readings received from your ESP32-C3 over Bluetooth. Cloud writes occur when a reading arrives."/><div className="panel table-panel">{history.length ? <div className="history-table"><div className="table-heading"><span>TIME</span><span>LEVEL</span><span>SOURCE</span></div>{history.map((h) => <div className="table-row" key={h.id}><span>{timeText(h.timestamp)}</span><b className={h.level === 'LOW' ? 'red-text' : 'green-text'}>{h.level}</b><span>ESP32-C3 · BLE</span></div>)}</div> : <Empty text="No readings yet. Connect your Smart Cap."/>}</div></section>}
      {page === 'alerts' && <section className="page"><Intro eyebrow="SAFETY EVENTS" title="Alert history" sub="A new alert is recorded when the sensor changes into LOW status."/><div className="panel">{alerts.length ? alerts.map((a) => <div className="alert-row" key={a.id}><div className="alert-symbol"><AlertTriangle/></div><div><b>{a.text}</b><small>{timeText(a.timestamp)}</small></div><span className="status-pill warning">LOW</span></div>) : <Empty text="No low-level alerts received."/>}</div></section>}
      {page === 'device' && <section className="page"><Intro eyebrow="DEVICE DETAILS" title="Smart Cap" sub="Bluetooth Low Energy connection to your ESP32-C3 SuperMini."/><div className="panel device-panel"><div className="device-avatar"><BatteryCharging size={30}/></div><div className="device-description"><small>DEVICE NAME</small><h3>{deviceName}</h3><p>ESP32-C3 · Bluetooth Low Energy</p></div><span className={`status-pill ${connected ? 'success' : ''}`}>{connected ? 'CONNECTED' : 'OFFLINE'}</span></div><div className="two-column"><div className="panel uuid-panel"><small>BLE SERVICE UUID</small><code>{SERVICE_UUID}</code></div><div className="panel uuid-panel"><small>WATER LEVEL CHARACTERISTIC UUID</small><code>{CHARACTERISTIC_UUID}</code></div></div><div className="panel note-panel"><b>Connection tip</b><p>Use Chrome or Edge on your laptop. The ESP32 firmware must advertise this service UUID and send NORMAL or LOW notifications.</p></div></section>}
      {page === 'settings' && <section className="page"><Intro eyebrow="CONFIGURATION" title="System settings" sub="Hardware and cloud settings used by this prototype."/><div className="settings-list"><Setting icon={<Bluetooth/>} title="Bluetooth Low Energy" description="Browser ↔ ESP32-C3" value={connected ? 'CONNECTED' : 'READY'}/><Setting icon={<Droplets/>} title="Float sensor" description="GPIO 4 · threshold detection only" value="CONFIGURED IN FIRMWARE"/><Setting icon={<Lightbulb/>} title="LED and buzzer" description="GPIO 6 and GPIO 5 · activated on LOW" value="LOCAL ALERT"/><Setting icon={<Cloud/>} title="Firebase Realtime Database" description="Cloud readings and alert history" value={cloudState.toUpperCase()}/></div><div className="panel note-panel"><b>Cloud privacy and security</b><p>Do not publish your Firebase secret keys or use open database rules for a deployed project. Configure Firebase Authentication and rules that restrict access before real use.</p></div></section>}
      <footer className="footer"><span><ShieldCheck size={14}/> Educational prototype · threshold sensor</span><span>{connected ? 'Bluetooth connected' : 'Waiting for device'} · {cloudState}</span></footer>
    </main>
  </div>;
}

function pageTitle(p) { return ({ dashboard: 'Battery overview', live: 'Live monitor', history: 'Level history', alerts: 'Alerts', device: 'Smart Cap', settings: 'Settings' })[p] || 'Dashboard'; }
function Nav({ icon, text, active, onClick, badge }) { return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{text}</span>{badge ? <em>{badge}</em> : null}</button>; }
function Metric({ icon, name, value }) { return <div className="panel metric"><div className="metric-icon">{icon}</div><small>{name}</small><strong>{value}</strong></div>; }
function Intro({ eyebrow, title, sub }) { return <div className="page-intro"><small>{eyebrow}</small><h2>{title}</h2><p>{sub}</p></div>; }
function Empty({ text }) { return <div className="empty-state"><CheckCircle2 size={28}/><b>{text}</b></div>; }
function Setting({ icon, title, description, value }) { return <div className="panel setting-row"><div className="setting-icon">{icon}</div><div className="setting-copy"><b>{title}</b><small>{description}</small></div><span className="setting-value">{value}</span></div>; }
function Dashboard({ low, level, connected, last, history, alerts, cloudState, normalCount, lowCount }) {
  const points = history.slice(0, 18).reverse();
  return <section className="dashboard-page">
    <div className={`system-banner ${low ? 'danger' : ''}`}><div className="system-symbol">{low ? <AlertTriangle/> : level === 'UNKNOWN' ? <Activity/> : <CheckCircle2/>}</div><div className="system-copy"><small>SYSTEM STATUS</small><b>{level === 'UNKNOWN' ? 'Waiting for first sensor reading' : low ? 'Low water level detected' : 'Water level is normal'}</b><span>{last ? `Last updated ${timeText(last)}` : 'Connect your Smart Cap to start monitoring.'}</span></div><div className="connection-tags"><span className={`tag ${connected ? 'tag-green' : ''}`}><Bluetooth size={14}/>{connected ? 'BLE CONNECTED' : 'BLE OFFLINE'}</span><span className={`tag ${cloudState === 'Synced to cloud' ? 'tag-green' : ''}`}><Cloud size={14}/>{cloudState}</span></div></div>
    <div className="metric-grid main-metrics"><div className={`panel level-panel ${low ? 'level-low' : ''}`}><div className="panel-heading"><span>Water level status</span><Droplets/></div><div className={`level-value ${low ? 'red-text' : level === 'NORMAL' ? 'green-text' : ''}`}>{level}</div><p>{level === 'UNKNOWN' ? 'No data received yet.' : low ? 'Please check the battery safely.' : 'No low-level condition reported.'}</p><div className="level-track"><i style={{ width: level === 'LOW' ? '24%' : level === 'NORMAL' ? '78%' : '0%' }}/></div><div className="track-labels"><span>LOW</span><span>NORMAL</span></div><div className="sensor-chip"><Activity size={15}/> Float switch · GPIO 4 <b>{level === 'UNKNOWN' ? 'WAITING' : 'ACTIVE'}</b></div></div>
      <Metric icon={<Bluetooth/>} name="Bluetooth" value={connected ? 'CONNECTED' : 'OFFLINE'}/><Metric icon={<Lightbulb/>} name="Warning LED" value={level === 'UNKNOWN' ? 'UNKNOWN' : low ? 'ON' : 'OFF'}/><Metric icon={<Volume2/>} name="Buzzer" value={level === 'UNKNOWN' ? 'UNKNOWN' : low ? 'ON' : 'OFF'}/><Metric icon={<Cloud/>} name="Cloud status" value={cloudState}/></div>
    <div className="lower-grid"><div className="panel activity-panel"><div className="panel-title"><div><small>RECENT READINGS</small><h3>Monitoring activity</h3></div><span className="live-tag"><i/> LIVE</span></div>{points.length ? <div className="reading-plot"><div className="plot-grid"><span>Normal</span><span>Low</span></div><div className="plot-points">{points.map((p) => <div key={p.id} className={`plot-point ${p.level === 'LOW' ? 'point-low' : ''}`} title={`${timeText(p.timestamp)} — ${p.level}`}><i/><small>{new Date(p.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>)}</div></div> : <Empty text="Readings will appear here after BLE connects."/>}<div className="stats-strip"><span><b>{history.length}</b><small>Readings this session</small></span><span><b className="green-text">{normalCount}</b><small>Normal</small></span><span><b className="red-text">{lowCount}</b><small>Low</small></span></div></div>
      <div className="panel recent-alerts"><div className="panel-title"><div><small>SAFETY</small><h3>Recent alerts</h3></div><Bell/></div>{alerts.length ? alerts.slice(0, 4).map((a) => <div className="alert-row compact" key={a.id}><div className="alert-symbol"><AlertTriangle size={17}/></div><div><b>{a.text}</b><small>{timeText(a.timestamp)}</small></div></div>) : <Empty text="No low-level alerts received."/>}</div></div>
    <div className="info-strip"><span><PlugZap/><b>Local protection</b> LED + buzzer handled by ESP32</span><span><Cloud/><b>Cloud logging</b> Uploads when BLE reading arrives</span><span><Wifi/><b>Connectivity</b> BLE does not require home Wi-Fi</span></div>
  </section>;
}

createRoot(document.getElementById('root')).render(<App/>);
