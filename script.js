import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// CONFIGURATION FIREBASE (À REMPLACER PAR VOS PROPRES CLÉS DE PROJET CONFIGURÉES)
const firebaseConfig = {
    apiKey: "VOTRE_API_KEY",
    authDomain: "VOTRE_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://VOTRE_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "VOTRE_PROJECT_ID",
    storageBucket: "VOTRE_PROJECT_ID.appspot.com",
    messagingSenderId: "VOTRE_ID",
    appId: "VOTRE_APP_ID"
};

// Initialisation de l'instance réseau
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- GESTION DU SALON MULTIJOUEUR ---
// Recherche ou assignation automatique d'une Room ID via l'URL (?room=XXXX)
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');
if (!roomId) {
    roomId = Math.floor(1000 + Math.random() * 9000).toString(); // Salon aléatoire à 4 chiffres
    window.history.pushState({}, '', `?room=${roomId}`);
}

// Variables locales de l'état du joueur local
let localRole = ""; // Affecté automatiquement : "Sud" ou "Nord"
let localPlayerName = localStorage.getItem('songo_pseudo') || "Joueur_" + Math.floor(Math.random() * 99);

// Références de synchronisation Database
const roomRef = ref(db, `rooms/${roomId}`);

// --- VARIABLES LOCALES DE JEU SYNC ---
let board = [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5];
let scores = [0, 0];
let currentPlayer = "Sud";
let gameActive = true;
let playersSync = { Sud: { name: "En attente...", status: "offline" }, Nord: { name: "En attente...", status: "offline" } };

const pitLabels = ["S7", "S6", "S5", "S4", "S3", "S2", "S1", "N1", "N2", "N3", "N4", "N5", "N6", "N7"];

// --- INITIALISATION DES ANCHORS MODALES ---
const menuModal = document.getElementById('menu-modal');
const rulesModal = document.getElementById('rules-modal');
const generalRulesModal = document.getElementById('general-rules-modal');
const inputName = document.getElementById('input-player-name');

inputName.value = localPlayerName;

// --- FORCE LANDSCAPE ---
function forceLandscape() {
    if (screen.orientation && screen.orientation.lock) { screen.orientation.lock('landscape').catch(()=>{}); }
}
window.addEventListener('load', forceLandscape);
document.addEventListener('click', forceLandscape);

// --- SYNC INPUTS ---
inputName.addEventListener('input', () => {
    localPlayerName = inputName.value.trim() || "Anonyme";
    localStorage.setItem('songo_pseudo', localPlayerName);
    if(localRole === "Sud" || localRole === "Nord") {
        update(ref(db, `rooms/${roomId}/players/${localRole}`), { name: localPlayerName, status: "online" });
    }
});

// --- ÉCOUTE RÉSEAU FIREBASE (RÉCEPTION DES DONNÉES EN DIRECT) ---
onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    
    // Si la room n'existe pas encore sur Firebase, on l'initialise
    if (!data) {
        initializeFirebaseRoom();
        return;
    }

    // Récupération de l'état global partagé
    board = data.board;
    scores = data.scores;
    currentPlayer = data.currentPlayer;
    gameActive = data.gameActive;
    playersSync = data.players || playersSync;

    // Détermination automatique du rôle (Sud si vide, Nord si Sud occupé, ou Spectateur)
    if (!localRole) {
        if (!data.players || !data.players.Sud || data.players.Sud.status === "offline") {
            localRole = "Sud";
        } else if (!data.players.Nord || data.players.Nord.status === "offline") {
            localRole = "Nord";
        } else {
            localRole = "Spectateur";
        }
        document.getElementById('local-role-val').innerText = localRole;
        document.getElementById('menu-player-role').innerText = localRole;
        
        // Validation de présence en ligne
        if (localRole === "Sud" || localRole === "Nord") {
            update(ref(db, `rooms/${roomId}/players/${localRole}`), { name: localPlayerName, status: "online" });
        }
    }

    // Journalisation du dernier coup reçu
    if (data.lastMoveLog) {
        document.getElementById('last-move-txt').innerText = data.lastMoveLog;
        appendHistoryOnce(data.lastMoveLog);
    }

    updateUI();
});

function initializeFirebaseRoom() {
    set(roomRef, {
        board: [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5],
        scores: [0, 0],
        currentPlayer: "Sud",
        gameActive: true,
        lastMoveLog: "La salle multijoueur vient d'ouvrir.",
        players: {
            Sud: { name: localPlayerName, status: "online" },
            Nord: { name: "En attente...", status: "offline" }
        }
    });
    localRole = "Sud";
    document.getElementById('local-role-val').innerText = localRole;
    document.getElementById('menu-player-role').innerText = localRole;
}

// --- ENGINE DE RENDU INTERFACE ---
function updateUI() {
    document.getElementById('menu-room-id').innerText = `#${roomId}`;
    document.getElementById('top-room-id').innerText = `#${roomId}`;

    // Mise à jour des noms issus de la base Firebase
    const nameSud = playersSync.Sud ? playersSync.Sud.name : "En attente...";
    const nameNord = playersSync.Nord ? playersSync.Nord.name : "En attente...";

    document.getElementById('title-side-sud').innerText = nameSud;
    document.getElementById('title-side-nord').innerText = nameNord;

    // Badges en ligne / hors ligne
    updateStatusBadge('status-sud', playersSync.Sud);
    updateStatusBadge('status-nord', playersSync.Nord);

    // Scores
    document.getElementById('huge-score-sud').innerText = scores[0];
    document.getElementById('huge-score-nord').innerText = scores[1];
    document.getElementById('badge-g-sud').innerText = scores[0];
    document.getElementById('badge-g-nord').innerText = scores[1];

    const currentTurnName = currentPlayer === "Sud" ? nameSud : nameNord;
    document.getElementById('current-turn-val').innerText = currentTurnName;

    // Message d'action central contextuel
    if (!gameActive) {
        document.getElementById('center-message').innerText = "Partie terminée !";
        document.getElementById('game-state-val').innerText = "Terminé";
    } else if (localRole === "Spectateur") {
        document.getElementById('center-message').innerText = `Tour de : ${currentTurnName}`;
        document.getElementById('game-state-val').innerText = "Spectateur";
    } else if (currentPlayer === localRole) {
        document.getElementById('center-message').innerText = "À vous de jouer !";
        document.getElementById('game-state-val').innerText = "Votre tour";
    } else {
        document.getElementById('center-message').innerText = `Attente de ${currentTurnName}...`;
        document.getElementById('game-state-val').innerText = "Attente adversaire";
    }

    // Graines dans les trous
    for(let idx = 0; idx < 14; idx++) {
        const count = board[idx];
        const lbl = document.getElementById(`lbl-${idx}`);
        if(lbl) lbl.innerText = count;

        const pitElement = document.querySelector(`.pit[data-index="${idx}"]`);
        if(pitElement) {
            const area = pitElement.querySelector('.seeds-area');
            area.innerHTML = '';
            for(let i = 0; i < Math.min(count, 12); i++) {
                const s = document.createElement('div');
                s.classList.add('seed');
                area.appendChild(s);
            }
        }
    }
    renderGrenier('seeds-g-nord', scores[1]);
    renderGrenier('seeds-g-sud', scores[0]);
}

function updateStatusBadge(id, pData) {
    const el = document.getElementById(id);
    if (!el) return;
    if (pData && pData.status === "online") {
        el.innerText = "En ligne";
        el.classList.add('online');
    } else {
        el.innerText = "Déconnecté";
        el.classList.remove('online');
    }
}

function renderGrenier(id, count) {
    const el = document.getElementById(id);
    if(!el) return; el.innerHTML = '';
    for(let i = 0; i < Math.min(count, 24); i++) {
        const s = document.createElement('div'); s.classList.add('seed'); el.appendChild(s);
    }
}

// --- LOGIQUE DU COUP SEMAILLE & INTEGRATION RESEAU ---
function move(startIndex) {
    if (!gameActive) return;
    // Blocage si ce n'est pas le tour du joueur local ou s'il est spectateur
    if (localRole === "Spectateur" || currentPlayer !== localRole) return;
    if (currentPlayer === "Sud" && (startIndex < 0 || startIndex > 6)) return;
    if (currentPlayer === "Nord" && (startIndex < 7 || startIndex > 13)) return;
    if (board[startIndex] === 0) return;

    let seeds = board[startIndex];
    board[startIndex] = 0;
    let currentIndex = startIndex;

    while (seeds > 0) {
        currentIndex = (currentIndex + 1) % 14;
        if (currentIndex === startIndex) continue;
        board[currentIndex]++;
        seeds--;
    }

    let captured = 0;
    let isOpponentSide = (currentPlayer === "Sud" && currentIndex >= 7) || (currentPlayer === "Nord" && currentIndex <= 6);
    if (isOpponentSide && [2, 3, 4].includes(board[currentIndex])) {
        captured = board[currentIndex];
        board[currentIndex] = 0;
    }

    const activeName = currentPlayer === "Sud" ? playersSync.Sud.name : playersSync.Nord.name;
    let nextPlayer = currentPlayer === "Sud" ? "Nord" : "Sud";
    let logMsg = `${activeName} a joué ${pitLabels[startIndex]} (Prise : ${captured})`;

    if (currentPlayer === "Sud") {
        scores[0] += captured;
    } else {
        scores[1] += captured;
    }

    // Vérification fin de partie locale
    let nextGameActive = true;
    if (scores[0] >= 40 || scores[1] >= 40 || board.reduce((a,b)=>a+b, 0) < 10) {
        nextGameActive = false;
        logMsg += " - Partie Terminée !";
    }

    // EXPÉDITION DU NOUVEL ÉTAT VERS LA CONFIGURATION FIREBASE
    update(roomRef, {
        board: board,
        scores: scores,
        currentPlayer: nextPlayer,
        gameActive: nextGameActive,
        lastMoveLog: logMsg
    });
}

let lastLoggedText = "";
function appendHistoryOnce(msg) {
    if (msg === lastLoggedText) return;
    lastLoggedText = msg;
    const historyList = document.getElementById('history-list');
    const li = document.createElement('li');
    li.innerText = msg;
    historyList.insertBefore(li, historyList.firstChild);
}

function resetGameOnline() {
    update(roomRef, {
        board: [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5],
        scores: [0, 0],
        currentPlayer: "Sud",
        gameActive: true,
        lastMoveLog: "Le plateau a été réinitialisé par un joueur."
    });
    document.getElementById('history-list').innerHTML = '';
}

// --- DISPATCHER ROUTING ÉVÉNEMENTS ---
document.getElementById('btn-open-menu').addEventListener('click', () => menuModal.classList.remove('hidden'));
document.getElementById('btn-close-menu').addEventListener('click', () => menuModal.classList.add('hidden'));
document.getElementById('btn-menu-annuler').addEventListener('click', () => menuModal.classList.add('hidden'));
document.getElementById('btn-menu-nouvelle-partie').addEventListener('click', () => {
    menuModal.classList.add('hidden');
    resetGameOnline();
});

// Modales Règles & Prises
document.getElementById('btn-prise').addEventListener('click', () => { menuModal.classList.add('hidden'); rulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-rules').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-back-to-menu').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

document.getElementById('btn-general-rules').addEventListener('click', () => { menuModal.classList.add('hidden'); generalRulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-general-rules').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-rules-back-to-menu').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

// Thèmes visuels
const btnTheme = document.getElementById('btn-theme');
btnTheme.addEventListener('click', () => {
    const root = document.documentElement;
    if (root.getAttribute('data-theme') === 'dark') {
        root.setAttribute('data-theme', 'light'); btnTheme.innerText = '🌙 Sombre';
    } else {
        root.setAttribute('data-theme', 'dark'); btnTheme.innerText = '☀️ Éclairé';
    }
});

// Actionneurs sur les trous
document.querySelectorAll('.pit').forEach(p => {
    p.addEventListener('click', () => move(parseInt(p.getAttribute('data-index'))));
});
document.getElementById('btn-reset').addEventListener('click', resetGameOnline);

// Nettoyage si le joueur quitte ou ferme l'onglet
window.addEventListener('beforeunload', () => {
    if (localRole === "Sud" || localRole === "Nord") {
        update(ref(db, `rooms/${roomId}/players/${localRole}`), { status: "offline" });
    }
});