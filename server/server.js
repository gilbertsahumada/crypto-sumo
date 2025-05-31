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

// Procesar mensajes del cliente
function handleClientMessage(ws, clientId, data) {
  console.log(`Mensaje recibido de ${clientId}:`, data.type);
  
  switch (data.type) {
    case 'joinGame':
      console.log(`Jugador ${clientId} uniéndose con apuesta de ${data.bet} FLOW`);
      
      // MODIFICAR: Asignar personaje único al jugador
      const characterIndex = getNextAvailableCharacter();
      
      // MODIFICAR: Cálculo mejorado del tamaño basado en la apuesta
      const calculatePlayerSize = (bet) => {
        // Tamaño base mínimo
        const minSize = 20;
        // Tamaño máximo para evitar personajes demasiado grandes
        const maxSize = 50;
        // Factor de escala: cada 0.01 FLOW añade ~10 unidades de radio
        const scaleFactor = 1000;
        
        const calculatedSize = minSize + (bet * scaleFactor);
        return Math.max(minSize, Math.min(maxSize, calculatedSize));
      };
      
      // Añadir jugador al juego
      gameState.players.set(clientId, {
        id: clientId,
        address: data.address,
        bet: data.bet,
        x: 300 + (Math.random() - 0.5) * 200,
        y: 300 + (Math.random() - 0.5) * 200,
        vx: 0,
        vy: 0,
        radius: calculatePlayerSize(data.bet), // Usar nueva función de cálculo
        color: data.color || `hsl(${Math.random() * 360}, 70%, 60%)`,
        alive: true,
        powerup: null,
        powerupEndTime: 0,
        keys: {},
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: 0,
        // AÑADIR: Índice de personaje
        characterIndex: characterIndex
      });
      
      gameState.prizePool += data.bet;
      
      console.log(`Jugador ${clientId} asignado al personaje ${characterIndex}, tamaño: ${calculatePlayerSize(data.bet)}`);
      
      // AÑADIR: Iniciar física de sala de espera si es el primer jugador
      if (gameState.players.size === 1 && gameState.gamePhase === 'waiting') {
        startWaitingRoomPhysics();
      }
      
      broadcastGameState();
      break;
      
    case 'startGame':
      console.log(`Solicitud de inicio de juego. Jugadores: ${gameState.players.size}, Mínimo: ${SERVER_CONFIG.minPlayers}`);
      
      // Verificar si hay suficientes jugadores (usando la configuración)
      if (gameState.players.size >= SERVER_CONFIG.minPlayers) {
        console.log(`Iniciando juego con ${gameState.players.size} jugadores (mínimo: ${SERVER_CONFIG.minPlayers})`);
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
      // MODIFICAR: Actualizar inputs del jugador (ahora también en sala de espera)
      if (gameState.players.has(clientId)) {
        const player = gameState.players.get(clientId);
        player.keys = data.keys;
        // En sala de espera también procesamos inputs, pero con menos frecuencia de broadcast
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
