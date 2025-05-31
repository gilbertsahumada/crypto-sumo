// Placeholder ABI for the Crypto Sumo smart contract
// Replace this with the actual ABI once you have your contract deployed

// Contract address - replace this with your actual contract address when deployed
const SUMO_CONTRACT_ADDRESS = "0xYourContractAddressHere"; 

// Contract ABI - this is just a basic structure, you'll need to replace it with your actual contract ABI
const SUMO_CONTRACT_ABI = [
    {
        "inputs": [],
        "name": "joinGame",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getPlayers",
        "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getPrizePool",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view", 
        "type": "function"
    }
    // Add other contract functions as needed when you have the full contract
];
