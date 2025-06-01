/**
 * Servicio para detectar el estado del juego en la blockchain
 * y sincronizar con la interfaz de usuario.
 */
class GameStateService {
  constructor(contractAddress, contractABI, provider) {
    this.contractAddress = contractAddress;
    this.contractABI = contractABI;
    this.provider = provider;
    this.contract = null;
    this.gameStartedCallbacks = [];
    this.gameEndedCallbacks = [];
    this.pollInterval = null;
    this.isListening = false;
    this.isPolling = false;
    this.isGameActive = false;
    this.debugMode = false;
  }

  /**
   * Inicializar el servicio con un proveedor
   */
  async initialize(signer = null) {
    try {
      // Crear instancia del contrato con signer si está disponible, o con provider
      if (signer) {
        this.contract = new ethers.Contract(this.contractAddress, this.contractABI, signer);
        console.log("GameStateService: Inicializado con signer");
      } else if (this.provider) {
        this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.provider);
        console.log("GameStateService: Inicializado con provider");
      } else {
        throw new Error("Se requiere provider o signer para inicializar");
      }

      // Verificar el estado actual del juego
      this.isGameActive = await this.getGameState();
      console.log(`GameStateService: Estado inicial del juego: ${this.isGameActive ? 'activo' : 'inactivo'}`);
      
      // Si el juego está activo, notificar inmediatamente
      if (this.isGameActive) {
        this.notifyGameStarted();
      }

      // Iniciar escucha de eventos
      this.startEventListening();
      
      // Iniciar polling como respaldo
      this.startPolling();
      
      return true;
    } catch (error) {
      console.error("Error inicializando GameStateService:", error);
      return false;
    }
  }

  /**
   * Configurar escucha de eventos del contrato
   */
  startEventListening() {
    if (!this.contract || this.isListening) return;
    
    try {
      // Escuchar evento GameStarted
      this.contract.on("GameStarted", (timestamp) => {
        console.log(`GameStateService: Evento GameStarted detectado, timestamp: ${timestamp}`);
        this.isGameActive = true;
        this.notifyGameStarted();
      });
      
      // Escuchar evento GameEnded si existe
      try {
        this.contract.on("GameEnded", (winner, amount) => {
          console.log(`GameStateService: Evento GameEnded detectado, ganador: ${winner}, premio: ${amount}`);
          this.isGameActive = false;
          this.notifyGameEnded(winner, amount);
        });
      } catch (error) {
        console.log("GameStateService: Evento GameEnded no disponible en el contrato");
      }
      
      this.isListening = true;
      console.log("GameStateService: Escucha de eventos iniciada");
    } catch (error) {
      console.error("Error configurando escucha de eventos:", error);
    }
  }

  /**
   * Iniciar verificación periódica del estado del juego
   */
  startPolling(intervalMs = 5000) {
    if (this.isPolling || !this.contract) return;
    
    this.isPolling = true;
    console.log(`GameStateService: Iniciando polling cada ${intervalMs}ms`);
    
    this.pollInterval = setInterval(async () => {
      try {
        const currentState = await this.getGameState();
        
        // Si el estado cambió de inactivo a activo
        if (currentState && !this.isGameActive) {
          console.log("GameStateService: Juego activado (detectado por polling)");
          this.isGameActive = true;
          this.notifyGameStarted();
        } 
        // Si el estado cambió de activo a inactivo
        else if (!currentState && this.isGameActive) {
          console.log("GameStateService: Juego finalizado (detectado por polling)");
          this.isGameActive = false;
          this.notifyGameEnded();
        }
      } catch (error) {
        console.warn("Error en polling de estado:", error);
      }
    }, intervalMs);
  }

  /**
   * Detener la verificación periódica
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.isPolling = false;
      console.log("GameStateService: Polling detenido");
    }
  }

  /**
   * Obtener el estado actual del juego desde el contrato
   */
  async getGameState() {
    if (!this.contract) return false;
    
    try {
      return await this.contract.getGameState();
    } catch (error) {
      console.error("Error obteniendo estado del juego:", error);
      return false;
    }
  }

  /**
   * Registrar callback para cuando el juego comience
   */
  onGameStarted(callback) {
    if (typeof callback === 'function') {
      this.gameStartedCallbacks.push(callback);
    }
  }

  /**
   * Registrar callback para cuando el juego termine
   */
  onGameEnded(callback) {
    if (typeof callback === 'function') {
      this.gameEndedCallbacks.push(callback);
    }
  }

  /**
   * Notificar a todos los callbacks que el juego ha comenzado
   */
  notifyGameStarted() {
    console.log(`GameStateService: Notificando inicio de juego a ${this.gameStartedCallbacks.length} listeners`);
    for (const callback of this.gameStartedCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error("Error en callback de inicio de juego:", error);
      }
    }
  }

  /**
   * Notificar a todos los callbacks que el juego ha terminado
   */
  notifyGameEnded(winner = null, amount = null) {
    console.log(`GameStateService: Notificando fin de juego a ${this.gameEndedCallbacks.length} listeners`);
    for (const callback of this.gameEndedCallbacks) {
      try {
        callback(winner, amount);
      } catch (error) {
        console.error("Error en callback de fin de juego:", error);
      }
    }
  }

  /**
   * Limpiar recursos y detener escucha
   */
  cleanup() {
    this.stopPolling();
    
    if (this.contract && this.isListening) {
      // Detener escucha de eventos
      try {
        this.contract.removeAllListeners("GameStarted");
        this.contract.removeAllListeners("GameEnded");
      } catch (error) {
        console.warn("Error removiendo listeners:", error);
      }
      this.isListening = false;
    }
    
    console.log("GameStateService: Recursos liberados");
  }
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameStateService;
}
