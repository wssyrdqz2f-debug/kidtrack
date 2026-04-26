# 📍 KidTrack — Guide de déploiement complet

## Structure du projet

```
kidtrack/
├── server.js          ← API backend Node.js
├── package.json       ← Dépendances npm
├── Procfile           ← Commande de démarrage Railway
├── railway.json       ← Configuration Railway
├── .gitignore         ← Fichiers à ignorer
├── .env.example       ← Variables d'environnement (modèle)
└── public/
    ├── index.html     ← Plateforme web parent
    └── kidtrack_emetteur_v2.ino ← Code Arduino
```

---

## ✅ MÉTHODE 1 — Railway (Recommandée, Gratuite)

### Étape 1 : Créer un compte GitHub
1. Aller sur https://github.com
2. Créer un compte gratuit
3. Cliquer sur **New repository**
4. Nommer le repo : `kidtrack`
5. Laisser **Public** coché → **Create repository**

### Étape 2 : Uploader les fichiers sur GitHub
1. Dans votre repo GitHub, cliquer **uploading an existing file**
2. Glisser-déposer TOUS les fichiers du projet (sauf node_modules)
3. Cliquer **Commit changes**

### Étape 3 : Déployer sur Railway
1. Aller sur https://railway.app
2. Cliquer **Login with GitHub**
3. Cliquer **New Project**
4. Choisir **Deploy from GitHub repo**
5. Sélectionner votre repo `kidtrack`
6. Railway détecte Node.js automatiquement et lance le déploiement

### Étape 4 : Obtenir votre URL publique
1. Dans Railway, cliquer sur votre projet
2. Aller dans **Settings** → **Networking**
3. Cliquer **Generate Domain**
4. Copier l'URL générée → exemple : `kidtrack-production.up.railway.app`

### Étape 5 : Mettre à jour le code Arduino
Ouvrir `kidtrack_emetteur_v2.ino` et modifier cette ligne :
```cpp
const char* SERVER = "kidtrack-production.up.railway.app";
```
Retéléverser le code sur le XIAO ESP32C3.

### Étape 6 : Accéder à la plateforme
Ouvrir dans un navigateur : `https://kidtrack-production.up.railway.app`

---

## ✅ MÉTHODE 2 — Render (Alternative gratuite)

### Étape 1 : Créer un compte sur https://render.com
### Étape 2 : New → Web Service → Connect GitHub repo
### Étape 3 : Remplir le formulaire :
- **Name** : kidtrack
- **Runtime** : Node
- **Build Command** : `npm install`
- **Start Command** : `node server.js`
- **Plan** : Free
### Étape 4 : Cliquer **Create Web Service**
### Étape 5 : Copier l'URL (ex: `kidtrack.onrender.com`)

---

## ✅ MÉTHODE 3 — Test en local (sans internet)

Si vous voulez tester sur votre ordinateur :

```bash
# 1. Installer Node.js depuis https://nodejs.org

# 2. Ouvrir un terminal dans le dossier kidtrack

# 3. Installer les dépendances
npm install

# 4. Démarrer le serveur
node server.js

# 5. Ouvrir dans le navigateur
# http://localhost:3000
```

Pour que le SIM800L accède à votre serveur local,
vous devez utiliser ngrok (tunnel temporaire) :

```bash
# Installer ngrok : https://ngrok.com
ngrok http 3000
# ngrok génère une URL publique temporaire → utiliser dans le .ino
```

---

## 🔌 Routes API disponibles

| Méthode | Route | Description | Appelé par |
|---------|-------|-------------|------------|
| POST | /api/register | Enregistrer un appareil | Arduino au démarrage |
| POST | /api/location | Envoyer position GPS | Arduino toutes les 30s |
| POST | /api/connect | Login parent avec code | Plateforme web |
| GET  | /api/status/:code | Lire toutes les données | Plateforme web (polling) |
| POST | /api/geofence/:code | Créer une zone | Plateforme web |
| DELETE | /api/geofence/:code/:id | Supprimer une zone | Plateforme web |
| POST | /api/sms-config/:code | Config SMS | Plateforme web |

---

## 📡 Flux de données complet

```
[NEO-6M GPS]
     ↓ UART (coordonnées NMEA)
[XIAO ESP32C3]
     ↓ traitement TinyGPSPlus
[SIM800L GPRS]
     ↓ HTTP POST /api/location (réseau cellulaire)
[Serveur Railway]
     ↓ stockage en mémoire + vérif geofences
[Plateforme Web]
     ↓ polling GET /api/status/:code (toutes les 15s)
[Navigateur Parent]
     → carte temps réel + alertes
```

---

## 🔑 Comment fonctionne le code d'accès

1. L'Arduino démarre et envoie `POST /api/register` avec `device_id` et `child_name`
2. Le serveur génère un code unique à 6 caractères (ex: `A3F9B2`)
3. Le code s'affiche dans le Moniteur Série Arduino IDE
4. Le parent entre ce code sur la plateforme web
5. La plateforme envoie `POST /api/connect` avec le code
6. Si valide, le serveur renvoie les infos du device
7. La plateforme commence le polling avec ce code

---

## ⚙️ Variables d'environnement sur Railway

Dans Railway → votre projet → **Variables** :

| Variable | Valeur | Description |
|----------|--------|-------------|
| PORT | (auto) | Railway gère ça automatiquement |
| SECRET_KEY | votre_clé_secrète | Pour sécuriser les sessions |

---

## 📱 Activer les vrais SMS (optionnel)

Pour envoyer de vrais SMS, créer un compte Twilio (gratuit pour test) :
1. https://www.twilio.com → Free Trial
2. Obtenir : Account SID, Auth Token, numéro Twilio
3. Dans Railway Variables, ajouter :
   - TWILIO_SID = ACxxxxxxxx
   - TWILIO_TOKEN = xxxxxxxx
   - TWILIO_FROM = +12345678901
4. Dans `server.js`, décommenter la section Twilio

---

## ❓ Problèmes fréquents

**Le SIM800L ne se connecte pas**
→ Vérifier l'APN de votre opérateur (souvent "internet" ou "web")
→ Vérifier l'alimentation (besoin de 4.2V, 2A minimum)

**Le GPS ne trouve pas de fix**
→ Placer l'antenne à l'extérieur ou près d'une fenêtre
→ Attendre 2-3 minutes au premier démarrage (cold start)

**Le code d'accès est refusé**
→ Vérifier que le serveur Railway est bien démarré
→ Vérifier l'URL dans le .ino (sans https:// pour le SIM800L)

**Railway s'arrête après 30 minutes (plan gratuit)**
→ Utiliser Render.com qui garde le service actif plus longtemps
→ Ou ajouter un ping automatique (UptimeRobot)
