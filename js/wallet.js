class WalletManager {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.walletConnected = false;
        this.walletAddress = '';
    }

    async setupEthers() {
        try {
            if (window.ethereum) {
                this.provider = new ethers.BrowserProvider(window.ethereum);
                console.log("Ethers.js initialized with BrowserProvider (v6)");
            } else {
                console.log("No Ethereum wallet detected");
            }
        } catch (error) {
            console.error("Error setting up ethers:", error);
        }
    }

    async connectWallet() {
        try {
            if (!window.ethereum) {
                alert("MetaMask or other Ethereum wallet not found! Please install MetaMask.");
                this.simulateWalletConnection();
                return;
            }

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (!accounts || accounts.length === 0) {
                alert("No accounts found or permission denied.");
                this.simulateWalletConnection();
                return;
            }

            document.getElementById('networkStatus').textContent = "Checking network...";

            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== FLOW_TESTNET.chainId) {
                document.getElementById('networkStatus').textContent = "Switching to Flow Testnet...";
                showMessage("Attempting to switch to Flow Testnet...");

                try {
                    const switched = await this.switchToFlowTestnet();
                    if (!switched) {
                        document.getElementById('networkStatus').textContent = "Please add Flow network manually";
                        this.showManualNetworkInstructions();
                        return;
                    }
                } catch (switchError) {
                    console.error("Switch error:", switchError);
                    document.getElementById('networkStatus').textContent = "Network switch failed";
                    this.showManualNetworkInstructions();
                    return;
                }
            }

            if (!this.provider) {
                this.provider = new ethers.BrowserProvider(window.ethereum);
            }

            this.signer = await this.provider.getSigner();
            this.walletAddress = await this.signer.getAddress();
            this.walletConnected = true;

            this.updateWalletUI();
            this.setupWalletEvents();

            const balance = await this.provider.getBalance(this.walletAddress);
            const etherBalance = ethers.formatEther(balance);

            console.log("Wallet connected:", this.walletAddress);
            console.log("Balance:", etherBalance, "FLOW");

            showMessage(`Wallet connected: ${etherBalance} FLOW`);
        } catch (error) {
            console.error("Error connecting wallet:", error);
            alert(`Error connecting wallet: ${error.message || error}`);
            document.getElementById('networkStatus').textContent = "Connection failed";
            this.simulateWalletConnection();
        }
    }

    async disconnectWallet() {
        try {
            this.walletConnected = false;
            this.walletAddress = '';
            this.signer = null;

            document.getElementById('walletAddress').textContent = 'Not Connected';
            document.getElementById('connectWallet').style.display = 'inline-block';
            document.getElementById('disconnectWallet').style.display = 'none';
            document.getElementById('networkStatus').textContent = '';
            document.getElementById('joinGame').disabled = false;
            document.getElementById('joinGame').textContent = 'Join Game (Bet FLOW)';

            showMessage('Wallet disconnected');
        } catch (error) {
            console.error("Error disconnecting wallet:", error);
            showMessage('Error disconnecting wallet');
        }
    }

    updateWalletUI() {
        document.getElementById('walletAddress').textContent = 
            this.walletAddress.substring(0, 6) + '...' + this.walletAddress.substring(38);
        document.getElementById('connectWallet').style.display = 'none';
        document.getElementById('disconnectWallet').style.display = 'inline-block';
        document.getElementById('networkStatus').textContent = "Connected to Flow Testnet";
    }

    showManualNetworkInstructions() {
        const instructions = document.createElement('div');
        instructions.style.position = 'fixed';
        instructions.style.top = '50%';
        instructions.style.left = '50%';
        instructions.style.transform = 'translate(-50%, -50%)';
        instructions.style.background = 'rgba(0,0,0,0.9)';
        instructions.style.color = 'white';
        instructions.style.padding = '20px';
        instructions.style.borderRadius = '10px';
        instructions.style.maxWidth = '400px';
        instructions.style.zIndex = '1001';
        instructions.innerHTML = `
            <h3 style="color: #FFD700;">Add Flow Network Manually</h3>
            <p>Please add Flow Testnet to your wallet with these details:</p>
            <ul style="text-align: left; margin: 15px 0;">
                <li>Network Name: Flow Testnet</li>
                <li>RPC URL: https://testnet.evm.nodes.onflow.org</li>
                <li>Chain ID: 545 (0x221)</li>
                <li>Currency Symbol: FLOW</li>
                <li>Block Explorer: https://testnet.flowscan.org</li>
            </ul>
            <button id="closeInstructions" class="btn" style="margin-top: 10px;">Close</button>
            <button id="tryAgain" class="btn" style="margin-top: 10px; margin-left: 10px;">Try Again</button>
        `;

        document.body.appendChild(instructions);

        document.getElementById('closeInstructions').addEventListener('click', () => {
            document.body.removeChild(instructions);
        });

        document.getElementById('tryAgain').addEventListener('click', () => {
            document.body.removeChild(instructions);
            this.connectWallet();
        });
    }

    async switchToFlowTestnet() {
        try {
            console.log("Attempting to switch to Flow Testnet, chainId:", FLOW_TESTNET.chainId);

            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: FLOW_TESTNET.chainId }],
            });
            console.log("Network switch successful");
            return true;
        } catch (switchError) {
            console.log("Switch error:", switchError);

            if (switchError.code === 4902 || switchError.message.includes("wallet_addEthereumChain")) {
                try {
                    console.log("Attempting to add Flow Testnet to wallet");
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId: FLOW_TESTNET.chainId,
                                chainName: FLOW_TESTNET.chainName,
                                nativeCurrency: FLOW_TESTNET.nativeCurrency,
                                rpcUrls: FLOW_TESTNET.rpcUrls,
                                blockExplorerUrls: FLOW_TESTNET.blockExplorerUrls
                            }
                        ],
                    });

                    const newChainId = await window.ethereum.request({ method: 'eth_chainId' });
                    console.log("New chain ID after add:", newChainId);
                    return newChainId === FLOW_TESTNET.chainId;
                } catch (addError) {
                    console.error('Error adding Flow Testnet to wallet:', addError);
                    return false;
                }
            }
            console.error('Error switching to Flow Testnet:', switchError);
            return false;
        }
    }

    setupWalletEvents() {
        if (!window.ethereum) return;

        try {
            window.ethereum.removeAllListeners('accountsChanged');
            window.ethereum.removeAllListeners('chainChanged');
        } catch (error) {
            console.log('No previous listeners to remove');
        }

        const handleAccountsChanged = async (accounts) => {
            console.log('Accounts changed:', accounts);
            if (accounts.length === 0) {
                this.disconnectWallet();
            } else {
                try {
                    this.walletAddress = accounts[0];
                    document.getElementById('walletAddress').textContent = 
                        this.walletAddress.substring(0, 6) + '...' + this.walletAddress.substring(38);
                    if (this.provider) {
                        this.signer = await this.provider.getSigner();
                    }
                    showMessage('Account changed');
                } catch (error) {
                    console.error('Error handling account change:', error);
                }
            }
        };

        const handleChainChanged = async (chainId) => {
            console.log('Chain changed to:', chainId);

            if (chainId !== FLOW_TESTNET.chainId) {
                document.getElementById('networkStatus').textContent = "Wrong network";
                showMessage('Wrong network! Please switch to Flow Testnet', 5000);
                document.getElementById('joinGame').disabled = true;

                const switchButton = document.createElement('button');
                switchButton.className = 'btn';
                switchButton.textContent = 'Switch to Flow Testnet';
                switchButton.style.margin = '10px auto';
                switchButton.style.display = 'block';

                switchButton.onclick = async () => {
                    await this.switchToFlowTestnet();
                    document.body.removeChild(switchButton);
                };

                document.body.appendChild(switchButton);
            } else {
                document.getElementById('networkStatus').textContent = "Connected to Flow Testnet";
                document.getElementById('joinGame').disabled = false;
                showMessage('Connected to Flow Testnet ✓');
            }
        };

        try {
            if (window.ethereum.on) {
                window.ethereum.on('accountsChanged', handleAccountsChanged);
                window.ethereum.on('chainChanged', handleChainChanged);
            } else if (window.ethereum.addEventListener) {
                window.ethereum.addEventListener('accountsChanged', handleAccountsChanged);
                window.ethereum.addEventListener('chainChanged', handleChainChanged);
            } else {
                console.log('MetaMask event listeners not supported');
            }
        } catch (error) {
            console.error('Error setting up wallet events:', error);
        }
    }

    simulateWalletConnection() {
        this.walletAddress = '0x' + Math.random().toString(16).substring(2, 42);
        this.walletConnected = true;
        document.getElementById('walletAddress').textContent = 
            this.walletAddress.substring(0, 6) + '...' + this.walletAddress.substring(38);
        document.getElementById('connectWallet').textContent = 'Connected ✓';
        document.getElementById('connectWallet').disabled = true;
    }

    async processTransaction(betAmount) {
        const balance = await this.provider.getBalance(this.walletAddress);
        const betAmountWei = ethers.parseEther(betAmount.toString());

        if (balance < betAmountWei) {
            throw new Error(`Insufficient balance. You have ${ethers.formatEther(balance)} FLOW.`);
        }

        const targetAddress = "0xb322E239E5A32724633A595b8f8657F9cbb307B2";
        showMessage(`Processing ${betAmount} FLOW bet...`, 1500);

        const tx = await this.signer.sendTransaction({
            to: targetAddress,
            value: betAmountWei,
            gasLimit: 100000
        });

        console.log("Transaction sent:", tx.hash);
        showMessage(`Transaction pending... Please wait.`);

        const receipt = await tx.wait();
        console.log("Transaction confirmed:", receipt);

        return receipt;
    }
}
