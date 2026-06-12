import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

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
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');
if (!roomId) {
    roomId = Math.floor(1000 + Math.random() * 9000).toString(); // Salon par défaut
    window.history.pushState({}, '', `?room=${roomId}`);
}

// Variables locales de l'état du joueur local
let localRole = ""; // "Sud", "Nord" ou "Spectateur"
let localPlayerName = localStorage.getItem('songo_pseudo') || "Joueur_" + Math.floor(Math.random() * 99);

// Référence de synchronisation Database
const roomRef = ref(db, `rooms/${roomId}`);

// --- VARIABLES LOCALES DE JEU SYNC ---
let board = [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5];
let scores = [0, 0];
let currentPlayer = "Sud";
let gameActive = true;
let playersSync = { Sud: { name: "En attente...", status: "offline" }, Nord: { name: "En attente...", status: "offline" } };

const pitLabels = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "N1", "N2", "N3", "N4", "N5", "N6", "N7"];

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
    
    if (!data) {
        initializeFirebaseRoom(roomId, true);
        return;
    }

    board = data.board;
    scores = data.scores;
    currentPlayer = data.currentPlayer;
    gameActive = data.gameActive;
    playersSync = data.players || playersSync;

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
        
        if (localRole === "Sud" || localRole === "Nord") {
            update(ref(db, `rooms/${roomId}/players/${localRole}`), { name: localPlayerName, status: "online" });
        }
    }

    if (data.lastMoveLog) {
        document.getElementById('last-move-txt').innerText = data.lastMoveLog;
        appendHistoryOnce(data.lastMoveLog);
    }

    updateUI();
});

function initializeFirebaseRoom(targetRoomId, assignLocal = false) {
    const targetRef = ref(db, `rooms/${targetRoomId}`);
    set(targetRef, {
        board: [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5],
        scores: [0, 0],
        currentPlayer: "Sud",
        gameActive: true,
        lastMoveLog: "Une nouvelle partie de Songo commence !",
        players: {
            Sud: { name: assignLocal ? localPlayerName : "En attente...", status: assignLocal ? "online" : "offline" },
            Nord: { name: "En attente...", status: "offline" }
        }
    });
    if (assignLocal) {
        localRole = "Sud";
        document.getElementById('local-role-val').innerText = localRole;
        document.getElementById('menu-player-role').innerText = localRole;
    }
}

// --- ENGINE DE RENDU INTERFACE ---
function updateUI() {
    document.getElementById('menu-room-id').innerText = `#${roomId}`;
    document.getElementById('top-room-id').innerText = `#${roomId}`;

    const nameSud = playersSync.Sud ? playersSync.Sud.name : "En attente...";
    const nameNord = playersSync.Nord ? playersSync.Nord.name : "En attente...";

    document.getElementById('title-side-sud').innerText = nameSud;
    document.getElementById('title-side-nord').innerText = nameNord;

    updateStatusBadge('status-sud', playersSync.Sud);
    updateStatusBadge('status-nord', playersSync.Nord);

    document.getElementById('huge-score-sud').innerText = scores[0];
    document.getElementById('huge-score-nord').innerText = scores[1];
    document.getElementById('badge-g-sud').innerText = scores[0];
    document.getElementById('badge-g-nord').innerText = scores[1];

    const currentTurnName = currentPlayer === "Sud" ? nameSud : nameNord;
    document.getElementById('current-turn-val').innerText = currentTurnName;

    if (!gameActive) {
        document.getElementById('center-message').innerText = "Partie terminée !";
    } else if (localRole === "Spectateur") {
        document.getElementById('center-message').innerText = `Tour de : ${currentTurnName}`;
    } else if (currentPlayer === localRole) {
        document.getElementById('center-message').innerText = "À vous de jouer !";
    } else {
        document.getElementById('center-message').innerText = `Attente de ${currentTurnName}...`;
    }

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

// --- LOGIQUE DU SEMAILLE & PRISE ---
function move(startIndex) {
    if (!gameActive) return;
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

    let nextGameActive = true;
    if (scores[0] >= 40 || scores[1] >= 40 || board.reduce((a,b)=>a+b, 0) < 10) {
        nextGameActive = false;
        const winnerName = scores[0] >= 40 ? playersSync.Sud.name : (scores[1] >= 40 ? playersSync.Nord.name : "Égalité");
        logMsg += ` - Partie Terminée ! Victoire de ${winnerName}`;
    }

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
        lastMoveLog: "Le plateau a été réinitialisé."
    });
    document.getElementById('history-list').innerHTML = '';
}

// --- CONFIGURATION DES ÉCOUTEURS D'ÉVÉNEMENTS ---
document.getElementById('btn-open-menu').addEventListener('click', () => {
    renderSavedRooms();
    menuModal.classList.remove('hidden');
});
document.getElementById('btn-close-menu').addEventListener('click', () => menuModal.classList.add('hidden'));
document.getElementById('btn-menu-annuler').addEventListener('click', () => menuModal.classList.add('hidden'));

document.getElementById('btn-prise').addEventListener('click', () => { menuModal.classList.add('hidden'); rulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-rules').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-back-to-menu').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

document.getElementById('btn-general-rules').addEventListener('click', () => { menuModal.classList.add('hidden'); generalRulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-general-rules').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-rules-back-to-menu').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

const btnTheme = document.getElementById('btn-theme');
btnTheme.addEventListener('click', () => {
    const root = document.documentElement;
    if (root.getAttribute('data-theme') === 'dark') {
        root.setAttribute('data-theme', 'light'); btnTheme.innerText = '🌙 Sombre';
    } else {
        root.setAttribute('data-theme', 'dark'); btnTheme.innerText = '☀️ Éclairé';
    }
});

document.querySelectorAll('.pit').forEach(p => {
    p.addEventListener('click', () => move(parseInt(p.getAttribute('data-index'))));
});
document.getElementById('btn-reset').addEventListener('click', resetGameOnline);


// --- LOGIQUE UNIQUE : RECHERCHE RÉCURSIVE & OUVRE LE NOUVEAU SALON ---
async function generateUniqueRoomId() {
    const candidateId = Math.floor(1000 + Math.random() * 9000).toString();
    const candidateRef = ref(db, `rooms/${candidateId}`);
    
    try {
        const snapshot = await get(candidateRef);
        if (snapshot.exists()) {
            return await generateUniqueRoomId(); 
        }
        return candidateId;
    } catch (error) {
        console.error("Erreur de validation d'ID unique :", error);
        return candidateId;
    }
}

document.getElementById('btn-generate-room').addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-room');
    btn.innerText = "⚡ Création du salon...";
    btn.disabled = true;

    // 1. Trouve un identifiant unique disponible
    const uniqueRoomId = await generateUniqueRoomId();
    
    // 2. Initialise immédiatement la structure de la nouvelle partie sur Firebase
    await initializeFirebaseRoom(uniqueRoomId, false);
    
    // 3. Redirige immédiatement l'utilisateur sur la page pour débuter le jeu
    window.location.href = `index.html?room=${uniqueRoomId}`;
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const inputRoom = document.getElementById('input-join-room').value.trim();
    if (inputRoom.length === 4) {
        window.location.href = `index.html?room=${inputRoom}`;
    } else {
        alert("Veuillez entrer un ID valide à 4 chiffres.");
    }
});


// --- SYSTEME DE STOCKAGE / SAUVEGARDE DES SALONS LOCAUX ---
document.getElementById('btn-save-current-room').addEventListener('click', () => {
    let savedRooms = JSON.parse(localStorage.getItem('songo_saved_rooms')) || [];
    if (!savedRooms.includes(roomId)) {
        savedRooms.push(roomId);
        localStorage.setItem('songo_saved_rooms', JSON.stringify(savedRooms));
        alert(`Salon #${roomId} ajouté à vos favoris !`);
        renderSavedRooms();
    } else {
        alert("Ce salon fait déjà partie de votre liste de sauvegarde.");
    }
});

function renderSavedRooms() {
    const container = document.getElementById('saved-rooms-list');
    let savedRooms = JSON.parse(localStorage.getItem('songo_saved_rooms')) || [];
    
    if (savedRooms.length === 0) {
        container.innerHTML = `<span style="color: gray; font-style: italic; text-align: center;">Aucun salon sauvegardé</span>`;
        return;
    }
    
    container.innerHTML = "";
    savedRooms.forEach(id => {
        const row = document.createElement('div');
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.background = "var(--bg-card)";
        row.style.padding = "4px 8px";
        row.style.borderRadius = "4px";
        row.style.border = "1px solid var(--border-btn)";

        const link = document.createElement('span');
        link.innerText = `Salon #${id}`;
        link.style.cursor = "pointer";
        link.style.fontWeight = "bold";
        link.style.flex = "1";
        link.addEventListener('click', () => {
            window.location.href = `index.html?room=${id}`;
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = "❌";
        deleteBtn.style.border = "none";
        deleteBtn.style.background = "none";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.fontSize = "0.75rem";
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            savedRooms = savedRooms.filter(r => r !== id);
            localStorage.setItem('songo_saved_rooms', JSON.stringify(savedRooms));
            renderSavedRooms();
        });

        row.appendChild(link);
        row.appendChild(deleteBtn);
        container.appendChild(row);
    });
}

// Initialisation au chargement de l'écran principal
renderSavedRooms();

window.addEventListener('beforeunload', () => {
    if (localRole === "Sud" || localRole === "Nord") {
        update(ref(db, `rooms/${roomId}/players/${localRole}`), { status: "offline" });
    }
});