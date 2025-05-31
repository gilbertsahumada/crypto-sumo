const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
      gameState.players.delete(clientId);
      broadcastGameState();
    }
  });
});

// Procesar mensajes del cliente
function handleClientMessage(ws, clientId, data) {
  switch (data.type) {
    case 'joinGame':
      // Añadir jugador al juego
      gameState.players.set(clientId, {
        id: clientId,
        address: data.address,
        bet: data.bet,
        x: 300 + (Math.random() - 0.5) * 200,
        y: 300 + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
        radius: Math.max(15, Math.min(35, 15 + data.bet * 500)),
        color: data.color || `hsl(${Math.random() * 360}, 70%, 60%)`,
        alive: true,
        powerup: null,
        powerupEndTime: 0,
        keys: {},
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: 0
      });
      
      gameState.prizePool += data.bet;
      broadcastGameState();
      break;
      
    case 'startGame':
      if (gameState.players.size >= 2) {
        startGame();
      }
      break;
      
    case 'playerInput':
      // Actualizar inputs del jugador
      if (gameState.players.has(clientId)) {
        const player = gameState.players.get(clientId);
        player.keys = data.keys;
        // No broadcast on every input to reduce traffic
      }
      break;
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
    if (gameState.gameTime <= 0 || alivePlayers.length <= 1) {
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
  // (lógica de colisión con powerups similar a tu código original)
  
  // Generar powerups aleatoriamente
  if (Math.random() < 0.01 && gameState.gamePhase === 'playing' && gameState.powerups.length < 3) {
    spawnPowerup();
  }
}

// Función para verificar colisiones entre jugadores
function checkCollision(p1, p2) {
  // Lógica de colisión similar a tu código original
}

// Generar powerup
function spawnPowerup() {
  // Lógica de generación de powerups similar a tu código original
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
  // Restablecer el estado del juego
  gameState.players = new Map();
  gameState.powerups = [];
  gameState.gameRunning = false;
  gameState.gamePhase = 'waiting';
  gameState.prizePool = 0;
  gameState.countdown = 0;
  gameState.gameTime = 60;
  
  broadcastGameState();
}

// Obtener jugadores vivos
function getAlivePlayers() {
  return Array.from(gameState.players.values()).filter(p => p.alive);
}

// Enviar estado del juego a todos los clientes
function broadcastGameState() {
  const stateData = serializeGameState();
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
