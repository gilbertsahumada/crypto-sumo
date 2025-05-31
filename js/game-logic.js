class GameLogic {
    constructor() {
        this.assignedCharacters = new Set();
        this.nextCharacterIndex = 1;
    }

    getNextAvailableCharacter() {
        for (let i = 1; i <= 4; i++) {
            if (!this.assignedCharacters.has(i)) {
                this.assignedCharacters.add(i);
                return i;
            }
        }

        const characterIndex = ((this.nextCharacterIndex - 1) % 4) + 1;
        this.nextCharacterIndex++;
        return characterIndex;
    }

    releaseCharacter(characterIndex) {
        this.assignedCharacters.delete(characterIndex);
    }

    calculatePlayerSize(bet) {
        const minSize = 20;
        const maxSize = 50;
        const scaleFactor = 1000;

        const calculatedSize = minSize + (bet * scaleFactor);
        return Math.max(minSize, Math.min(maxSize, calculatedSize));
    }

    createPlayer(betAmount, walletAddress) {
        const playerId = walletAddress;
        const characterIndex = this.getNextAvailableCharacter();

        const player = {
            id: playerId,
            address: walletAddress,
            bet: betAmount,
            x: 300 + (Math.random() - 0.5) * 200,
            y: 300 + (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0,
            radius: this.calculatePlayerSize(betAmount),
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            alive: true,
            powerup: null,
            powerupEndTime: 0,
            keys: {},
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: 0,
            characterIndex: characterIndex
        };

        return player;
    }

    addDemoPlayers() {
        const demoPlayers = [
            { bet: 0.005, color: '#ff6b6b' },
            { bet: 0.025, color: '#4ecdc4' },
            { bet: 0.015, color: '#45b7d1' }
        ];

        const players = [];
        demoPlayers.forEach((demo, i) => {
            const playerId = `demo_${i}`;
            const characterIndex = this.getNextAvailableCharacter();

            const player = {
                id: playerId,
                address: '0x' + Math.random().toString(16).substring(2, 42),
                bet: demo.bet,
                x: 300 + (Math.random() - 0.5) * 200,
                y: 300 + (Math.random() - 0.5) * 200,
                vx: 0,
                vy: 0,
                radius: this.calculatePlayerSize(demo.bet),
                color: demo.color,
                alive: true,
                powerup: null,
                powerupEndTime: 0,
                keys: {},
                isAI: true,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: 0,
                characterIndex: characterIndex
            };

            players.push(player);
            console.log(`Demo player ${playerId} asignado al personaje ${characterIndex}, tamaño: ${player.radius}`);
        });

        return players;
    }

    resetCharacters() {
        this.assignedCharacters.clear();
        this.nextCharacterIndex = 1;
    }

    spawnPowerup(centerX, centerY, ringRadius) {
        const types = Object.keys(POWERUP_TYPES);
        const type = types[Math.floor(Math.random() * types.length)];

        const angle = Math.random() * Math.PI * 2;
        const minRadius = ringRadius * 0.2;
        const maxRadius = ringRadius * 0.7;
        const distance = minRadius + Math.random() * (maxRadius - minRadius);

        return {
            type: type,
            x: centerX + Math.cos(angle) * distance,
            y: centerY + Math.sin(angle) * distance,
            rotation: 0
        };
    }
}
