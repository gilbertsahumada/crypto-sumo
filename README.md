# Crypto Sumo 🥋

A blockchain-based multiplayer sumo wrestling game where players bet FLOW tokens and compete in a virtual sumo ring. The last player standing wins the entire prize pool!

![Crypto Sumo Logo](./public/logo.png)

## 🎮 Game Overview

Crypto Sumo is an exciting real-time multiplayer game built on the Flow blockchain. Players place bets using FLOW tokens, which determines their wrestler's size and strength. The objective is simple: push your opponents out of the ring while avoiding being eliminated yourself.

### Key Features

- **Blockchain Integration**: Built on Flow Testnet with smart contract integration
- **Real-time Multiplayer**: WebSocket-based multiplayer gameplay
- **Dynamic Sizing**: Player size and strength based on bet amount
- **Power-ups**: Collect temporary abilities (Strength, Speed, Shield, Magnet)
- **Wallet Integration**: MetaMask and other Web3 wallet support
- **Responsive Design**: Dojo-themed UI with golden aesthetics
- **Character Variety**: 4 unique sumo wrestler characters

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MetaMask or compatible Web3 wallet
- FLOW tokens on Flow Testnet

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/crypto-sumo.git
cd crypto-sumo
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

### Development Mode

For development with auto-restart:
```bash
npm run dev
```

## 🎯 How to Play

1. **Connect Wallet**: Click "Connect Wallet" and connect your MetaMask wallet
2. **Switch Network**: The game will prompt you to switch to Flow Testnet
3. **Place Bet**: Enter your bet amount (minimum 0.001 FLOW)
4. **Join Game**: Click "Join Game" to enter the arena
5. **Wait for Players**: Game starts when minimum players join
6. **Fight**: Use WASD or arrow keys to move your sumo wrestler
7. **Collect Power-ups**: Grab floating power-ups for temporary advantages
8. **Win**: Be the last player standing to win the entire prize pool!

### Controls

- **Movement**: WASD keys or Arrow keys
- **Objective**: Push opponents out of the circular ring
- **Strategy**: Larger bets = bigger, stronger wrestlers

### Power-ups

- 💪 **Strength**: Increased pushing force for 5 seconds
- ⚡ **Speed**: Enhanced movement speed for 5 seconds
- 🛡️ **Shield**: Protection from being pushed for 3 seconds
- 🧲 **Magnet**: Attract nearby power-ups for 4 seconds

## 🏗️ Project Structure

```
crypto-sumo/
├── css/
│   └── styles.css          # Dojo-themed styling
├── js/
│   ├── main.js            # Main game logic
│   ├── wallet.js          # Wallet management
│   ├── game-logic.js      # Core game mechanics
│   ├── websocket-client.js # Multiplayer communication
│   ├── config.js          # Game configuration
│   └── utils.js           # Utility functions
├── server/
│   └── server.js          # WebSocket server
├── contracts/
│   ├── CryptoSumo.sol     # Smart contract
│   └── abi.json           # Contract ABI
├── public/
│   ├── logo.png           # Game logo
│   ├── sumo_one.PNG       # Character sprites
│   ├── sumo_two.PNG
│   ├── sumo_three.PNG
│   ├── sumo_four.PNG
│   ├── sumo_strength.PNG  # Power-up overlays
│   ├── sumo_speed.PNG
│   └── sumo_shield.PNG
└── index.html             # Main game interface
```

## 🔧 Technical Details

### Blockchain Integration

- **Network**: Flow Testnet (Chain ID: 545)
- **Smart Contract**: Handles bet management and game state
- **Wallet Support**: MetaMask, WalletConnect compatible wallets

### Game Mechanics

- **Player Size**: Calculated based on bet amount using logarithmic scaling
- **Physics**: Real-time collision detection and momentum-based combat
- **Networking**: WebSocket for low-latency multiplayer synchronization
- **Character Assignment**: Automatic assignment of unique character sprites

### Configuration Options

The game includes configurable settings in `js/config.js`:

```javascript
const GAME_CONFIG = {
    minPlayers: 1,     // Minimum players to start (set to 2 for production)
    testMode: true,    // Enable test features
    gameTime: 60       // Game duration in seconds
};
```

## 🛠️ Development

### Smart Contract

The game uses a Solidity smart contract deployed on Flow Testnet:

- **Bet Management**: Handles player bets and prize pool
- **Game State**: Tracks active games and players
- **Random Power-ups**: Uses Flow's Cadence Arch for randomness
- **Winner Selection**: Automatic prize distribution

### Server Architecture

- **Express.js**: HTTP server for static files
- **WebSocket**: Real-time game state synchronization
- **Game Loop**: Server-side physics simulation
- **Player Management**: Connection handling and game rooms

### Frontend Features

- **HTML5 Canvas**: 2D game rendering
- **Ethers.js**: Blockchain interaction
- **Responsive Design**: Mobile-friendly interface
- **Visual Effects**: Particle effects, screen shake, glow effects

## 🎨 Design Features

### Dojo Theme

The game features a traditional Japanese dojo aesthetic:

- **Golden Color Palette**: Warm golds, beiges, and browns
- **Sumo Ring**: Circular canvas with traditional styling
- **Character Sprites**: Authentic sumo wrestler designs
- **Visual Effects**: Glowing power-ups and impact feedback

### UI/UX

- **Intuitive Controls**: Simple keyboard-based movement
- **Real-time Feedback**: Visual indicators for game state
- **Wallet Integration**: Seamless Web3 wallet connection
- **Network Switching**: Automatic Flow Testnet setup

## 🚀 Deployment

### Heroku Deployment

The project includes a Procfile for easy Heroku deployment:

```
web: node server/server.js
```

### Environment Setup

1. Set up Flow Testnet wallet
2. Deploy smart contract to Flow Testnet
3. Update contract address in configuration
4. Deploy to hosting platform

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Flow Blockchain](https://flow.com/)
- [Flow Testnet Faucet](https://testnet-faucet.onflow.org/)
- [MetaMask](https://metamask.io/)
- [Game Demo](https://your-deployed-game-url.com)

## 🆘 Troubleshooting

### Common Issues

**Wallet Connection Issues:**
- Ensure MetaMask is installed and unlocked
- Switch to Flow Testnet network
- Clear browser cache if connection fails

**Game Performance:**
- Use modern browsers (Chrome, Firefox, Safari)
- Ensure stable internet connection for multiplayer
- Close unnecessary browser tabs

**Transaction Failures:**
- Verify sufficient FLOW balance
- Check network congestion
- Increase gas limit if needed

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Contact the development team
- Join our Discord community

---

**Happy Sumo Wrestling! 🥋🏆**
