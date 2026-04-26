/*
 * ============================================================
 *  KidTrack — Backend API (Node.js + Express)
 *  Déploiement : Railway.app (gratuit)
 * ============================================================
 *
 *  INSTALLATION LOCALE :
 *    npm install
 *    node server.js
 *
 *  DÉPLOIEMENT RAILWAY :
 *    1. Créer compte sur railway.app
 *    2. New Project → Deploy from GitHub ou Upload folder
 *    3. Copier l'URL générée (ex: kidtrack.up.railway.app)
 *    4. Coller cette URL dans le .ino et la plateforme HTML
 * ============================================================
 */

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
//  STOCKAGE EN MÉMOIRE (suffisant pour hackathon)
//  En production : remplacer par MongoDB/PostgreSQL
// ──────────────────────────────────────────────
const devices = {};   // { device_id: { ...infos, positions: [] } }
const codes   = {};   // { access_code: device_id }

// ──────────────────────────────────────────────
//  GÉNÉRATION DEVICE AU DÉMARRAGE (démo)
// ──────────────────────────────────────────────
function createDevice(deviceId, childName) {
  const accessCode = generateCode();
  devices[deviceId] = {
    id:          deviceId,
    child_name:  childName,
    access_code: accessCode,
    last_seen:   null,
    positions:   [],   // max 100 positions gardées
    geofences:   [],
    sms_config:  { enabled: false, phone: '', interval: 30 },
    alert_phone: '',
    alerts:      [],
    status:      'offline'
  };
  codes[accessCode] = deviceId;
  console.log(`[DEVICE] Créé : ${deviceId} | Code : ${accessCode}`);
  return accessCode;
}

// Créer un device de démo au démarrage
const DEMO_CODE = createDevice('KIDTRACK_001', 'Amadou');
console.log(`\n🔑 CODE D'ACCÈS DÉMO : ${DEMO_CODE}\n`);

// ──────────────────────────────────────────────
//  UTILITAIRES
// ──────────────────────────────────────────────
function generateCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // ex: A3F9B2
}

function getDeviceByCode(code) {
  const id = codes[code.toUpperCase()];
  return id ? devices[id] : null;
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function checkGeofences(device, lat, lng) {
  const triggered = [];
  device.geofences.forEach(geo => {
    const dist = getDistance(lat, lng, geo.lat, geo.lng);
    const wasIn = geo._inside;
    const isIn  = dist <= geo.radius;
    geo._inside = isIn;

    if (wasIn && !isIn) {
      // Sortie de zone
      const alert = {
        type:    'danger',
        message: `Sortie de zone "${geo.name}"`,
        time:    new Date().toISOString(),
        lat, lng
      };
      device.alerts.unshift(alert);
      if (device.alerts.length > 50) device.alerts.pop();
      triggered.push({ geo, alert });
    } else if (!wasIn && isIn) {
      // Entrée dans zone
      const alert = {
        type:    'success',
        message: `Entrée dans zone "${geo.name}"`,
        time:    new Date().toISOString(),
        lat, lng
      };
      device.alerts.unshift(alert);
      if (device.alerts.length > 50) device.alerts.pop();
    }
  });
  return triggered;
}

// ──────────────────────────────────────────────
//  ROUTES ÉMETTEUR (appelées par le SIM800L)
// ──────────────────────────────────────────────

// POST /api/location  — reçoit la position du GPS
app.post('/api/location', (req, res) => {
  const { device_id, lat, lng, speed, satellites, timestamp } = req.body;

  if (!device_id || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Données manquantes' });
  }

  const device = devices[device_id];
  if (!device) {
    return res.status(404).json({ error: 'Device inconnu' });
  }

  const position = {
    lat:        parseFloat(lat),
    lng:        parseFloat(lng),
    speed:      parseFloat(speed || 0),
    satellites: parseInt(satellites || 0),
    time:       new Date().toISOString()
  };

  device.positions.unshift(position);
  if (device.positions.length > 100) device.positions.pop();

  device.last_seen = new Date().toISOString();
  device.status    = 'online';

  // Vérification geofences
  const triggered = checkGeofences(device, position.lat, position.lng);

  console.log(`[GPS] ${device_id} → ${lat}, ${lng} | ${speed}km/h | ${satellites} sats`);

  res.json({
    ok:      true,
    alerts:  triggered.length,
    geofences_checked: device.geofences.length
  });
});

// ──────────────────────────────────────────────
//  ROUTES PLATEFORME (appelées par le site web)
// ──────────────────────────────────────────────

// POST /api/connect  — connexion parent avec code
app.post('/api/connect', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code manquant' });

  const device = getDeviceByCode(code);
  if (!device) return res.status(401).json({ error: 'Code invalide' });

  res.json({
    ok:          true,
    device_id:   device.id,
    child_name:  device.child_name,
    access_code: device.access_code
  });
});

// GET /api/status/:code  — état complet du device
app.get('/api/status/:code', (req, res) => {
  const device = getDeviceByCode(req.params.code);
  if (!device) return res.status(401).json({ error: 'Code invalide' });

  const latest = device.positions[0] || null;

  res.json({
    ok:         true,
    child_name: device.child_name,
    status:     device.status,
    last_seen:  device.last_seen,
    position:   latest,
    history:    device.positions.slice(0, 20),
    geofences:  device.geofences,
    alerts:     device.alerts.slice(0, 20),
    sms_config: device.sms_config
  });
});

// POST /api/geofence/:code  — créer une zone
app.post('/api/geofence/:code', (req, res) => {
  const device = getDeviceByCode(req.params.code);
  if (!device) return res.status(401).json({ error: 'Code invalide' });

  const { name, lat, lng, radius } = req.body;
  if (!name || !lat || !lng || !radius) {
    return res.status(400).json({ error: 'Données manquantes' });
  }

  const geo = {
    id:      Date.now(),
    name,
    lat:     parseFloat(lat),
    lng:     parseFloat(lng),
    radius:  parseInt(radius),
    _inside: false
  };

  device.geofences.push(geo);
  console.log(`[GEO] Zone créée : "${name}" pour ${device.id}`);
  res.json({ ok: true, geofence: geo });
});

// DELETE /api/geofence/:code/:id  — supprimer une zone
app.delete('/api/geofence/:code/:id', (req, res) => {
  const device = getDeviceByCode(req.params.code);
  if (!device) return res.status(401).json({ error: 'Code invalide' });

  device.geofences = device.geofences.filter(g => g.id != req.params.id);
  res.json({ ok: true });
});

// POST /api/sms-config/:code  — configurer SMS
app.post('/api/sms-config/:code', (req, res) => {
  const device = getDeviceByCode(req.params.code);
  if (!device) return res.status(401).json({ error: 'Code invalide' });

  const { enabled, phone, interval, alert_phone } = req.body;
  device.sms_config  = { enabled, phone, interval };
  device.alert_phone = alert_phone || device.alert_phone;
  res.json({ ok: true });
});

// POST /api/register  — enregistrer un nouvel appareil
app.post('/api/register', (req, res) => {
  const { device_id, child_name } = req.body;
  if (!device_id || !child_name) {
    return res.status(400).json({ error: 'device_id et child_name requis' });
  }
  if (devices[device_id]) {
    return res.json({
      ok:          true,
      access_code: devices[device_id].access_code,
      message:     'Device déjà enregistré'
    });
  }
  const code = createDevice(device_id, child_name);
  res.json({ ok: true, access_code: code });
});

// ──────────────────────────────────────────────
//  SERVIR LA PLATEFORME HTML
// ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ──────────────────────────────────────────────
//  DÉMARRAGE
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 KidTrack Backend démarré sur port ${PORT}`);
  console.log(`📡 API prête à recevoir les positions GPS`);
  console.log(`🌐 Plateforme : http://localhost:${PORT}`);
  console.log(`\n📋 ENDPOINTS DISPONIBLES :`);
  console.log(`   POST /api/location       ← SIM800L envoie ici`);
  console.log(`   POST /api/connect        ← Login parent`);
  console.log(`   GET  /api/status/:code   ← Données temps réel`);
  console.log(`   POST /api/geofence/:code ← Créer zone`);
  console.log(`   POST /api/register       ← Nouvel appareil\n`);
});
