// --- CONFIGURATION DE L'API BASE DES SALONS (REST VIA AJAX) ---
// Remplacer "VOTRE_PROJECT_ID" par l'ID réel de ton projet Firebase
const BASE_API_URL = "https://VOTRE_PROJECT_ID-default-rtdb.firebaseio.com/rooms";

// --- INITIALISATION DU SALON ---
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');
if (!roomId) {
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
    window.history.pushState({}, '', `?room=${roomId}`);
}

// Variables d'état local
let localRole = ""; 
let localPlayerName = localStorage.getItem('songo_pseudo') || "Joueur_" + Math.floor(Math.random() * 99);

// Variables du moteur de jeu synchronisées via AJAX
let board = [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5];
let scores = [0, 0];
let currentPlayer = "Sud";
let gameActive = true;
let playersSync = { Sud: { name: "En attente...", status: "offline" }, Nord: { name: "En attente...", status: "offline" } };

const pitLabels = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "N1", "N2", "N3", "N4", "N5", "N6", "N7"];

// Dom Elements
const menuModal = document.getElementById('menu-modal');
const rulesModal = document.getElementById('rules-modal');
const generalRulesModal = document.getElementById('general-rules-modal');
const inputName = document.getElementById('input-player-name');
inputName.value = localPlayerName;

// --- FONCTIONS LOGIQUES AJAX (COMMUNICATION AVEC LE SERVEUR) ---

// 1. Requête AJAX GET : Récupère l'état actuel du salon
async function ajaxGetRoomData() {
    try {
        let response = await fetch(`${BASE_API_URL}/${roomId}.json`);
        let data = await response.json();
        
        if (!data) {
            // Si le salon n'existe pas côté serveur, on le crée via un PUT AJAX
            await ajaxPutInitialRoom(roomId, true);
            return;
        }

        // Transfert des données reçues par AJAX dans nos variables
        board = data.board || board;
        scores = data.scores || scores;
        currentPlayer = data.currentPlayer || currentPlayer;
        gameActive = data.gameActive !== undefined ? data.gameActive : gameActive;
        playersSync = data.players || playersSync;

        // Détermination du rôle à la première connexion
        if (!localRole) {
            if (!playersSync.Sud || playersSync.Sud.status === "offline" || playersSync.Sud.name === localPlayerName) {
                localRole = "Sud";
            } else if (!playersSync.Nord || playersSync.Nord.status === "offline" || playersSync.Nord.name === localPlayerName) {
                localRole = "Nord";
            } else {
                localRole = "Spectateur";
            }
            document.getElementById('local-role-val').innerText = localRole;
            document.getElementById('menu-player-role').innerText = localRole;

            if (localRole === "Sud" || localRole === "Nord") {
                await ajaxPatchPlayerStatus(localRole, localPlayerName, "online");
            }
        }

        if (data.lastMoveLog) {
            document.getElementById('last-move-txt').innerText = data.lastMoveLog;
            appendHistoryOnce(data.lastMoveLog);
        }

        updateUI();
    } catch (error) {
        console.error("Erreur AJAX lors de la récupération :", error);
    }
}

// 2. Requête AJAX PUT : Initialise ou écrase un salon entier
async function ajaxPutInitialRoom(targetRoomId, assignLocal) {
    const freshData = {
        board: [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5],
        scores: [0, 0],
        currentPlayer: "Sud",
        gameActive: true,
        lastMoveLog: "Partie lancée via requêtes AJAX !",
        players: {
            Sud: { name: assignLocal ? localPlayerName : "En attente...", status: assignLocal ? "online" : "offline" },
            Nord: { name: "En attente...", status: "offline" }
        }
    };

    try {
        await fetch(`${BASE_API_URL}/${targetRoomId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(freshData)
        });
        if (assignLocal) {
            localRole = "Sud";
            document.getElementById('local-role-val').innerText = localRole;
            document.getElementById('menu-player-role').innerText = localRole;
        }
    } catch (error) {
        console.error("Erreur AJAX PUT :", error);
    }
}

// 3. Requête AJAX PATCH : Met à jour uniquement l'état du jeu après un coup
async function ajaxPatchGameState(updatedFields) {
    try {
        await fetch(`${BASE_API_URL}/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedFields)
        });
    } catch (error) {
        console.error("Erreur AJAX PATCH (State) :", error);
    }
}

// 4. Requête AJAX PATCH : Met à jour le pseudo/statut d'un joueur
async function ajaxPatchPlayerStatus(role, name, status) {
    if (role !== "Sud" && role !== "Nord") return;
    try {
        let pData = {};
        pData[role] = { name: name, status: status };
        await fetch(`${BASE_API_URL}/${roomId}/players.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pData)
        });
    } catch (error) {
        console.error("Erreur AJAX PATCH (Player) :", error);
    }
}

// --- BOUCLE DE SYNCHRONISATION AJAX AUTOMATIQUE (POLLING) ---
// Comme AJAX ne gère pas nativement le push en direct, on interroge le serveur toutes les 2 secondes
setInterval(() => {
    ajaxGetRoomData();
}, 2000);

// Lancement direct au chargement initial
ajaxGetRoomData();


// --- MOTEUR DE RENDU GRAPHIQUE ---
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

// --- MECANIQUE DE SEMAILLE DU SONGO ---
async function move(startIndex) {
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

    // Envoi synchrone du coup joué via AJAX PATCH
    await ajaxPatchGameState({
        board: board,
        scores: scores,
        currentPlayer: nextPlayer,
        gameActive: nextGameActive,
        lastMoveLog: logMsg
    });

    updateUI();
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

// --- INTERACTION DU MENU ET EVENEMENTS ---
document.getElementById('btn-open-menu').addEventListener('click', () => { renderSavedRooms(); menuModal.classList.remove('hidden'); });
document.getElementById('btn-close-menu').addEventListener('click', () => menuModal.classList.add('hidden'));
document.getElementById('btn-menu-annuler').addEventListener('click', () => menuModal.classList.add('hidden'));

document.getElementById('btn-prise').addEventListener('click', () => { menuModal.classList.add('hidden'); rulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-rules').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-back-to-menu').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

document.getElementById('btn-general-rules').addEventListener('click', () => { menuModal.classList.add('hidden'); generalRulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-general-rules').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-rules-back-to-menu').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

document.querySelectorAll('.pit').forEach(p => {
    p.addEventListener('click', () => move(parseInt(p.getAttribute('data-index'))));
});
document.getElementById('btn-reset').addEventListener('click', () => ajaxPutInitialRoom(roomId, false));

inputName.addEventListener('change', () => {
    localPlayerName = inputName.value.trim() || "Anonyme";
    localStorage.setItem('songo_pseudo', localPlayerName);
    ajaxPatchPlayerStatus(localRole, localPlayerName, "online");
});


// --- RECHERCHE AJAX DE SALON UNIQUE ET CRÉATION DIRECTE ---
async function generateUniqueRoomIdViaAjax() {
    const candidateId = Math.floor(1000 + Math.random() * 9000).toString();
    try {
        let response = await fetch(`${BASE_API_URL}/${candidateId}.json`);
        let data = await response.json();
        if (data !== null) {
            // Si le salon existe déjà, on relance récursivement la recherche AJAX
            return await generateUniqueRoomIdViaAjax();
        }
        return candidateId;
    } catch (e) {
        return candidateId;
    }
}

document.getElementById('btn-generate-room').addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-room');
    btn.innerText = "⚡ Création via AJAX...";
    btn.disabled = true;

    let uniqueId = await generateUniqueRoomIdViaAjax();
    
    // Initialise le nouveau salon sur le serveur
    await ajaxPutInitialRoom(uniqueId, false);
    
    // Ouvre immédiatement la page de jeu sur ce nouveau salon
    window.location.href = `index.html?room=${uniqueId}`;
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const inputRoom = document.getElementById('input-join-room').value.trim();
    if (inputRoom.length === 4) {
        window.location.href = `index.html?room=${inputRoom}`;
    }
});


// --- GESTION DES SALONS SAUVEGARDÉS (LOCAL STORAGE) ---
document.getElementById('btn-save-current-room').addEventListener('click', () => {
    let saved = JSON.parse(localStorage.getItem('songo_saved_rooms')) || [];
    if (!saved.includes(roomId)) {
        saved.push(roomId);
        localStorage.setItem('songo_saved_rooms', JSON.stringify(saved));
        alert(`Salon #${roomId} sauvegardé !`);
        renderSavedRooms();
    }
});

function renderSavedRooms() {
    const container = document.getElementById('saved-rooms-list');
    let saved = JSON.parse(localStorage.getItem('songo_saved_rooms')) || [];
    if (saved.length === 0) {
        container.innerHTML = `<span style="color: gray; font-style: italic; text-align: center;">Aucun salon sauvegardé</span>`;
        return;
    }
    container.innerHTML = "";
    saved.forEach(id => {
        const row = document.createElement('div');
        row.style = "display:flex; justify-content:space-between; padding:4px; background:rgba(255,255,255,0.7); margin-bottom:2px; border-radius:4px;";
        row.innerHTML = `<span style="cursor:pointer; font-weight:bold;">Salon #${id}</span><span style="cursor:pointer;">❌</span>`;
        
        row.firstChild.addEventListener('click', () => { window.location.href = `index.html?room=${id}`; });
        row.lastChild.addEventListener('click', (e) => {
            e.stopPropagation();
            saved = saved.filter(r => r !== id);
            localStorage.setItem('songo_saved_rooms', JSON.stringify(saved));
            renderSavedRooms();
        });
        container.appendChild(row);
    });
}
renderSavedRooms();