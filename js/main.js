// Game State
let gameState = {
    players: new Map(),
    powerups: [],
    gameRunning: false,
    gamePhase: 'waiting',
    prizePool: 0,
    myPlayerId: null,
    countdown: 0,
    gameTime: 60
};

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const ringRadius = 280;

// Game instances
let walletManager;
let gameLogic;
let gameConnection;

// Precargar imágenes de sumo
const sumoImages = {
    default: new Image(),
    strengthOverlay: new Image(),
    speedOverlay: new Image(),
    shieldOverlay: new Image(),
    magnetOverlay: new Image(),
    character1: new Image(),
    character2: new Image(),
    character3: new Image(),
    character4: new Image()
};

// Input handling
const keys = {};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Initialize game components
    walletManager = new WalletManager();
    gameLogic = new GameLogic();
    
    loadSumoImages();
    walletManager.setupEthers();
    setupEventListeners();
    
    // Iniciar conexión WebSocket
    gameConnection = new GameConnection();
    
    // Configurar callbacks de WebSocket
    gameConnection.setCallback('onConnect', () => {
        showMessage('Conectado al servidor del juego');
    });
    
    gameConnection.setCallback('onDisconnect', () => {
        showMessage('Desconectado del servidor del juego');
    });
    
    gameConnection.setCallback('onGameState', (newState) => {
        updateGameStateFromServer(newState);
    });
    
    gameConnection.setCallback('onError', (error) => {
        console.error('Error de conexión:', error);
        showMessage('Error de conexión con el servidor');
    });
    
    // Conectar al servidor
    gameConnection.connect();
    
    // Iniciar bucle de renderizado local
    gameLoop();
    
    // En modo offline, añadir jugadores demo
    setTimeout(() => {
        if (gameState.players.size === 0 && !gameConnection.connected) {
            addDemoPlayers();
        }
    }, 2000);
});

function loadSumoImages() {
    sumoImages.default.src = './public/sumo-default.png';
    sumoImages.strengthOverlay.src = './public/sumo_strength.PNG';
    sumoImages.speedOverlay.src = './public/sumo_speed.PNG';
    sumoImages.shieldOverlay.src = './public/sumo_shield.PNG';
    
    sumoImages.character1.src = './public/sumo_one.PNG';
    sumoImages.character2.src = './public/sumo_two.PNG';
    sumoImages.character3.src = './public/sumo_three.PNG';
    sumoImages.character4.src = './public/sumo_four.PNG';
    
    let imagesLoaded = 0;
    const totalImages = Object.keys(sumoImages).length;
    
    Object.values(sumoImages).forEach(img => {
        img.onload = () => {
            imagesLoaded++;
            console.log(`Cargando imágenes: ${imagesLoaded}/${totalImages}`);
        };
        
        img.onerror = (err) => {
            console.error('Error cargando imagen:', err);
        };
    });
}

function setupEventListeners() {
    document.getElementById('connectWallet').addEventListener('click', () => walletManager.connectWallet());
    document.getElementById('disconnectWallet').addEventListener('click', () => walletManager.disconnectWallet());
    document.getElementById('joinGame').addEventListener('click', joinGame);
    document.getElementById('startGame').addEventListener('click', startGame);
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

// ...existing game functions (joinGame, startGame, etc.) remain the same but now use the modular components...
// The remaining functions from the original file would be copied here with minimal changes,
// primarily replacing direct variable access with the appropriate class instances.

async function joinGame() {
    if (!walletManager.walletConnected) {
        alert('Please connect your wallet first!');
        return;
    }

    try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== FLOW_TESTNET.chainId) {
            alert('Please switch to Flow Testnet to play!');
            const switched = await walletManager.switchToFlowTestnet();
            if (!switched) {
                walletManager.showManualNetworkInstructions();
                return;
            }
        }

        const betAmount = parseFloat(document.getElementById('betAmount').value);
        if (betAmount < 0.001) {
            alert('Minimum bet is 0.001 FLOW');
            return;
        }
        
        if (!walletManager.signer || !gameConnection.connected) {
            simulateJoinGame(betAmount);
            return;
        }

        document.getElementById('joinGame').disabled = true;
        document.getElementById('joinGame').textContent = 'Processing...';
        
        try {
            await walletManager.processTransaction(betAmount);
            gameConnection.joinGame(betAmount, walletManager.walletAddress);
            showMessage(`Bet of ${betAmount} FLOW confirmed! 🎉`);
            document.getElementById('joinGame').textContent = 'Joined ✓';
        } catch (txError) {
            console.error("Transaction error:", txError);
            alert(`Transaction failed: ${txError.message}`);
            document.getElementById('joinGame').disabled = false;
            document.getElementById('joinGame').textContent = 'Join Game (Bet FLOW)';
        }
    } catch (error) {
        console.error("Error placing bet:", error);
        alert(`Error placing bet: ${error.message}`);
        document.getElementById('joinGame').disabled = false;
        document.getElementById('joinGame').textContent = 'Join Game (Bet FLOW)';
    }
}

function simulateJoinGame(betAmount) {
    document.getElementById('joinGame').disabled = true;
    document.getElementById('joinGame').textContent = 'Processing...';
    
    setTimeout(() => {
        createPlayer(betAmount);
        showMessage(`Bet of ${betAmount} FLOW confirmed! 🎉`);
        document.getElementById('joinGame').textContent = 'Joined ✓';
    }, 1500);
}

function createPlayer(betAmount) {
    const player = gameLogic.createPlayer(betAmount, walletManager.walletAddress);
    gameState.myPlayerId = player.id;
    gameState.players.set(player.id, player);
    gameState.prizePool += betAmount;
    
    console.log(`Jugador ${player.id} asignado al personaje ${player.characterIndex}, tamaño: ${player.radius}`);
    
    updateUI();
    
    if (gameState.players.size >= GAME_CONFIG.minPlayers) {
        document.getElementById('startGame').style.display = 'inline-block';
        if (GAME_CONFIG.testMode && gameState.players.size === 1) {
            document.getElementById('startGame').textContent = 'Start Game (Test Mode)';
        } else {
            document.getElementById('startGame').textContent = 'Start Game';
        }
    }
}

function addDemoPlayers() {
    const demoPlayers = gameLogic.addDemoPlayers();
    
    demoPlayers.forEach(player => {
        gameState.players.set(player.id, player);
        gameState.prizePool += player.bet;
    });
    
    updateUI();
}

