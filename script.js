// =========================================================================
//  SONGO ONLINE - ENTRÉE STRICTE PAR CODE UNIQUE GÉNÉRÉ PAR L'APP
// =========================================================================

// CONFIGURATION : Remplacez par l'URL réelle de votre Realtime Database Firebase
const BASE_API_URL = "https://VOTRE_PROJECT_ID-default-rtdb.firebaseio.com/rooms";

// 1. L'APP ANALYSE L'URL À LA RECHERCHE D'UN CODE DE SALON
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room'); 

// 2. ÉTAT DU JOUEUR LOCAL ET DU JEU
let localRole = ""; 
let localPlayerName = localStorage.getItem('songo_pseudo') || "Joueur_" + Math.floor(Math.random() * 99);

let board = [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5];
let scores = [0, 0]; 
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
//  CONTRÔLE DE SÉCURITÉ : ENTRÉE PAR CODE OBLIGATOIRE
// =========================================================================

// Au démarrage, si l'URL ne contient aucun code généré au préalable...
if (!roomId) {
    // 🚩 L'application bloque l'accès au plateau de jeu.
    // Elle force l'ouverture du menu et masque les boutons de fermeture.
    menuModal.classList.remove('hidden');
    document.getElementById('btn-close-menu').style.display = "none";
    document.getElementById('btn-menu-annuler').style.display = "none";
    document.getElementById('center-message').innerText = "Générez un salon pour obtenir un code et débuter le jeu.";
} else {
    // Si un code valide généré par l'app est présent dans l'URL, le jeu se synchronise en continu
    setInterval(ajaxGetRoomData, 1000);
    ajaxGetRoomData();
}

// =========================================================================
//  SECTION INTERNET : SYNCHRONISATION VIA REST AJAX
// =========================================================================

async function ajaxGetRoomData() {
    if (!roomId) return;
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

        // ALGORITHME D'ATTRIBUTION UNIQUE DES RÔLES (MAX 2 JOUEURS)
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

async function ajaxPutInitialRoom(targetRoomId, assignLocal) {
    const initPayload = {
        board: [5, 5, 5, 5, 5, 5, 5,  5, 5, 5, 5, 5, 5, 5],
        scores: [0, 0],
        currentPlayer: "Sud",
        gameActive: true,
        lastMoveLog: "Bienvenue dans ce nouveau salon ! Le jeu commence.",
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
        console.error("Erreur lors de l'initialisation du salon :", error);
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
        console.error("Erreur de transmission du coup :", error);
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
        console.error("Erreur de statut joueur :", error);
    }
}

// =========================================================================
//  SECTION JEU : COMPORTEMENT DU PLATEAU DE SONGO
// =========================================================================

async function move(startIndex) {
    if (!roomId || !gameActive) return; 
    
    if (localRole === "Spectateur") {
        alert("Action impossible : Vous êtes en mode spectateur.");
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
//  SECTION RENDU GRAPHIQUE
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
//  CŒUR DE L'APPLICATION : GÉNÉRATION DU CODE UNIQUE DE SALON (ANTI-DUPLICATION)
// =========================================================================

/**
 * Fonction Récursive : L'application teste elle-même sur le serveur si le code 
 * aléatoire généré est disponible ou s'il appartient déjà à un autre salon actif.
 */
async function generateUniqueRoomIdViaAjax() {
    // Génère un nombre aléatoire strict entre 1000 et 9999
    const candidateId = Math.floor(1000 + Math.random() * 9000).toString();
    try {
        let response = await fetch(`${BASE_API_URL}/${candidateId}.json`);
        let data = await response.json();
        
        // Si le serveur répond avec des données, le code est déjà pris !
        // L'application s'auto-rappelle pour fabriquer un nouveau code libre.
        if (data !== null) {
            return await generateUniqueRoomIdViaAjax(); 
        }
        return candidateId; // Le code est vierge, unique et validé !
    } catch (e) {
        return candidateId;
    }
}

// Clic sur "Créer un nouveau salon" : L'application génère l'identifiant unique
document.getElementById('btn-generate-room').addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-room');
    btn.innerText = "⚡ Génération du code unique...";
    btn.disabled = true;

    // L'app trouve un code libre (ex: 8361)
    let uniqueId = await generateUniqueRoomIdViaAjax();
    btn.innerText = "🛠️ Configuration du salon...";
    
    // L'app installe le jeu sur le serveur pour ce code précis
    await ajaxPutInitialRoom(uniqueId, true);
    
    // L'app injecte le code généré dans l'URL et actualise la page pour lancer la partie
    window.location.href = `index.html?room=${uniqueId}`;
});

// Clic : Permet à un ami d'entrer le code à 4 chiffres généré par l'app du premier joueur
document.getElementById('btn-join-room').addEventListener('click', () => {
    const inputRoom = document.getElementById('input-join-room').value.trim();
    if (inputRoom.length === 4) {
        window.location.href = `index.html?room=${inputRoom}`;
    }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!roomId) return;
    const btnReset = document.getElementById('btn-reset');
    btnReset.innerText = "🔄 Réinitialisation...";
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
//  SECTION THEME : GESTION DES COULEURS
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
//  SECTION MODALS INTERACTIFS
// =========================================================================

document.getElementById('btn-open-menu').addEventListener('click', () => { 
    if (roomId) {
        document.getElementById('btn-close-menu').style.display = "block";
        document.getElementById('btn-menu-annuler').style.display = "block";
    }
    renderSavedRooms(); 
    menuModal.classList.remove('hidden'); 
});

document.getElementById('btn-close-menu').addEventListener('click', () => { if(roomId) menuModal.classList.add('hidden'); });
document.getElementById('btn-menu-annuler').addEventListener('click', () => { if(roomId) menuModal.classList.add('hidden'); });

document.getElementById('btn-type-prise' || 'btn-prise').addEventListener('click', () => { menuModal.classList.add('hidden'); rulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-rules').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-back-to-menu').addEventListener('click', () => { rulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

document.getElementById('btn-general-rules').addEventListener('click', () => { menuModal.classList.add('hidden'); generalRulesModal.classList.remove('hidden'); });
document.getElementById('btn-close-general-rules').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });
document.getElementById('btn-rules-back-to-menu').addEventListener('click', () => { generalRulesModal.classList.add('hidden'); menuModal.classList.remove('hidden'); });

document.querySelectorAll('.pit').forEach(p => {
    p.addEventListener('click', () => move(parseInt(p.getAttribute('data-index'))));
});

document.getElementById('btn-save-current-room').addEventListener('click', () => {
    if(!roomId) return;
    let saved = JSON.parse(localStorage.getItem('songo_saved_rooms')) || [];
    if (!saved.includes(roomId)) {
        saved.push(roomId);
        localStorage.setItem('songo_saved_rooms', JSON.stringify(saved));
        alert(`Code #${roomId} mémorisé !`);
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