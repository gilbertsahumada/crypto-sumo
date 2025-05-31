// Flow Testnet Network Configuration
const FLOW_TESTNET = {
    chainId: '0x221', // 545 in decimal
    chainName: 'Flow Testnet',
    rpcUrls: ['https://testnet.evm.nodes.onflow.org'],
    nativeCurrency: {
        name: 'FLOW',
        symbol: 'FLOW',
        decimals: 18
    },
    blockExplorerUrls: ['https://testnet.flowscan.org']
};

// Configuración del juego
const GAME_CONFIG = {
    minPlayers: 1,     // Cambiar a 2 para el modo normal
    testMode: true,    // Activa características de prueba
    gameTime: 60       // Duración de la partida en segundos
};

// Game mechanics
const POWERUP_TYPES = {
    STRENGTH: { emoji: '💪', color: '#ff4444', duration: 5000 },
    SPEED: { emoji: '⚡', color: '#44ff44', duration: 5000 },
    SHIELD: { emoji: '🛡️', color: '#4444ff', duration: 3000 },
    MAGNET: { emoji: '🧲', color: '#ff44ff', duration: 4000 }
};
