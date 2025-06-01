const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ethers = require('ethers');

// Configuración del servidor Express
const app = express();

// AÑADIR: Configuración de CORS para desarrollo y producción
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.static(path.join(__dirname, '../')));

// AÑADIR: Endpoint de salud para verificar que el servidor está funcionando
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: wss.clients.size,
    blockchain: blockchainConnected
  });
});

// Iniciar servidor HTTP
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
  console.log(`WebSocket disponible en ws://localhost:${PORT}`);
});

// MODIFICAR: Crear servidor WebSocket con configuración mejorada
const wss = new WebSocket.Server({ 
  server,
  // AÑADIR: Configuración adicional para producción
  perMessageDeflate: false,
  maxPayload: 1024 * 1024, // 1MB max
  clientTracking: true
});

// Configuración del servidor
const SERVER_CONFIG = {
  minPlayers: 1,
  debugMode: true
};

// SIMPLIFICAR: Estado mínimo del servidor
const serverState = {
  connectedClients: new Map(), // clientId -> { address, bet, lastSeen }
  gamePhase: 'waiting', // waiting, starting, playing, finished
  lastBlockchainSync: 0
};

// SIMPLIFICAR: Solo blockchain connection básica
const FLOW_TESTNET = {
  chainId: "0x221",
  chainName: "Flow Testnet",
  rpcUrls: ["https://testnet.evm.nodes.onflow.org"],
  nativeCurrency: {
    name: "FLOW",
    symbol: "FLOW",
    decimals: 18,
  },
  blockExplorerUrls: ["https://testnet.flowscan.org"],
};

const SUMO_CONTRACT_ADDRESS = "0x74C5Dc02eC6D842A72c21aA7f351be48Bcf2f489";
let SUMO_CONTRACT_ABI;
try {
  SUMO_CONTRACT_ABI = require('../js/sumoContract.js').SUMO_CONTRACT_ABI;
} catch (error) {
  console.log('No se pudo cargar el ABI del archivo, usando versión mínima');
  SUMO_CONTRACT_ABI = [
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

let provider;
let contract;
let blockchainConnected = false;

// SIMPLIFICAR: Conexión blockchain básica
async function initBlockchainConnection() {
  try {
    provider = new ethers.providers.JsonRpcProvider(FLOW_TESTNET.rpcUrls[0]);
    contract = new ethers.Contract(SUMO_CONTRACT_ADDRESS, SUMO_CONTRACT_ABI, provider);
    
    const blockNumber = await provider.getBlockNumber();
    console.log(`Conectado a Flow Testnet - Bloque actual: ${blockNumber}`);
    blockchainConnected = true;
    
    // Solo verificar estado cada 10 segundos
    setInterval(checkBlockchainState, 10000);
    
    return true;
  } catch (error) {
    console.error('Error conectando a la blockchain:', error);
    blockchainConnected = false;
    return false;
  }
}

// SIMPLIFICAR: Solo verificar estado básico
async function checkBlockchainState() {
  if (!contract || !blockchainConnected) return;
  
  try {
    const isGameActive = await contract.getGameState();
    const activePlayers = await contract.getActivePlayers();
    
    // Solo notificar cambios importantes
    if (isGameActive !== (serverState.gamePhase === 'playing')) {
      console.log(`Estado del juego cambió: ${isGameActive ? 'activo' : 'inactivo'}`);
      serverState.gamePhase = isGameActive ? 'playing' : 'waiting';
      broadcastStateUpdate();
    }
    
    serverState.lastBlockchainSync = Date.now();
  } catch (error) {
    console.warn('Error verificando blockchain:', error);
  }
}

// SIMPLIFICAR: Solo verificar si un jugador está en blockchain
async function verifyPlayerInBlockchain(address) {
  if (!contract || !blockchainConnected) return false;
  
  try {
    const activePlayers = await contract.getActivePlayers();
    return activePlayers.some(player => 
      player.toLowerCase() === address.toLowerCase()
    );
  } catch (error) {
    console.error('Error verificando jugador:', error);
    return false;
  }
}

// SIMPLIFICAR: Manejar conexiones WebSocket
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const clientIP = req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  console.log(`Cliente conectado: ${clientId} desde ${clientIP}`);
  
  // Enviar ID y estado actual
  ws.send(JSON.stringify({
    type: 'connection',
    id: clientId,
    serverState: {
      gamePhase: serverState.gamePhase,
      connectedClients: serverState.connectedClients.size,
      blockchainConnected: blockchainConnected,
      lastSync: serverState.lastBlockchainSync
    }
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(ws, clientId, data);
    } catch (error) {
      console.error('Error procesando mensaje:', error);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Cliente desconectado: ${clientId} - Código: ${code}, Razón: ${reason || 'No especificada'}`);
    serverState.connectedClients.delete(clientId);
    broadcastStateUpdate();
  });

  ws.on('error', (error) => {
    console.error(`Error en WebSocket para cliente ${clientId}:`, error);
  });
});

// SIMPLIFICAR: Manejo de mensajes del cliente
function handleClientMessage(ws, clientId, data) {
  console.log(`Mensaje de ${clientId}:`, data.type);
  
  switch (data.type) {
    case 'registerPlayer':
      // Solo registrar el jugador, no simular el juego
      if (data.address && data.bet) {
        serverState.connectedClients.set(clientId, {
          address: data.address,
          bet: data.bet,
          lastSeen: Date.now()
        });
        
        console.log(`Jugador registrado: ${data.address} con ${data.bet} FLOW`);
        broadcastStateUpdate();
      }
      break;
      
    case 'checkBlockchainState':
      if (blockchainConnected && data.address) {
        verifyPlayerInBlockchain(data.address).then(isInGame => {
          ws.send(JSON.stringify({
            type: 'blockchainStateResult',
            isInGame: isInGame,
            address: data.address,
            gamePhase: serverState.gamePhase
          }));
        }).catch(error => {
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
      
    case 'requestGameState':
      // Enviar estado actual del servidor
      ws.send(JSON.stringify({
        type: 'serverState',
        data: {
          gamePhase: serverState.gamePhase,
          connectedClients: Array.from(serverState.connectedClients.values()),
          blockchainConnected: blockchainConnected,
          lastSync: serverState.lastBlockchainSync
        }
      }));
      break;
      
    case 'heartbeat':
      // Actualizar última vez visto
      if (serverState.connectedClients.has(clientId)) {
        serverState.connectedClients.get(clientId).lastSeen = Date.now();
      }
      break;
      
    case 'getConnectedPlayers':
      // Enviar lista de jugadores realmente conectados
      ws.send(JSON.stringify({
        type: 'connectedPlayersResult',
        players: Array.from(serverState.connectedClients.values()),
        count: serverState.connectedClients.size
      }));
      break;
      
    case 'getServerInfo':
      // Enviar información detallada del servidor
      ws.send(JSON.stringify({
        type: 'serverInfoResult',
        data: {
          connectedClients: serverState.connectedClients.size,
          gamePhase: serverState.gamePhase,
          blockchainConnected: blockchainConnected,
          lastSync: serverState.lastBlockchainSync,
          players: Array.from(serverState.connectedClients.values())
        }
      }));
      break;
  }
}

// SIMPLIFICAR: Solo difundir actualizaciones de estado básicas
function broadcastStateUpdate() {
  const stateData = {
    gamePhase: serverState.gamePhase,
    connectedClients: serverState.connectedClients.size,
    blockchainConnected: blockchainConnected,
    lastSync: serverState.lastBlockchainSync
  };
  
  console.log(`Broadcasting state update: ${JSON.stringify(stateData)}`);
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'serverStateUpdate',
        data: stateData
      }));
    }
  });
}

// Limpiar clientes inactivos cada minuto
setInterval(() => {
  const now = Date.now();
  const timeout = 60000; // 1 minuto
  
  for (const [clientId, client] of serverState.connectedClients.entries()) {
    if (now - client.lastSeen > timeout) {
      console.log(`Removiendo cliente inactivo: ${clientId}`);
      serverState.connectedClients.delete(clientId);
    }
  }
}, 60000);

// AÑADIR: Logging de estado del servidor cada minuto
setInterval(() => {
  console.log(`Estado del servidor - Clientes: ${wss.clients.size}, Blockchain: ${blockchainConnected ? 'conectado' : 'desconectado'}`);
}, 60000);

// Inicializar
initBlockchainConnection().then(connected => {
  if (connected) {
    console.log('Servidor iniciado con conexión blockchain');
  } else {
    console.log('Servidor iniciado sin conexión blockchain');
  }
});
