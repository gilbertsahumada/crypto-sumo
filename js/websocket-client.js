class GameConnection {
    constructor(url) {
        this.socket = null;
        this.connected = false;
        this.url = url || 'ws://localhost:3000';
        this.clientId = null;
        this.callbacks = {
            onConnect: () => {},
            onDisconnect: () => {},
            onServerStateUpdate: () => {},
            onBlockchainStateResult: () => {},
            onError: () => {}
        };
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.heartbeatInterval = null;
    }

    connect() {
        try {
            console.log(`Conectando a ${this.url}...`);
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                console.log('Conexión WebSocket establecida');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.callbacks.onConnect();
            };

            this.socket.onclose = (event) => {
                console.log(`Conexión WebSocket cerrada: ${event.code} ${event.reason}`);
                this.connected = false;
                this.stopHeartbeat();
                this.callbacks.onDisconnect();
                
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Reconectando (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
                    setTimeout(() => this.connect(), 3000);
                }
            };

            this.socket.onerror = (error) => {
                console.error('Error en WebSocket:', error);
                this.callbacks.onError(error);
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error procesando mensaje:', error);
                }
            };
        } catch (error) {
            console.error('Error creando conexión WebSocket:', error);
            this.callbacks.onError(error);
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'connection':
                console.log(`ID de conexión: ${data.id}`);
                this.clientId = data.id;
                if (data.serverState) {
                    this.callbacks.onServerStateUpdate(data.serverState);
                }
                break;
                
            case 'serverStateUpdate':
                this.callbacks.onServerStateUpdate(data.data);
                break;
                
            case 'blockchainStateResult':
                console.log('Resultado verificación blockchain:', data);
                this.callbacks.onBlockchainStateResult(data);
                break;
                
            case 'error':
                console.error('Error del servidor:', data.message);
                this.callbacks.onError(new Error(data.message));
                break;
                
            default:
                console.log('Mensaje no manejado:', data);
        }
    }

    registerPlayer(address, bet) {
        return this.sendMessage({
            type: 'registerPlayer',
            address: address,
            bet: bet
        });
    }

    checkBlockchainState(address) {
        return this.sendMessage({
            type: 'checkBlockchainState',
            address: address
        });
    }

    requestGameState() {
        return this.sendMessage({
            type: 'requestGameState'
        });
    }

    // AÑADIR: Método para verificar estado de jugadores en servidor
    checkConnectedPlayers() {
        return this.sendMessage({
            type: 'getConnectedPlayers'
        });
    }

    // AÑADIR: Método para obtener información detallada del servidor
    getServerInfo() {
        return this.sendMessage({
            type: 'getServerInfo'
        });
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendMessage({
                type: 'heartbeat',
                timestamp: Date.now()
            });
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    setCallback(type, callback) {
        if (this.callbacks.hasOwnProperty(type)) {
            this.callbacks[type] = callback;
        } else {
            console.warn(`Tipo de callback no soportado: ${type}`);
        }
    }

    sendMessage(message) {
        if (!this.connected || !this.socket) {
            console.warn('No se puede enviar mensaje: no conectado');
            return false;
        }
        
        try {
            this.socket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            return false;
        }
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameConnection;
}
