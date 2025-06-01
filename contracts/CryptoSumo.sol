// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CryptoSumo {
    uint256 public constant GAME_DURATION = 60 seconds; // 5 minutes
    uint256 public constant MIN_STAKE = 0.01 ether;
    uint256 public constant MAX_PLAYERS = 4;
    uint256 private constant SPEED_PROBABILITY = 30;    // 10%
    uint256 private constant SHIELD_PROBABILITY = 40;     // 30%
    uint256 private constant STRENGTH_PROBABILITY = 30; // 60%
    // Flow Cadence Arch contract for randomness
    address constant public cadenceArch = 0x0000000000000000000000010000000000000001;

    uint256 public totalPrizePool = 0; 
    uint256 public gameStartTime;    // Tiempo de inicio
    uint256 public gameEndTime;      // Tiempo de fin
    uint256 public playerCount;      // Número de jugadores
    bool public gameState = false;  // true if game is active
    mapping(address => Player) players; //Stake and Status
    address[] activePlayers;  //Players in game
    mapping(uint256 => string) powerUps;
    mapping(uint256 => uint256) powerUpSpawnTimes;

    struct Player {
        uint256 stakingAmount;    // Staked ETH
        bool isActive;            
    }

    event PlayerJoined(address indexed player, uint256 stakeAmount);
    event GameStarted(uint256 startTime);
    event GameEnded(address indexed winner, uint256 prizeAmount);
    event GameRestarted();
    event PowerUpCreated(string power1, uint256 time1, string power2, uint256 time2, string power3, uint256 time3);
    event PlayerRemoved(address indexed player);

    constructor() {
        totalPrizePool = 0;
        gameStartTime = 0;
        gameEndTime = 0;
        playerCount = 0;
        gameState = false;
    }

    function joinGame() external payable {
        require(!gameState, "Game already in progress");
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(activePlayers.length < MAX_PLAYERS+1, "Game is full");
        require(players[msg.sender].stakingAmount == 0, "Already joined");

        players[msg.sender] = Player({
            stakingAmount: msg.value,
            isActive: true
        });

        activePlayers.push(msg.sender);
        playerCount++;
        totalPrizePool += msg.value;

        emit PlayerJoined(msg.sender, msg.value);

        if (activePlayers.length == MAX_PLAYERS) {
            (string memory p1, uint256 t1, string memory p2, uint256 t2, string memory p3, uint256 t3) = startGame();
            powerUps[0] = p1;
            powerUps[1] = p2;
            powerUps[2] = p3;
            powerUpSpawnTimes[0] = t1;
            powerUpSpawnTimes[1] = t2;
            powerUpSpawnTimes[2] = t3;
        }
    }

    function startGame() public returns (string memory, uint256, string memory, uint256, string memory, uint256) {
        require(!gameState, "Game already in progress");
        gameState = true;
        gameStartTime = block.timestamp;
        gameEndTime = block.timestamp + GAME_DURATION;
        emit GameStarted(block.timestamp);
        return _createPowerUps();
    }

    function _createPowerUps() public returns (string memory, uint256, string memory, uint256, string memory, uint256) {
        string memory power1 = _auxPowerUp(getRandomInRange(0, 100));
        string memory power2 = _auxPowerUp(getRandomInRange(0, 100));
        string memory power3 = _auxPowerUp(getRandomInRange(0, 100));
    
        uint256 random_time1 =  getRandomInRange(0, uint64(GAME_DURATION));
        uint256 random_time2 =  getRandomInRange(0, uint64(GAME_DURATION));
        uint256 random_time3 =  getRandomInRange(0, uint64(GAME_DURATION));
    
        emit PowerUpCreated(power1, random_time1, power2, random_time2, power3, random_time3);
        return (power1, random_time1, power2, random_time2, power3, random_time3);
    }

    function _auxPowerUp(uint256 random_powerup) internal pure returns (string memory) {
        if (random_powerup < SPEED_PROBABILITY) {
            return "speed";
        } else if (random_powerup < SPEED_PROBABILITY + SHIELD_PROBABILITY) {
            return "shield";
        } else {
            return "strength";
        }
    }

    function getRandomInRange(uint64 min, uint64 max) internal view returns (uint64) {
        // Static call to the Cadence Arch contract's revertibleRandom function
        (bool ok, bytes memory data) = cadenceArch.staticcall(abi.encodeWithSignature("revertibleRandom()"));
        require(ok, "Failed to fetch a random number through Cadence Arch");
        uint64 randomNumber = abi.decode(data, (uint64));

        // Return the number in the specified range
        return (randomNumber % (max + 1 - min)) + min;
    }

    function getPlayerInfo(address player) external view  returns (Player memory) {
        return players[player];
    }

    function getGameState() external view  returns (bool) {
        return gameState;
    }

    function getActivePlayers() external view  returns (address[] memory) {
        return activePlayers;
    }

    function removePlayer(address _player) external {
        require(msg.sender == _player, "You can only eliminate yourself");
        require(!gameState, "Game is active, you cannot eliminate yourself");
        require(players[_player].isActive, "Player is not active in this game");

        players[_player].isActive = false;
        
        uint256 stakeToReturn = players[_player].stakingAmount;
        if (stakeToReturn > 0) {
            players[_player].stakingAmount = 0;
            totalPrizePool -= stakeToReturn;
            payable(_player).transfer(stakeToReturn);
        }
        
        for (uint i = 0; i < activePlayers.length; i++) {
            if (activePlayers[i] == _player) {
                activePlayers[i] = activePlayers[activePlayers.length - 1];
                activePlayers.pop();
                break;
            }
        }

        playerCount--;
        emit PlayerRemoved(_player);

    }

    function assignWinnerAndRestart(address winner) external {
        require(gameState, "Game is not active");
        require(winner != address(0), "Winner cannot be the zero address");
        require(players[winner].isActive, "Winner is not a valid player");
        
        uint256 prize = totalPrizePool;
        totalPrizePool = 0;
        payable(winner).transfer(prize);
        emit GameEnded(winner, prize);
        _restartGame();
    }
    
    function _restartGame() internal {
        gameState = false;
        totalPrizePool = 0;
        gameStartTime = 0;
        gameEndTime = 0;
        playerCount = 0;

        for (uint i = 0; i < activePlayers.length; i++) {
            delete players[activePlayers[i]];
        }
        delete activePlayers;
        emit GameRestarted();
    }

    function getPlayerStake(address _player) external view returns (uint256) {
        return players[_player].stakingAmount;
    }

    function getPlayerStatus(address _player) external view returns (bool) {
        return players[_player].isActive;
    }

    function getPowerUp(uint256 _powerUpId) external view returns (string memory) {
        return powerUps[_powerUpId];
    }

    function getPowerUpSpawnTimes(uint256 _powerUpId) external view returns (uint256) {
        return powerUpSpawnTimes[_powerUpId];
    }

    function emergencyWithdraw() external {
        require(!gameState, "Game is active");
        payable(msg.sender).transfer(address(this).balance);
    }
} 