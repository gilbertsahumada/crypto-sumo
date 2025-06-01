const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
// AÑADIR: Importar ethers para interactuar con la blockchain
const ethers = require('ethers');

// Configuración del servidor Express
const app = express();
app.use(express.static(path.join(__dirname, '../')));

// Iniciar servidor HTTP
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

// Configuración del servidor
const SERVER_CONFIG = {
  minPlayers: 1,  // Cambiar a 2 para el modo normal
  debugMode: true // Activar para pruebas
};

// Estado del juego en el servidor
const gameState = {
  players: new Map(),
  powerups: [],
  gameRunning: false,
  gamePhase: 'waiting',
  prizePool: 0,
  countdown: 0,
  gameTime: 60
};

// AÑADIR: Control de personajes en el servidor
const assignedCharacters = new Set();
let nextCharacterIndex = 1;

// AÑADIR: Función para asignar personaje único en el servidor
function getNextAvailableCharacter() {
    // Buscar el siguiente personaje disponible
    for (let i = 1; i <= 4; i++) {
        if (!assignedCharacters.has(i)) {
            assignedCharacters.add(i);
            return i;
        }
    }
    
    // Si todos están ocupados, reciclar desde el primero
    const characterIndex = ((nextCharacterIndex - 1) % 4) + 1;
    nextCharacterIndex++;
    return characterIndex;
}

// AÑADIR: Función para liberar personaje en el servidor
function releaseCharacter(characterIndex) {
    assignedCharacters.delete(characterIndex);
}

// AÑADIR: Configuración de la conexión a la blockchain
const FLOW_TESTNET = {
  chainId: "0x221", // 545 en decimal
  chainName: "Flow Testnet",
  rpcUrls: ["https://testnet.evm.nodes.onflow.org"],
  nativeCurrency: {
    name: "FLOW",
    symbol: "FLOW",
    decimals: 18,
  },
  blockExplorerUrls: ["https://testnet.flowscan.org"],
};

// AÑADIR: Dirección del contrato y ABI
const SUMO_CONTRACT_ADDRESS = "0x74C5Dc02eC6D842A72c21aA7f351be48Bcf2f489";
let SUMO_CONTRACT_ABI;
try {
  SUMO_CONTRACT_ABI = require('../js/sumoContract.js').SUMO_CONTRACT_ABI;
} catch (error) {
  console.log('No se pudo cargar el ABI del archivo, usando versión interna');
  // Aquí incluiría una versión mínima del ABI con los eventos y funciones necesarias
  SUMO_CONTRACT_ABI = [
    {
      "anonymous": false,
      "inputs": [{"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}],
      "name": "GameStarted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {"indexed": true, "internalType": "address", "name": "player", "type": "address"},
        {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
      ],
      "name": "PlayerJoined",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "getGameState",
      "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getActivePlayers",
      "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
      "stateMutability": "view",
      "type": "function"
    }
  ];
}

// AÑADIR: Configurar proveedor y contrato
let provider;
let contract;
let blockchainConnected = false;

// AÑADIR: Función para inicializar conexión a la blockchain
async function initBlockchainConnection() {
  try {
    provider = new ethers.providers.JsonRpcProvider(FLOW_TESTNET.rpcUrls[0]);
    contract = new ethers.Contract(SUMO_CONTRACT_ADDRESS, SUMO_CONTRACT_ABI, provider);
    
    // Verificar conexión
    const blockNumber = await provider.getBlockNumber();
    console.log(`Conectado a Flow Testnet - Bloque actual: ${blockNumber}`);
    blockchainConnected = true;
    
    // Empezar a escuchar eventos
    setupContractEventListeners();
    
    // Verificar estado inicial del juego
    syncGameStateWithBlockchain();
    
    // Sincronizar periódicamente (cada 30 segundos)
    setInterval(syncGameStateWithBlockchain, 30000);
    
    return true;
  } catch (error) {
    console.error('Error conectando a la blockchain:', error);
    blockchainConnected = false;
    return false;
  }
}

// AÑADIR: Configurar listeners de eventos del contrato
function setupContractEventListeners() {
  if (!contract || !blockchainConnected) return;
  
  // Listener para evento GameStarted
  contract.on('GameStarted', (timestamp) => {
    console.log(`Evento GameStarted recibido - timestamp: ${timestamp}`);
    
    // Verificar si debemos actualizar el estado del juego
    if (!gameState.gameRunning && gameState.gamePhase !== 'playing') {
      console.log('Iniciando juego en el servidor debido a evento GameStarted en la blockchain');
      // Iniciar juego inmediatamente sin countdown ya que ya empezó en la blockchain
      gameState.gamePhase = 'playing';
      gameState.gameRunning = true;
      
      // Obtener información de powerups y comenzar el juego
      getPowerupsFromBlockchain().then(powerups => {
        if (powerups && powerups.length > 0) {
          // Crear powerups en el servidor basados en los datos de la blockchain
          createPowerupsFromBlockchain(powerups);
        }
        
        startGameTimer();
        broadcastGameState();
      });
    }
  });
  
  // Listener para evento PlayerJoined
  contract.on('PlayerJoined', (playerAddress, amount) => {
    console.log(`Evento PlayerJoined recibido - jugador: ${playerAddress}, cantidad: ${ethers.utils.formatEther(amount)} FLOW`);
    
    // Verificar si el jugador ya existe en nuestro estado
    const existingPlayer = Array.from(gameState.players.values()).find(p => 
      p.address.toLowerCase() === playerAddress.toLowerCase()
    );
    
    if (!existingPlayer) {
      console.log(`Añadiendo jugador ${playerAddress} al estado del servidor desde evento blockchain`);
      
      // Crear jugador con datos del evento
      const playerId = uuidv4();
      const betAmount = parseFloat(ethers.utils.formatEther(amount));
      const characterIndex = getNextAvailableCharacter();
      
      // Añadir jugador al estado
      gameState.players.set(playerId, {
        id: playerId,
        address: playerAddress,
        bet: betAmount,
        x: 300 + (Math.random() - 0.5) * 200,
        y: 300 + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
        radius: calculatePlayerSize(betAmount),
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        alive: true,
        powerup: null,
        powerupEndTime: 0,
        keys: {},
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: 0,
        characterIndex: characterIndex,
        fromBlockchain: true // Marcar que vino de un evento blockchain
      });
      
      gameState.prizePool += betAmount;
      
      // AÑADIR: Iniciar física de sala de espera si es el primer jugador
      if (gameState.players.size === 1 && gameState.gamePhase === 'waiting') {
        startWaitingRoomPhysics();
      }
      
      broadcastGameState();
      
      // Verificar si el juego debe comenzar (último jugador)
      checkIfGameShouldAutostart();
    }
  });
}

// AÑADIR: Función para calcular tamaño del jugador (misma que en el cliente)
function calculatePlayerSize(bet) {
  const minSize = 20;
  const maxSize = 50;
  const scaleFactor = 1000;
  
  const calculatedSize = minSize + (bet * scaleFactor);
  return Math.max(minSize, Math.min(maxSize, calculatedSize));
}

// AÑADIR: Sincronizar estado del juego con la blockchain
async function syncGameStateWithBlockchain() {
  if (!contract || !blockchainConnected) return;
  
  try {
    console.log('Sincronizando estado del juego con la blockchain...');
    
    // 1. Verificar si el juego está activo en la blockchain
    const isGameActive = await contract.getGameState();
    console.log(`Estado del juego en blockchain: ${isGameActive ? 'activo' : 'inactivo'}`);
    
    // 2. Obtener lista de jugadores activos
    const activePlayers = await contract.getActivePlayers();
    console.log(`Jugadores activos en blockchain: ${activePlayers.length}`);
    
    // Si el juego está activo en la blockchain pero no en el servidor, iniciar el juego
    if (isGameActive && !gameState.gameRunning) {
      console.log('Juego activo en blockchain pero no en servidor, iniciando...');
      
      // Iniciar juego inmediatamente sin countdown ya que ya empezó en la blockchain
      gameState.gamePhase = 'playing';
      gameState.gameRunning = true;
      
      // Obtener información de powerups y comenzar el juego
      const powerups = await getPowerupsFromBlockchain();
      if (powerups && powerups.length > 0) {
        createPowerupsFromBlockchain(powerups);
      }
      
      startGameTimer();
      broadcastGameState();
    }
    // Si el juego no está activo en blockchain pero sí en servidor, terminar el juego
    else if (!isGameActive && gameState.gameRunning) {
      console.log('Juego inactivo en blockchain pero activo en servidor, terminando...');
      endGame();
    }
    
    // 3. Sincronizar jugadores
    syncPlayersWithBlockchain(activePlayers);
    
  } catch (error) {
    console.error('Error sincronizando con blockchain:', error);
  }
}

// AÑADIR: Sincronizar jugadores con la blockchain
async function syncPlayersWithBlockchain(activePlayers) {
  if (!activePlayers || !Array.isArray(activePlayers)) return;
  
  try {
    // Crear conjunto de direcciones de jugadores de la blockchain para búsqueda rápida
    const blockchainPlayerAddresses = new Set(
      activePlayers.map(addr => addr.toLowerCase())
    );
    
    // 1. Verificar jugadores en el servidor que ya no están en la blockchain
    for (const [playerId, player] of gameState.players.entries()) {
      const isInBlockchain = blockchainPlayerAddresses.has(player.address.toLowerCase());
      
      if (!isInBlockchain) {
        console.log(`Jugador ${player.address} ya no está en la blockchain, eliminando...`);
        
        // Liberar el personaje asignado
        if (player.characterIndex) {
          releaseCharacter(player.characterIndex);
        }
        
        // Eliminar del estado del servidor
        gameState.players.delete(playerId);
      }
    }
    
    // 2. Añadir jugadores de la blockchain que no están en el servidor
    for (const playerAddress of activePlayers) {
      const normalizedAddress = playerAddress.toLowerCase();
      
      // Verificar si este jugador ya existe en nuestro estado
      const existingPlayer = Array.from(gameState.players.values()).find(p => 
        p.address.toLowerCase() === normalizedAddress
      );
      
      if (!existingPlayer) {
        try {
          // Obtener información del jugador desde el contrato
          const playerInfo = await contract.getPlayerInfo(playerAddress);
          const betAmount = parseFloat(ethers.utils.formatEther(playerInfo.stakingAmount));
          
          console.log(`Añadiendo jugador ${playerAddress} al estado del servidor desde sincronización`);
          
          // Crear nuevo jugador
          const playerId = uuidv4();
          const characterIndex = getNextAvailableCharacter();
          
          gameState.players.set(playerId, {
            id: playerId,
            address: playerAddress,
            bet: betAmount,
            x: 300 + (Math.random() - 0.5) * 200,
            y: 300 + (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0,
            radius: calculatePlayerSize(betAmount),
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            alive: true,
            powerup: null,
            powerupEndTime: 0,
            keys: {},
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: 0,
            characterIndex: characterIndex,
            fromBlockchain: true
          });
          
          gameState.prizePool += betAmount;
        } catch (error) {
          console.error(`Error obteniendo info del jugador ${playerAddress}:`, error);
        }
      }
    }
    
    // Actualizar el premio total
    recalculatePrizePool();
    
    // Difundir el estado actualizado
    broadcastGameState();
    
  } catch (error) {
    console.error('Error sincronizando jugadores con blockchain:', error);
  }
}

// AÑADIR: Recalcular el premio total basado en las apuestas de los jugadores
function recalculatePrizePool() {
  gameState.prizePool = 0;
  for (const player of gameState.players.values()) {
    gameState.prizePool += player.bet;
  }
}

// AÑADIR: Verificar si el juego debe comenzar automáticamente
async function checkIfGameShouldAutostart() {
  if (!contract || !blockchainConnected) return;
  
  try {
    // Obtener el estado del juego desde la blockchain
    const isGameActive = await contract.getGameState();
    
    // Si el juego está activo en la blockchain pero no en el servidor, iniciarlo
    if (isGameActive && !gameState.gameRunning) {
      console.log('Juego detectado como activo en blockchain, iniciando automáticamente...');
      
      // Iniciar juego sin countdown
      gameState.gamePhase = 'playing';
      gameState.gameRunning = true;
      
      // Obtener powerups y comenzar
      const powerups = await getPowerupsFromBlockchain();
      if (powerups && powerups.length > 0) {
        createPowerupsFromBlockchain(powerups);
      }
      
      startGameTimer();
      broadcastGameState();
    }
  } catch (error) {
    console.error('Error verificando autostart del juego:', error);
  }
}

// AÑADIR: Obtener información de powerups desde la blockchain
async function getPowerupsFromBlockchain() {
  if (!contract || !blockchainConnected) return [];
  
  try {
    // Intentar obtener powerups desde el contrato
    // Nota: Esto depende de cómo está implementado tu contrato, ajústalo según sea necesario
    const powerUps = await contract.getPowerUps();
    const spawnTimes = await contract.getPowerUpSpawnTimes();
    
    // Si los métodos anteriores no existen, devolver array vacío
    if (!powerUps || !spawnTimes) return [];
    
    // Formatear los datos de powerups
    const result = [];
    for (let i = 0; i < powerUps.length && i < spawnTimes.length; i++) {
      result.push({
        type: powerUps[i].toUpperCase(),
        spawnTime: parseInt(spawnTimes[i].toString())
      });
    }
    
    return result;
  } catch (error) {
    console.warn('Error obteniendo powerups de la blockchain:', error);
    return [];
  }
}

// AÑADIR: Crear powerups basados en datos de la blockchain
function createPowerupsFromBlockchain(powerupData) {
  if (!powerupData || !Array.isArray(powerupData) || powerupData.length === 0) return;
  
  // Limpiar powerups existentes
  gameState.powerups = [];
  
  const centerX = 300;
  const centerY = 300;
  const ringRadius = 280;
  
  // Crear powerups basados en los datos recibidos
  powerupData.forEach(powerup => {
    // Calcular posición basada en algún algoritmo determinista usando spawnTime como semilla
    const seed = powerup.spawnTime % 1000;
    const angle = (seed / 1000) * Math.PI * 2;
    const distance = ringRadius * 0.4 + (seed % 100) / 100 * ringRadius * 0.3;
    
    gameState.powerups.push({
      type: powerup.type,
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      rotation: 0
    });
  });
  
  console.log(`Creados ${gameState.powerups.length} powerups desde datos de blockchain`);
}

// MODIFICAR: Incluir verificación blockchain en startGame
async function startGame() {
  // Verificar si el juego ya está activo en la blockchain antes de iniciar
  if (blockchainConnected) {
    try {
      const isGameActive = await contract.getGameState();
      if (isGameActive) {
        console.log('El juego ya está activo en la blockchain, sincronizando...');
        await syncGameStateWithBlockchain();
        return; // No continuar con el inicio normal si ya está activo
      }
    } catch (error) {
      console.warn('Error verificando estado del juego en blockchain:', error);
      // Continuar con el inicio normal si hay error en la verificación
    }
  }

  // Código existente para iniciar el juego
  gameState.gamePhase = 'countdown';
  gameState.countdown = 3;
  broadcastGameState();
  
  const countdownInterval = setInterval(() => {
    gameState.countdown--;
    broadcastGameState();
    
    if (gameState.countdown <= 0) {
      clearInterval(countdownInterval);
      gameState.gamePhase = 'playing';
      gameState.gameRunning = true;
      startGameTimer();
      spawnPowerup();
    }
  }, 1000);
}

// Inicializar la conexión blockchain al arrancar el servidor
initBlockchainConnection().then(connected => {
  if (connected) {
    console.log('Conexión blockchain establecida con éxito');
  } else {
    console.log('Servidor iniciado sin conexión blockchain. Algunas funciones estarán limitadas.');
  }
});

// Manejar conexiones WebSocket
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  console.log(`Nuevo cliente conectado: ${clientId}`);
  
  // Enviar ID de cliente al conectarse
  ws.send(JSON.stringify({
    type: 'connection',
    id: clientId,
    message: 'Conectado al servidor'
  }));
  
  // Enviar estado actual del juego
  ws.send(JSON.stringify({
    type: 'gameState',
    data: serializeGameState()
  }));

  // Escuchar mensajes del cliente
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(ws, clientId, data);
    } catch (error) {
      console.error('Error al procesar mensaje:', error);
    }
  });

  // Manejar desconexión
  ws.on('close', () => {
    console.log(`Cliente desconectado: ${clientId}`);
    if (gameState.players.has(clientId)) {
      const player = gameState.players.get(clientId);
      // Liberar el personaje asignado
      if (player.characterIndex) {
        releaseCharacter(player.characterIndex);
        console.log(`Personaje ${player.characterIndex} liberado por desconexión de ${clientId}`);
      }
      gameState.players.delete(clientId);
      broadcastGameState();
    }
  });
});

// MODIFICAR: Actualizar handleClientMessage para incluir validación blockchain
function handleClientMessage(ws, clientId, data) {
  console.log(`Mensaje recibido de ${clientId}:`, data.type);
  
  switch (data.type) {
    case 'joinGame':
      console.log(`Jugador ${clientId} uniéndose con apuesta de ${data.bet} FLOW`);
      
      // Si tenemos conexión blockchain, verificar si el jugador está en el contrato
      if (blockchainConnected && data.address) {
        verifyPlayerInBlockchain(data.address).then(isInGame => {
          if (isInGame) {
            console.log(`Jugador ${data.address} verificado en blockchain`);
            addPlayerToGame(clientId, data);
          } else {
            console.log(`Jugador ${data.address} no encontrado en blockchain, enviando mensaje de error`);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'No se encontró tu transacción en la blockchain. Por favor intenta de nuevo.'
            }));
          }
        }).catch(error => {
          console.error('Error verificando jugador en blockchain:', error);
          // Si hay error en la verificación, permitir unirse de todos modos
          addPlayerToGame(clientId, data);
        });
      } else {
        // Sin conexión blockchain, permitir unirse sin verificación
        addPlayerToGame(clientId, data);
      }
      break;
      
    case 'startGame':
      console.log(`Solicitud de inicio de juego. Jugadores: ${gameState.players.size}, Mínimo: ${SERVER_CONFIG.minPlayers}`);
      
      // Verificar si hay suficientes jugadores
      if (gameState.players.size >= SERVER_CONFIG.minPlayers) {
        console.log(`Iniciando juego con ${gameState.players.size} jugadores`);
        startGame();
      } else {
        console.log(`No se puede iniciar: insuficientes jugadores`);
        ws.send(JSON.stringify({
          type: 'error',
          message: `Se requieren al menos ${SERVER_CONFIG.minPlayers} jugadores para iniciar.`
        }));
      }
      break;
      
    case 'playerInput':
      // Actualizar inputs del jugador
      if (gameState.players.has(clientId)) {
        const player = gameState.players.get(clientId);
        player.keys = data.keys;
      }
      break;
      
    // AÑADIR: Nuevo tipo de mensaje para verificar estado blockchain
    case 'checkBlockchainState':
      if (blockchainConnected && data.address) {
        verifyPlayerInBlockchain(data.address).then(isInGame => {
          ws.send(JSON.stringify({
            type: 'blockchainStateResult',
            isInGame: isInGame,
            address: data.address
          }));
        }).catch(error => {
          console.error('Error verificando estado en blockchain:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Error verificando estado en blockchain'
          }));
        });
      } else {
        ws.send(JSON.stringify({
          type: 'blockchainStateResult',
          isInGame: false,
          address: data.address,
          error: 'Sin conexión blockchain'
        }));
      }
      break;
  }
}

// AÑADIR: Función auxiliar para añadir jugador al juego
function addPlayerToGame(clientId, data) {
  // Asignar personaje único
  const characterIndex = getNextAvailableCharacter();
  
  // Añadir jugador al estado
  gameState.players.set(clientId, {
    id: clientId,
    address: data.address,
    bet: data.bet,
    x: 300 + (Math.random() - 0.5) * 200,
    y: 300 + (Math.random() - 0.5) * 200,
    vx: 0,
    vy: 0,
    radius: calculatePlayerSize(data.bet),
    color: data.color || `hsl(${Math.random() * 360}, 70%, 60%)`,
    alive: true,
    powerup: null,
    powerupEndTime: 0,
    keys: {},
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: 0,
    characterIndex: characterIndex
  });
  
  gameState.prizePool += data.bet;
  
  // Iniciar física de sala de espera si es el primer jugador
  if (gameState.players.size === 1 && gameState.gamePhase === 'waiting') {
    startWaitingRoomPhysics();
  }
  
  broadcastGameState();
  
  // Verificar si el juego debe comenzar automáticamente
  if (blockchainConnected) {
    checkIfGameShouldAutostart();
  }
}

// AÑADIR: Verificar si un jugador está en la blockchain
async function verifyPlayerInBlockchain(address) {
  if (!contract || !blockchainConnected) return false;
  
  try {
    // Obtener lista de jugadores activos
    const activePlayers = await contract.getActivePlayers();
    
    // Verificar si la dirección está en la lista
    return activePlayers.some(player => 
      player.toLowerCase() === address.toLowerCase()
    );
  } catch (error) {
    console.error('Error verificando jugador en blockchain:', error);
    return false;
  }
}

// Iniciar juego
function startGame() {
  gameState.gamePhase = 'countdown';
  gameState.countdown = 3;
  broadcastGameState();
  
  const countdownInterval = setInterval(() => {
    gameState.countdown--;
    broadcastGameState();
    
    if (gameState.countdown <= 0) {
      clearInterval(countdownInterval);
      gameState.gamePhase = 'playing';
      gameState.gameRunning = true;
      startGameTimer();
      spawnPowerup();
    }
  }, 1000);
}

// Temporizador del juego
function startGameTimer() {
  gameState.gameTime = 60;
  const timer = setInterval(() => {
    gameState.gameTime--;
    
    // Verificar fin del juego
    const alivePlayers = getAlivePlayers();
    
    // MODIFICAR ESTA LÓGICA: En modo debug, permitir que un solo jugador continue
    let shouldEndGame = false;
    
    if (gameState.gameTime <= 0) {
      shouldEndGame = true;
      console.log('Fin del juego: Tiempo agotado');
    } else if (SERVER_CONFIG.debugMode && SERVER_CONFIG.minPlayers === 1) {
      // En modo debug con 1 jugador, solo terminar si no quedan jugadores vivos
      if (alivePlayers.length === 0) {
        shouldEndGame = true;
        console.log('Fin del juego: No quedan jugadores vivos');
      }
    } else {
      // Modo normal: terminar si queda 1 o menos jugadores
      if (alivePlayers.length <= 1) {
        shouldEndGame = true;
        console.log('Fin del juego: Solo queda un jugador o menos');
      }
    }
    
    if (shouldEndGame) {
      clearInterval(timer);
      endGame();
    }
    
    broadcastGameState();
  }, 1000);
  
  // Iniciar bucle de actualización física
  startPhysicsLoop();
}

// Bucle físico del juego
function startPhysicsLoop() {
  const FPS = 30;
  const INTERVAL = 1000 / FPS;
  
  const physicsLoop = setInterval(() => {
    if (!gameState.gameRunning) {
      clearInterval(physicsLoop);
      return;
    }
    
    updateGamePhysics();
    broadcastGameState();
  }, INTERVAL);
}

// AÑADIR: Bucle físico para la sala de espera
function startWaitingRoomPhysics() {
  const FPS = 20; // Menor FPS para la sala de espera
  const INTERVAL = 1000 / FPS;
  
  const waitingRoomLoop = setInterval(() => {
    // Solo actualizar si estamos en sala de espera y hay jugadores
    if (gameState.gamePhase !== 'waiting' || gameState.players.size === 0) {
      clearInterval(waitingRoomLoop);
      return;
    }
    
    updateWaitingRoomPhysics();
    broadcastGameState();
  }, INTERVAL);
}

// AÑADIR: Física simplificada para sala de espera
function updateWaitingRoomPhysics() {
  const centerX = 300;
  const centerY = 300;
  const ringRadius = 280;
  
  // Actualizar solo movimiento básico de jugadores
  gameState.players.forEach(player => {
    if (!player.alive) return;
    
    // Movimiento basado en las teclas presionadas (más lento que en juego)
    const baseSpeed = 0.4; // Velocidad reducida para sala de espera
    const mass = player.radius / 15;
    const speed = baseSpeed / Math.sqrt(mass);
    
    if (player.keys['w'] || player.keys['arrowup']) player.vy -= speed;
    if (player.keys['s'] || player.keys['arrowdown']) player.vy += speed;
    if (player.keys['a'] || player.keys['arrowleft']) player.vx -= speed;
    if (player.keys['d'] || player.keys['arrowright']) player.vx += speed;
    
    // Aplicar velocidad
    player.x += player.vx;
    player.y += player.vy;
    
    // Fricción aumentada para movimiento más controlado
    player.vx *= 0.85;
    player.vy *= 0.85;
    
    // Mantener jugadores dentro del ring (rebote suave)
    const distFromCenter = Math.sqrt(Math.pow(player.x - centerX, 2) + Math.pow(player.y - centerY, 2));
    if (distFromCenter + player.radius > ringRadius) {
      const pushAngle = Math.atan2(player.y - centerY, player.x - centerX);
      player.vx -= Math.cos(pushAngle) * 1.5;
      player.vy -= Math.sin(pushAngle) * 1.5;
      
      // Reposicionar si está muy fuera
      if (distFromCenter + player.radius > ringRadius + 20) {
        const newDist = ringRadius - player.radius - 10;
        player.x = centerX + Math.cos(pushAngle) * newDist;
        player.y = centerY + Math.sin(pushAngle) * newDist;
      }
    }
    
    // Actualizar rotación
    if (player.vx !== 0 || player.vy !== 0) {
      player.rotation = Math.atan2(player.vy, player.vx);
      player.rotationSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy) * 0.01;
    } else {
      player.rotationSpeed *= 0.95;
    }
  });
  
  // Colisiones suaves entre jugadores (sin fuerza, solo separación)
  const playersArray = Array.from(gameState.players.values()).filter(p => p.alive);
  for (let i = 0; i < playersArray.length; i++) {
    for (let j = i + 1; j < playersArray.length; j++) {
      checkWaitingRoomCollision(playersArray[i], playersArray[j]);
    }
  }
}

// AÑADIR: Colisiones suaves para sala de espera
function checkWaitingRoomCollision(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < p1.radius + p2.radius) {
    // Solo separación suave, sin fuerzas de empuje
    const nx = dx / dist;
    const ny = dy / dist;
    
    // Separar jugadores suavemente
    const overlap = (p1.radius + p2.radius) - dist + 1;
    const separationForce = overlap * 0.3; // Muy suave
    
    p1.x += nx * separationForce * 0.5;
    p1.y += ny * separationForce * 0.5;
    p2.x -= nx * separationForce * 0.5;
    p2.y -= ny * separationForce * 0.5;
    
    // Reducir velocidad en colisión
    p1.vx *= 0.7;
    p1.vy *= 0.7;
    p2.vx *= 0.7;
    p2.vy *= 0.7;
  }
}

// Actualizar física del juego (movimiento, colisiones, etc.)
function updateGamePhysics() {
  // Aquí iría la lógica de tu función update() pero en el servidor
  const centerX = 300;
  const centerY = 300;
  const ringRadius = 280;
  
  // Actualizar jugadores
  gameState.players.forEach(player => {
    if (!player.alive) return;
    
    // Movimiento basado en las teclas presionadas
    const baseSpeed = player.powerup === 'SPEED' ? 1.2 : 0.7;
    const mass = player.radius / 15;
    const speed = baseSpeed / Math.sqrt(mass);
    
    if (player.keys['w'] || player.keys['arrowup']) player.vy -= speed;
    if (player.keys['s'] || player.keys['arrowdown']) player.vy += speed;
    if (player.keys['a'] || player.keys['arrowleft']) player.vx -= speed;
    if (player.keys['d'] || player.keys['arrowright']) player.vx += speed;
    
    // Aplicar velocidad
    player.x += player.vx;
    player.y += player.vy;
    
    // Fricción
    player.vx *= 0.92;
    player.vy *= 0.92;
    
    // Verificar límites del ring
    const distFromCenter = Math.sqrt(Math.pow(player.x - centerX, 2) + Math.pow(player.y - centerY, 2));
    if (distFromCenter + player.radius > ringRadius) {
      if (distFromCenter + player.radius > ringRadius + 10) {
        player.alive = false;
      } else {
        const pushAngle = Math.atan2(player.y - centerY, player.x - centerX);
        player.vx -= Math.cos(pushAngle) * 2;
        player.vy -= Math.sin(pushAngle) * 2;
      }
    }
    
    // Actualizar powerups
    if (player.powerupEndTime && Date.now() > player.powerupEndTime) {
      player.powerup = null;
      player.powerupEndTime = 0;
    }
    
    // Actualizar rotación basada en movimiento
    if (player.vx !== 0 || player.vy !== 0) {
      player.rotation = Math.atan2(player.vy, player.vx);
      player.rotationSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy) * 0.01;
    } else {
      player.rotationSpeed *= 0.95;
    }
  });
  
  // Colisiones entre jugadores
  const playersArray = Array.from(gameState.players.values()).filter(p => p.alive);
  for (let i = 0; i < playersArray.length; i++) {
    for (let j = i + 1; j < playersArray.length; j++) {
      checkCollision(playersArray[i], playersArray[j]);
    }
  }
  
  // Colisiones con powerups
  for (let i = gameState.powerups.length - 1; i >= 0; i--) {
    const powerup = gameState.powerups[i];
    const playersArray = Array.from(gameState.players.values()).filter(p => p.alive);
    
    for (let j = 0; j < playersArray.length; j++) {
      const player = playersArray[j];
      const dist = Math.sqrt(Math.pow(player.x - powerup.x, 2) + Math.pow(player.y - powerup.y, 2));
      
      if (dist < player.radius + 15) {
        // Recoger powerup
        player.powerup = powerup.type;
        player.powerupEndTime = Date.now() + 5000; // 5 segundos de duración
        
        // Eliminar del array de forma segura
        gameState.powerups.splice(i, 1);
        break; // Salir del bucle interno una vez recogido el powerup
      }
    }
  }
  
  // Generar powerups aleatoriamente
  if (Math.random() < 0.01 && gameState.gamePhase === 'playing' && gameState.powerups.length < 3) {
    spawnPowerup();
  }
}

// Función para verificar colisiones entre jugadores
function checkCollision(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < p1.radius + p2.radius) {
    // Física de colisión mejorada
    const mass1 = p1.radius * p1.radius;  // Masa basada en el área
    const mass2 = p2.radius * p2.radius;
    
    // Multiplicadores de fuerza
    const strength1 = (p1.powerup === 'STRENGTH' ? 2.0 : 1.0) * p1.bet * 150; 
    const strength2 = (p2.powerup === 'STRENGTH' ? 2.0 : 1.0) * p2.bet * 150;
    
    // Momentum basado en velocidad
    const velocity1 = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
    const velocity2 = Math.sqrt(p2.vx * p2.vx + p2.vy * p2.vy);
    const momentumFactor1 = 1 + velocity1 * 0.5;
    const momentumFactor2 = 1 + velocity2 * 0.5;
    
    // Vector de colisión normalizado
    const nx = dx / dist;
    const ny = dy / dist;
    
    // Calcular fuerzas de impacto con momentum
    const force1 = strength1 * momentumFactor1;
    const force2 = strength2 * momentumFactor2;
    
    // Aplicar fuerzas considerando la masa
    const pushForce = 3.5;
    p1.vx += nx * (force2 / mass1) * pushForce;
    p1.vy += ny * (force2 / mass1) * pushForce;
    p2.vx -= nx * (force1 / mass2) * pushForce;
    p2.vy -= ny * (force1 / mass2) * pushForce;
    
    // Separar jugadores más agresivamente
    const overlap = (p1.radius + p2.radius) - dist + 2;
    const separationForce = overlap * 0.6;
    p1.x += nx * separationForce * (mass2 / (mass1 + mass2));
    p1.y += ny * separationForce * (mass2 / (mass1 + mass2));
    p2.x -= nx * separationForce * (mass1 / (mass1 + mass2));
    p2.y -= ny * separationForce * (mass1 / (mass1 + mass2));
  }
}

// Generar powerup
function spawnPowerup() {
  const centerX = 300;
  const centerY = 300;
  const ringRadius = 280;
  
  const POWERUP_TYPES = ['STRENGTH', 'SPEED', 'SHIELD', 'MAGNET'];
  
  if (gameState.powerups.length < 3) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    
    // Generar dentro del ring pero no muy cerca del centro
    const angle = Math.random() * Math.PI * 2;
    const minRadius = ringRadius * 0.2;
    const maxRadius = ringRadius * 0.7;
    const distance = minRadius + Math.random() * (maxRadius - minRadius);
    
    gameState.powerups.push({
      type: type,
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      rotation: 0
    });
  }
}

// Finalizar juego
function endGame() {
  gameState.gameRunning = false;
  gameState.gamePhase = 'finished';
  broadcastGameState();
  
  // Reiniciar juego después de un tiempo
  setTimeout(resetGame, 5000);
}

// Reiniciar juego
function resetGame() {
  // Liberar todos los personajes asignados
  assignedCharacters.clear();
  nextCharacterIndex = 1;
  
  // Restablecer el estado del juego
  gameState.players = new Map();
  gameState.powerups = [];
  gameState.gameRunning = false;
  gameState.gamePhase = 'waiting';
  gameState.prizePool = 0;
  gameState.countdown = 0;
  gameState.gameTime = 60;
  
  console.log('Juego reiniciado - personajes liberados');
  broadcastGameState();
}

// Obtener jugadores vivos
function getAlivePlayers() {
  return Array.from(gameState.players.values()).filter(p => p.alive);
}

// Enviar estado del juego a todos los clientes
function broadcastGameState() {
  const stateData = serializeGameState();
  console.log(`Broadcasting game state: ${stateData.players.length} jugadores, fase: ${stateData.gamePhase}`);
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'gameState',
        data: stateData
      }));
    }
  });
}

// Serializar estado del juego para enviar por WebSocket
function serializeGameState() {
  return {
    players: Array.from(gameState.players.values()),
    powerups: gameState.powerups,
    gameRunning: gameState.gameRunning,
    gamePhase: gameState.gamePhase,
    prizePool: gameState.prizePool,
    countdown: gameState.countdown,
    gameTime: gameState.gameTime
  };
}
