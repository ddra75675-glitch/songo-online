// =========================================================================
//  SONGO ONLINE - ARCHITECTURE COMPLÈTE (AJAX, RÔLES & THEMES)
// =========================================================================

// CONFIGURATION : Remplacez par l'URL réelle de votre Realtime Database Firebase
const BASE_API_URL = "https://VOTRE_PROJECT_ID-default-rtdb.firebaseio.com/rooms";

// 1. ANALYSE ET GESTION DU SALON DANS L'URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

if (!roomId) {
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
    window.history.pushState({}, '', `?room=${roomId}`);
}

// 2. ÉTAT DU JOUEUR LOCAL ET DU JEU
let localRole = ""; // Dynamique : "Sud", "Nord" ou "Spectateur"
let localPlayerName = localStorage.getItem('songo_pseudo') || "Joueur_" + Math.floor(Math.random() * 99);

let board = [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5];
let scores = [0, 0]; // [0] = Sud, [1] = Nord
let currentPlayer = "Sud";
let gameActive = true;
let playersSync = { 
    Sud: { name: "En attente...", status: "offline" }, 
    Nord: { name: "En attente...", status: "offline" } 
};

const pitLabels = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "N1", "N2", "N3", "N4", "N5", "N6", "N7"];

// Liaisons DOM principales
const menuModal = document.getElementById('menu-modal');
const rulesModal = document.getElementById('rules-modal');
const generalRulesModal = document.getElementById('general-rules-modal');
const inputName = document.getElementById('input-player-name');
inputName.value = localPlayerName;

// =========================================================================
//  SECTION INTERNET : SYNCHRONISATION VIA FLUX REST AJAX
// =========================================================================

/**
 * Récupère en continu l'état du salon sur le serveur
 */
async function ajaxGetRoomData() {
    try {
        let response = await fetch(`${BASE_API_URL}/${roomId}.json`);
        let data = await response.json();
        
        if (!data) {
            await ajaxPutInitialRoom(roomId, true);
            return;
        }

        board = data.board || board;
        scores = data.scores || scores;
        currentPlayer = data.currentPlayer || currentPlayer;
        gameActive = data.gameActive !== undefined ? data.gameActive : gameActive;
        playersSync = data.players || {};

        // --- ALGORITHME D'ATTRIBUTION UNIQUE DES RÔLES (MAX 2 JOUEURS) ---
        if (!localRole) {
            if (!playersSync.Sud || playersSync.Sud.status === "offline" || playersSync.Sud.name === localPlayerName) {
                localRole = "Sud";
            } 
            else if (!playersSync.Nord || playersSync.Nord.status === "offline" || playersSync.Nord.name === localPlayerName) {
                localRole = "Nord";
            } 
            else {
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
        console.error("Erreur de rafraîchissement AJAX :", error);
    }
}

/**
 * Crée un salon vide ou écrase l'ancien lors d'une réinitialisation
 */
async function ajaxPutInitialRoom(targetRoomId, assignLocal) {
    const initPayload = {
        board: [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5],
        scores: [0, 0],
        currentPlayer: "Sud",
        gameActive: true,
        lastMoveLog: "Le jeu commence ! Bonne chance.",
        players: {
            Sud: { name: assignLocal ? localPlayerName : "En attente...", status: assignLocal ? "online" : "offline" },
            Nord: { name: "En attente...", status: "offline" }
        }
    };

    try {
        await fetch(`${BASE_API_URL}/${targetRoomId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(initPayload)
        });
        if (assignLocal) {
            localRole = "Sud";
            document.getElementById('local-role-val').innerText = localRole;
            document.getElementById('menu-player-role').innerText = localRole;
        }
    } catch (error) {
        console.error("Erreur lors du PUT initial :", error);
    }
}

async function ajaxPatchGameState(updatedFields) {
    try {
        await fetch(`${BASE_API_URL}/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedFields)
        });
    } catch (error) {
        console.error("Erreur d'envoi du coup :", error);
    }
}

async function ajaxPatchPlayerStatus(role, name, status) {
    if (role !== "Sud" && role !== "Nord") return;
    try {
        let updateObject = {};
        updateObject[role] = { name: name, status: status };
        await fetch(`${BASE_API_URL}/${roomId}/players.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateObject)
        });
    } catch (error) {
        console.error("Erreur statut joueur :", error);
    }
}

// Polling synchronisé toutes les 1000ms
setInterval(ajaxGetRoomData, 1000);
ajaxGetRoomData();


// =========================================================================
//  SECTION JEU : DÉROULEMENT DES TOURS & SEMAILLES
// =========================================================================

async function move(startIndex) {
    if (!gameActive) return;
    
    // Sécurité stricte : Les spectateurs et joueurs hors-tour sont bloqués
    if (localRole === "Spectateur") {
        alert("Action interdite : Vous êtes spectateur.");
        return;
    }
    if (currentPlayer !== localRole) return;
    if (localRole === "Sud" && (startIndex < 0 || startIndex > 6)) return;
    if (localRole === "Nord" && (startIndex < 7 || startIndex > 13)) return;
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
    let isOpponentSide = (localRole === "Sud" && currentIndex >= 7) || (localRole === "Nord" && currentIndex <= 6);
    if (isOpponentSide && [2, 3, 4].includes(board[currentIndex])) {
        captured = board[currentIndex];
        board[currentIndex] = 0;
    }

    const activeName = localRole === "Sud" ? playersSync.Sud.name : playersSync.Nord.name;
    let nextPlayer = localRole === "Sud" ? "Nord" : "Sud";
    let logMsg = `${activeName} a joué la case ${pitLabels[startIndex]} (Prise : ${captured})`;

    if (localRole === "Sud") { scores[0] += captured; } else { scores[1] += captured; }

    let nextGameActive = true;
    if (scores[0] >= 40 || scores[1] >= 40 || board.reduce((a,b)=>a+b, 0) < 10) {
        nextGameActive = false;
        const winnerName = scores[0] >= 40 ? playersSync.Sud.name : (scores[1] >= 40 ? playersSync.Nord.name : "Égalité");
        logMsg += ` - Gagnant : ${winnerName}`;
    }

    await ajaxPatchGameState({
        board: board,
        scores: scores,
        currentPlayer: nextPlayer,
        gameActive: nextGameActive,
        lastMoveLog: logMsg
    });

    updateUI();
}

// =========================================================================
//  SECTION RENDU : AFFICHAGE DYNAMIQUE DU BOARD ET DES GRAINES
// =========================================================================

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
        document.getElementById('center-message').innerText = "🏆 Partie Terminée !";
    } else if (localRole === "Spectateur") {
        document.getElementById('center-message').innerText = `👀 Spectateur - Tour : ${currentTurnName}`;
    } else if (currentPlayer === localRole) {
        document.getElementById('center-message').innerText = "🟢 À vous de jouer !";
    } else {
        document.getElementById('center-message').innerText = `⏳ Attente de l'adversaire (${currentTurnName})...`;
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
        el.innerText = "En ligne"; el.classList.add('online');
    } else {
        el.innerText = "Déconnecté"; el.classList.remove('online');
    }
}

function renderGrenier(id, count) {
    const el = document.getElementById(id);
    if(!el) return; el.innerHTML = '';
    for(let i = 0; i < Math.min(count, 24); i++) {
        const s = document.createElement('div'); s.classList.add('seed'); el.appendChild(s);
    }
}

let lastLoggedText = "";
function appendHistoryOnce(msg) {
    if (msg === lastLoggedText) return;
    lastLoggedText = msg;
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    const li = document.createElement('li');
    li.innerText = msg;
    historyList.insertBefore(li, historyList.firstChild);
}

// =========================================================================
//  SECTION LOGIQUE ET RECHERCHE DE SALONS AUTO UNIQUES VIA RECURSION AJAX
// =========================================================================

async function generateUniqueRoomIdViaAjax() {
    const candidateId = Math.floor(1000 + Math.random() * 9000).toString();
    try {
        let response = await fetch(`${BASE_API_URL}/${candidateId}.json`);
        let data = await response.json();
        if (data !== null) {
            return await generateUniqueRoomIdViaAjax();
        }
        return candidateId;
    } catch (e) {
        return candidateId;
    }
}

document.getElementById('btn-generate-room').addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-room');
    btn.innerText = "⚡ Recherche d'un salon...";
    btn.disabled = true;

    let uniqueId = await generateUniqueRoomIdViaAjax();
    btn.innerText = "🛠️ Création...";
    
    await ajaxPutInitialRoom(uniqueId, true);
    window.location.href = `index.html?room=${uniqueId}`;
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const inputRoom = document.getElementById('input-join-room').value.trim();
    if (inputRoom.length === 4) {
        window.location.href = `index.html?room=${inputRoom}`;
    }
});

// RECOMMENCER : Forçage asynchrone instantané du rafraîchissement
document.getElementById('btn-reset').addEventListener('click', async () => {
    const btnReset = document.getElementById('btn-reset');
    btnReset.innerText = "🔄 Reset distant...";
    btnReset.disabled = true;

    await ajaxPutInitialRoom(roomId, false); 
    await ajaxGetRoomData();

    btnReset.innerText = "Recommencer la partie";
    btnReset.disabled = false;
    menuModal.classList.add('hidden');
});

inputName.addEventListener('change', () => {
    localPlayerName = inputName.value.trim() || "Anonyme";
    localStorage.setItem('songo_pseudo', localPlayerName);
    if (localRole === "Sud" || localRole === "Nord") {
        ajaxPatchPlayerStatus(localRole, localPlayerName, "online");
    }
});

// =========================================================================
//  SECTION THEME : COMMUTATEUR MODE CLAIR / SOMBRES (THEME SWITCHER)
// =========================================================================

const savedTheme = localStorage.getItem('songo_theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeButtonIcon(savedTheme);

const themeBtn = document.getElementById('btn-theme');
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('songo_theme', newTheme);
        updateThemeButtonIcon(newTheme);
    });
}

function updateThemeButtonIcon(theme) {
    const themeBtn = document.getElementById('btn-theme');
    if (!themeBtn) return;
    themeBtn.innerHTML = theme === 'dark' ? "☀️ Mode Clair" : "🌙 Mode Sombre";
}

// =========================================================================
//  SECTION MODALS & HISTORIQUE LOCAL
// =========================================================================

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

document.getElementById('btn-save-current-room').addEventListener('click', () => {
    let saved = JSON.parse(localStorage.getItem('songo_saved_rooms')) || [];
    if (!saved.includes(roomId)) {
        saved.push(roomId);
        localStorage.setItem('songo_saved_rooms', JSON.stringify(saved));
        alert(`Salon distant #${roomId} sauvegardé !`);
        renderSavedRooms();
    }
});

function renderSavedRooms() {
    const container = document.getElementById('saved-rooms-list');
    let saved = JSON.parse(localStorage.getItem('songo_saved_rooms')) || [];
    if (saved.length === 0) {
        container.innerHTML = `<span style="color: gray; font-style: italic; text-align: center;">Aucun salon enregistré</span>`;
        return;
    }
    container.innerHTML = "";
    saved.forEach(id => {
        const row = document.createElement('div');
        row.style = "display:flex; justify-content:space-between; padding:5px; background:rgba(255,255,255,0.8); margin-bottom:3px; border-radius:4px; border: 1px solid var(--border-btn);";
        row.innerHTML = `<span style="cursor:pointer; font-weight:bold; flex:1;">Salon #${id}</span><span style="cursor:pointer;">❌</span>`;
        
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

window.addEventListener('beforeunload', () => {
    if (localRole === "Sud" || localRole === "Nord") {
        ajaxPatchPlayerStatus(localRole, localPlayerName, "offline");
    }
});