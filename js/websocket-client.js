class GameConnection {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.clientId = null;
        this.serverUrl = this.getWebSocketUrl();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.callbacks = {
            onConnect: null,
            onDisconnect: null,
            onGameState: null,
            onError: null
        };
    }

    getWebSocketUrl() {
        // Determinar URL de WebSocket basada en la URL actual
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || (protocol === 'wss:' ? '443' : '80');
        
        // Para desarrollo local, usa localhost:3000
        if (host === 'localhost' || host === '127.0.0.1') {
            return `${protocol}//${host}:3000`;
        }
        
        // Para producción, usa la misma base de URL
        return `${protocol}//${host}:${port}`;
    }

    connect() {
        try {
            console.log(`Conectando a WebSocket: ${this.serverUrl}`);
            this.socket = new WebSocket(this.serverUrl);

            this.socket.onopen = () => {
                console.log('Conexión WebSocket establecida');
                this.connected = true;
                this.reconnectAttempts = 0;
                if (this.callbacks.onConnect) this.callbacks.onConnect();
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.socket.onclose = () => {
                console.log('Conexión WebSocket cerrada');
                this.connected = false;
                if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();
                this.attemptReconnect();
            };

            this.socket.onerror = (error) => {
                console.error('Error de WebSocket:', error);
                if (this.callbacks.onError) this.callbacks.onError(error);
            };
        } catch (error) {
            console.error('Error al crear conexión WebSocket:', error);
            if (this.callbacks.onError) this.callbacks.onError(error);
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Máximo de intentos de reconexión alcanzado');
            return;
        }

        this.reconnectAttempts++;
        console.log(`Intentando reconectar (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        setTimeout(() => {
            this.connect();
        }, 2000 * this.reconnectAttempts); // Backoff exponencial
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'connection':
                    this.clientId = message.id;
                    console.log(`ID de cliente asignado: ${this.clientId}`);
                    break;
                    
                case 'gameState':
                    if (this.callbacks.onGameState) {
                        this.callbacks.onGameState(message.data);
                    }
                    break;
                    
                default:
                    console.log('Mensaje desconocido:', message);
            }
        } catch (error) {
            console.error('Error al procesar mensaje:', error);
        }
    }

    send(type, data = {}) {
        if (!this.connected || !this.socket) {
            console.error('No se puede enviar mensaje, no hay conexión');
            return false;
        }

        try {
            const message = JSON.stringify({
                type,
                ...data
            });
            this.socket.send(message);
            return true;
        } catch (error) {
            console.error('Error al enviar mensaje:', error);
            return false;
        }
    }

    joinGame(betAmount, walletAddress) {
        return this.send('joinGame', {
            bet: betAmount,
            address: walletAddress,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`
        });
    }

    startGame() {
        return this.send('startGame');
    }

    sendPlayerInput(keys) {
        return this.send('playerInput', { keys });
    }

    setCallback(event, callback) {
        if (this.callbacks.hasOwnProperty(event)) {
            this.callbacks[event] = callback;
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.connected = false;
        }
    }
}
