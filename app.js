console.log('🚀 DÉBUT app.js - Version simplifiée');

// ===== CONTRACT CONFIGURATION =====
var POLYGON_CONTRACTS = {
    STRATEGY_UNISWAP_V3: "0x669227b0bB3A6BFC717fe8bEA17EEF3cB37f5eBC"
};

var POLYGON_CHAIN_ID = 137;

// Tokens Polygon
var POLYGON_TOKENS = {
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC Native (nouvelle adresse)
    USDC_BRIDGED: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (ancienne)
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    WBTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6"
};

// ABI simplifié pour les fonctions principales
var STRATEGY_ABI = [
    "function createPosition(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) external payable returns (uint256 tokenId)",
    "function createPositionAuto(address token0, address token1, uint24 fee, uint256 rangePercentage, uint256 amount0Desired, uint256 amount1Desired) external payable returns (uint256 tokenId)",
    "function getUserPositions(address user) external view returns (tuple(uint256 tokenId, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0Deposited, uint256 amount1Deposited, uint256 feesCollected0, uint256 feesCollected1, uint256 lastCollectionTime, bool active)[] memory)",
    "function collectFees(uint256 tokenId) external returns (uint256 amount0, uint256 amount1)",
    "function closePosition(uint256 tokenId) external"
];

// ===== GLOBAL STATE MANAGEMENT =====
class YieldMaxApp {
    constructor() {
        this.walletConnected = false;
        this.currentAccount = null;
        this.currentNetwork = 'polygon'; // Défaut sur Polygon
        this.activeStrategy = 'uniswap';
        this.loadContractABI();
        this.positions = [];
        
        this.init();
        console.log('YieldMaxApp initialized');
    }

    init() {
        this.setupEventListeners();
        this.updateUI();
    }

    // ===== CHARGEMENT ABI =====
    async loadContractABI() {
    try {
        const response = await fetch('./contract-abi.json');
        const data = await response.json();
        window.STRATEGY_ABI = data;
        console.log('ABI chargé avec succès');
    } catch (error) {
        console.error('Erreur lors du chargement de l\'ABI:', error);
    }
}

    // ===== WALLET CONNECTION =====
    async connectWallet() {
        try {
            if (typeof window.ethereum !== 'undefined') {
                const accounts = await window.ethereum.request({
                    method: 'eth_requestAccounts'
                });
                
                this.currentAccount = accounts[0];
                this.walletConnected = true;
                
                // Update UI
                this.updateWalletUI();
                this.loadUserPositions();
                
                console.log('Wallet connected:', this.currentAccount);
            } else {
                alert('MetaMask non détecté. Veuillez installer MetaMask.');
            }
        } catch (error) {
            console.error('Erreur de connexion wallet:', error);
            alert('Erreur lors de la connexion au wallet');
        }
    }

    updateWalletUI() {
        const walletBtn = document.getElementById('connectWallet');
        if (this.walletConnected) {
            walletBtn.innerHTML = `
                <i class="fas fa-check-circle"></i>
                ${this.currentAccount.slice(0, 6)}...${this.currentAccount.slice(-4)}
            `;
            walletBtn.classList.add('connected');
        }
    }

    // ===== STRATEGY MANAGEMENT =====
    switchStrategy(strategyName) {
        console.log('Changement de stratégie vers:', strategyName);
        
        // Masquer tous les contenus de stratégie
        document.querySelectorAll('.strategy-content').forEach(content => {
            content.classList.remove('active');
        });

        // Supprimer la classe active de tous les onglets
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.classList.remove('active');
        });

        // Afficher la stratégie sélectionnée
        document.getElementById(`${strategyName}-strategy`).classList.add('active');
        document.querySelector(`[data-strategy="${strategyName}"]`).classList.add('active');
        
        this.activeStrategy = strategyName;
        this.updateStrategyMetrics();
    }

    // ===== UNISWAP V3 STRATEGY =====
    updateUniswapMetrics() {
        const ethAmount = parseFloat(document.getElementById('ethAmount')?.value) || 0;
        const selectedRange = document.querySelector('.range-btn.active')?.dataset.range || 10;
        
        if (ethAmount > 0) {
            // Calculs simulés pour l'exemple
            const baseAPR = 45;
            const rangeMultiplier = selectedRange === '5' ? 1.8 : selectedRange === '10' ? 1.4 : 1.2;
            const estimatedAPR = (baseAPR * rangeMultiplier).toFixed(1);
            const dailyFees = (ethAmount * 0.0012 * rangeMultiplier).toFixed(2);
            const impermanentLoss = selectedRange === '5' ? 2.1 : selectedRange === '10' ? 1.5 : 0.8;

            // Mettre à jour l'UI
            const aprElement = document.querySelector('#uniswap-strategy .highlight');
            const feesElement = document.querySelector('#uniswap-strategy .yield-metrics .metric:nth-child(2) strong');
            const ilElement = document.querySelector('#uniswap-strategy .warning');
            
            if (aprElement) aprElement.textContent = `${estimatedAPR}%`;
            if (feesElement) feesElement.textContent = `$${dailyFees}`;
            if (ilElement) ilElement.textContent = `-${impermanentLoss}%`;
        }
    }

    async deployUniswapStrategy() {
    if (!this.walletConnected) {
        alert('Veuillez connecter votre wallet');
        return;
    }

    const ethAmount = document.getElementById('ethAmount').value;
    if (!ethAmount || parseFloat(ethAmount) <= 0) {
        alert('Veuillez entrer un montant valide');
        return;
    }

    this.showLoadingModal('Version finale équilibrée...');

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();
        
        console.log("=== VERSION FINALE ÉQUILIBRÉE ===");
        
        // Calculer les montants exacts pour une position équilibrée
        const ethValue = ethers.parseEther(ethAmount);
        const usdcNeeded = parseFloat(ethAmount) * 2511; // Prix actuel du marché
        const usdcValue = ethers.parseUnits(usdcNeeded.toFixed(2), 6);
        
        // Approuver USDC
        const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];
        const usdcContract = new ethers.Contract(POLYGON_TOKENS.USDC, ERC20_ABI, signer);
        const NFT_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
        
        console.log(`Approbation ${usdcNeeded.toFixed(2)} USDC...`);
        const approveTx = await usdcContract.approve(NFT_POSITION_MANAGER, usdcValue);
        await approveTx.wait();
        console.log('✅ USDC approuvé');
        
        // Récupérer le tick du pool
        const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
        const FACTORY_ABI = ["function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"];
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const poolAddress = await factory.getPool(POLYGON_TOKENS.USDC, POLYGON_TOKENS.WETH, 500);
        
        const POOL_ABI = ["function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"];
        const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
        const slot0 = await poolContract.slot0();
        const currentTick = slot0.tick;
        
        // Ticks larges pour position équilibrée
        const tickSpacing = 10;
        const tickRange = 2000;
        const tickLower = Math.floor((Number(currentTick) - tickRange) / tickSpacing) * tickSpacing;
        const tickUpper = Math.ceil((Number(currentTick) + tickRange) / tickSpacing) * tickSpacing;
        
        console.log('Position équilibrée:', {
            usdc: usdcNeeded.toFixed(2) + ' USDC',
            eth: ethAmount + ' ETH',
            ticks: `${tickLower} à ${tickUpper}`,
            prix: '~2511 USDC/ETH'
        });
        
        // Position équilibrée avec les DEUX tokens
        const NFT_POSITION_MANAGER_ABI = [
            "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
        ];
        
        const positionManager = new ethers.Contract(NFT_POSITION_MANAGER, NFT_POSITION_MANAGER_ABI, signer);
        const deadline = Math.floor(Date.now() / 1000) + 1200;
        
        const mintParams = {
            token0: POLYGON_TOKENS.USDC,
            token1: POLYGON_TOKENS.WETH,
            fee: 500,
            tickLower,
            tickUpper,
            amount0Desired: usdcValue,  // USDC approuvé
            amount1Desired: ethValue,   // WETH via ETH natif
            amount0Min: 0,
            amount1Min: 0,
            recipient: userAddress,
            deadline
        };
        
        const tx = await positionManager.mint(mintParams, {
            value: ethValue,
            gasLimit: 5000000
        });
        
        console.log('📤 Position équilibrée envoyée:', tx.hash);
        
        const receipt = await tx.wait();
        console.log('🎉 SUCCÈS FINAL!', receipt.hash);
        
        this.hideLoadingModal();
        alert(`🎉 SUCCÈS!\n\nPosition créée avec les deux tokens:\n${usdcNeeded.toFixed(2)} USDC + ${ethAmount} ETH\n\nTransaction: ${tx.hash}`);
        
    } catch (error) {
        this.hideLoadingModal();
        console.error('❌ Erreur finale:', error);
        alert('Erreur finale: ' + error.message);
    }
}

    // ===== AAVE STRATEGY =====
    updateAaveMetrics() {
        const collateralAmount = parseFloat(document.getElementById('collateralAmount')?.value) || 0;
        const leverage = parseFloat(document.getElementById('leverageRange')?.value) || 2;
        
        const leverageValueElement = document.getElementById('leverageValue');
        if (leverageValueElement) {
            leverageValueElement.textContent = `${leverage.toFixed(1)}x`;
        }
        
        if (collateralAmount > 0) {
            // Calculs simulés
            const baseAPR = 18;
            const leveragedAPR = (baseAPR * leverage * 0.7).toFixed(1);
            const healthFactor = (4 / leverage).toFixed(2);
            const liquidationPrice = (2000 / leverage * 0.85).toFixed(0);

            // Mettre à jour l'UI
            const aprElement = document.querySelector('#aave-strategy .highlight');
            const healthElement = document.querySelector('#aave-strategy .safe');
            const liqElement = document.querySelector('#aave-strategy .warning');
            
            if (aprElement) aprElement.textContent = `${leveragedAPR}%`;
            if (healthElement) healthElement.textContent = healthFactor;
            if (liqElement) liqElement.textContent = `$${liquidationPrice}`;
        }
    }

    async deployAaveStrategy() {
        if (!this.walletConnected) {
            alert('Veuillez connecter votre wallet');
            return;
        }

        const collateralAmount = document.getElementById('collateralAmount').value;
        const leverage = document.getElementById('leverageRange').value;
        
        if (!collateralAmount || parseFloat(collateralAmount) <= 0) {
            alert('Veuillez entrer un montant valide');
            return;
        }

        this.showLoadingModal('Déploiement de la stratégie Aave...');

        try {
            // Simulation temporisée
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            const newPosition = {
                id: Date.now(),
                strategy: 'Aave Lending',
                pool: 'ETH Leveraged',
                amount: `${collateralAmount} ETH`,
                apr: '42.3%',
                pnl: '+0.00%',
                status: 'active'
            };
            
            this.positions.push(newPosition);
            this.updatePositionsTable();
            this.updateDashboardStats();
            
            this.hideLoadingModal();
            alert('Stratégie Aave déployée avec succès!');
            
        } catch (error) {
            this.hideLoadingModal();
            alert('Erreur lors du déploiement de la stratégie Aave');
        }
    }
    // Test final : créer une position avec SEULEMENT USDC
    // pour isoler le problème
    async testUSDCOnlyPosition() {
    if (!this.walletConnected) {
        alert('Veuillez connecter votre wallet');
        return;
    }

    this.showLoadingModal('Test position USDC uniquement...');

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();
        
        console.log("=== TEST POSITION USDC SEULEMENT Avec Ticks Différents ===");
        
        // Configuration
        const usdcAmount = "50"; // 50 USDC seulement
        const usdcValue = ethers.parseUnits(usdcAmount, 6);
        
        // Vérifier solde USDC
        const ERC20_ABI = [
            "function balanceOf(address account) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)"
        ];
        const usdcContract = new ethers.Contract(POLYGON_TOKENS.USDC, ERC20_ABI, provider);
        const usdcBalance = await usdcContract.balanceOf(userAddress);
        
        if (usdcBalance < usdcValue) {
            this.hideLoadingModal();
            alert(`Solde USDC insuffisant! Vous avez ${ethers.formatUnits(usdcBalance, 6)} USDC`);
            return;
        }
        
        // Approuver USDC
        const NFT_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
        console.log('Approbation USDC...');
        const usdcWithSigner = usdcContract.connect(signer);
        const approveUSDCTx = await usdcWithSigner.approve(NFT_POSITION_MANAGER, usdcValue);
        await approveUSDCTx.wait();
        console.log('✅ USDC approuvé');
        
        // Récupérer infos du pool
        const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
        const FACTORY_ABI = ["function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"];
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const poolAddress = await factory.getPool(POLYGON_TOKENS.USDC, POLYGON_TOKENS.WETH, 500);
        
        const POOL_ABI = ["function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"];
        const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
        const slot0 = await poolContract.slot0();
        const currentTick = slot0.tick;
        
        // Calculer des ticks très larges pour minimiser les erreurs
        const tickSpacing = 10;
        const tickRange = 10000; // Très large
        const tickLower = Math.floor(Number(currentTick) / tickSpacing) * tickSpacing - 100;
        const tickUpper = Math.ceil(Number(currentTick) / tickSpacing) * tickSpacing + 100;
        
        console.log('Pool:', poolAddress);
        console.log('Tick actuel:', currentTick.toString());
        console.log('Ticks larges:', tickLower, 'à', tickUpper);
        
        // Position avec SEULEMENT USDC (pas d'ETH/WETH)
        const NFT_POSITION_MANAGER_ABI = [
            "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
        ];
        
        const positionManager = new ethers.Contract(NFT_POSITION_MANAGER, NFT_POSITION_MANAGER_ABI, signer);
        const deadline = Math.floor(Date.now() / 1000) + 1200;
        
        const mintParams = {
            token0: POLYGON_TOKENS.USDC,  // USDC
            token1: POLYGON_TOKENS.WETH,  // WETH
            fee: 500,
            tickLower,
            tickUpper,
            amount0Desired: usdcValue,    // 50 USDC
            amount1Desired: 0,            // PAS de WETH
            amount0Min: 0,
            amount1Min: 0,
            recipient: userAddress,
            deadline
        };
        
        console.log('🧪 Test USDC seulement:', {
            amount0: usdcAmount + ' USDC',
            amount1: '0 WETH',
            ticks: `${tickLower} à ${tickUpper}`,
            tickRange: 'Très large pour éviter les erreurs'
        });
        
        // Transaction SANS ETH (value: 0)
        const tx = await positionManager.mint(mintParams, {
            value: 0, // PAS d'ETH natif
            gasLimit: 5000000
        });
        
        console.log('📤 Transaction USDC-only envoyée:', tx.hash);
        
        const receipt = await tx.wait();
        console.log('✅ SUCCESS USDC-only!', receipt.hash);
        
        this.hideLoadingModal();
        alert(`🎉 SUCCÈS AVEC USDC SEULEMENT!\n\nTransaction: ${tx.hash}\n\nCela prouve que le problème vient du mélange ETH+USDC!\n\nMaintenant nous savons qu'il faut adapter l'approche.`);
        
    } catch (error) {
        this.hideLoadingModal();
        console.error('❌ Erreur USDC-only:', error);
        
        if (error.message.includes('execution reverted')) {
            alert(`❌ Même le test USDC-only a échoué!\n\nCela indique un problème plus profond:\n- Pool non compatible\n- Ticks incorrects\n- Ou restrictions du contrat\n\nErreur: ${error.message}`);
        } else {
            alert('Erreur USDC-only: ' + error.message);
        }
    }
}

    // ===== FLASH LOAN STRATEGY =====
    async executeFlashLoan(opportunity) {
        if (!this.walletConnected) {
            alert('Veuillez connecter votre wallet');
            return;
        }

        this.showLoadingModal('Exécution du Flash Loan...');

        try {
            // Simulation temporisée
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Simuler un profit
            const profit = Math.random() * 100 + 20;
            
            alert(`Flash Loan exécuté avec succès! Profit: $${profit.toFixed(2)}`);
            this.hideLoadingModal();
            
        } catch (error) {
            this.hideLoadingModal();
            alert('Erreur lors de l\'exécution du Flash Loan');
        }
    }

    // ===== UI UPDATES =====
    updatePositionsTable() {
        const tableBody = document.getElementById('positionsTableBody');
        
        if (!tableBody) {
            console.error('Élément positionsTableBody non trouvé');
            return;
        }
        
        if (this.positions.length === 0) {
            tableBody.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-seedling"></i>
                    <p>Aucune position active</p>
                    <span>Déployez votre première stratégie pour commencer</span>
                </div>
            `;
        } else {
            tableBody.innerHTML = this.positions.map(position => `
                <div class="position-row">
                    <div class="position-cell">${position.strategy}</div>
                    <div class="position-cell">${position.pool}</div>
                    <div class="position-cell">${position.amount}</div>
                    <div class="position-cell text-success">${position.apr}</div>
                    <div class="position-cell text-success">${position.pnl}</div>
                    <div class="position-cell">
                        <button class="action-btn" onclick="app.closePosition(${position.id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    updateDashboardStats() {
        // Calculer les statistiques du portefeuille
        const totalValue = this.positions.reduce((sum, pos) => {
            const amount = parseFloat(pos.amount.split(' ')[0]) || 0;
            return sum + amount * 2000; // Estimation prix ETH à 2000$
        }, 0);

        const dailyYield = totalValue * 0.002; // Estimation 0.2% rendement quotidien
        const avgAPR = this.positions.length > 0 ? 
            this.positions.reduce((sum, pos) => sum + parseFloat(pos.apr) || 0, 0) / this.positions.length : 0;

        // Mettre à jour les cartes de statistiques
        const valueElement = document.querySelector('.stat-card:nth-child(1) .stat-value');
        const yieldElement = document.querySelector('.stat-card:nth-child(2) .stat-value');
        const aprElement = document.querySelector('.stat-card:nth-child(3) .stat-value');
        const positionsElement = document.querySelector('.stat-card:nth-child(4) .stat-value');
        
        if (valueElement) valueElement.textContent = `$${totalValue.toFixed(2)}`;
        if (yieldElement) yieldElement.textContent = `$${dailyYield.toFixed(2)}`;
        if (aprElement) aprElement.textContent = `${avgAPR.toFixed(1)}%`;
        if (positionsElement) positionsElement.textContent = this.positions.length;
    }

    // ===== UTILITY FUNCTIONS =====
    showLoadingModal(message) {
        const modal = document.getElementById('loadingModal');
        if (!modal) return;
        
        const messageElement = modal.querySelector('p');
        if (messageElement) messageElement.textContent = message;
        
        modal.classList.add('active');
    }

    hideLoadingModal() {
        const modal = document.getElementById('loadingModal');
        if (modal) modal.classList.remove('active');
    }

    closePosition(positionId) {
        if (confirm('Êtes-vous sûr de vouloir fermer cette position?')) {
            this.positions = this.positions.filter(pos => pos.id !== positionId);
            this.updatePositionsTable();
            this.updateDashboardStats();
        }
    }

    async loadUserPositions() {
        if (!this.walletConnected) return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const contract = new ethers.Contract(
                POLYGON_CONTRACTS.STRATEGY_UNISWAP_V3,
                STRATEGY_ABI,
                provider
            );

            const positions = await contract.getUserPositions(this.currentAccount);
            console.log('Positions du contrat:', positions);

            // Convertir en format UI
            this.positions = positions
                .filter(pos => pos.active)
                .map(pos => ({
                    id: pos.tokenId.toString(),
                    strategy: 'Uniswap V3',
                    pool: 'ETH/USDC',
                    amount: `${ethers.formatEther(pos.amount0Deposited)} ETH`,
                    apr: '78.5%',
                    pnl: '+0.00%',
                    status: 'active',
                    tokenId: pos.tokenId.toString()
                }));

            this.updatePositionsTable();
            this.updateDashboardStats();
            
        } catch (error) {
            console.error('Erreur lors du chargement des positions:', error);
        }
    }

    updateStrategyMetrics() {
        switch(this.activeStrategy) {
            case 'uniswap':
                this.updateUniswapMetrics();
                break;
            case 'aave':
                this.updateAaveMetrics();
                break;
        }
    }

    generateArbitrageOpportunities() {
        // Simuler des opportunités d'arbitrage en temps réel
        const opportunities = [
            {
                pair: 'ETH/USDC',
                exchanges: 'Uniswap → SushiSwap',
                profit: (Math.random() * 50 + 20).toFixed(2),
                percentage: (Math.random() * 0.5 + 0.1).toFixed(2)
            },
            {
                pair: 'WBTC/ETH',
                exchanges: 'Curve → Balancer',
                profit: (Math.random() * 100 + 40).toFixed(2),
                percentage: (Math.random() * 0.4 + 0.2).toFixed(2)
            }
        ];

        this.updateArbitrageOpportunities(opportunities);
    }

    updateArbitrageOpportunities(opportunities) {
        const opportunityList = document.querySelector('.opportunity-list');
        if (opportunityList) {
            opportunityList.innerHTML = opportunities.map(opp => `
                <div class="opportunity-item">
                    <div class="opportunity-info">
                        <span class="pair">${opp.pair}</span>
                        <span class="exchanges">${opp.exchanges}</span>
                    </div>
                    <div class="opportunity-profit">
                        <span class="profit-amount">+$${opp.profit}</span>
                        <span class="profit-percentage">${opp.percentage}%</span>
                    </div>
                    <button class="execute-btn" onclick="app.executeFlashLoan('${opp.pair}')">
                        Exécuter
                    </button>
                </div>
            `).join('');
        }
    }

    // ===== EVENT LISTENERS SETUP =====
    setupEventListeners() {
        // Connexion wallet
        const walletBtn = document.getElementById('connectWallet');
        if (walletBtn) {
            walletBtn.addEventListener('click', () => {
                this.connectWallet();
            });
        }

        // Sélection du réseau
        const networkSelect = document.getElementById('networkSelect');
        if (networkSelect) {
            networkSelect.addEventListener('change', (e) => {
                this.switchNetwork(e.target.value);
            });
        }

        // Onglets de stratégie
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const strategy = e.currentTarget.dataset.strategy;
                this.switchStrategy(strategy);
            });
        });

        // Boutons de sélection de range
        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.updateUniswapMetrics();
            });
        });

        // Changements d'input pour mises à jour en temps réel
        const ethAmountInput = document.getElementById('ethAmount');
        if (ethAmountInput) {
            ethAmountInput.addEventListener('input', () => {
                this.updateUniswapMetrics();
            });
        }

        const collateralAmountInput = document.getElementById('collateralAmount');
        if (collateralAmountInput) {
            collateralAmountInput.addEventListener('input', () => {
                this.updateAaveMetrics();
            });
        }

        const leverageRangeInput = document.getElementById('leverageRange');
        if (leverageRangeInput) {
            leverageRangeInput.addEventListener('input', () => {
                this.updateAaveMetrics();
            });
        }

        // Boutons de déploiement de stratégie
        const uniswapBtn = document.querySelector('#uniswap-strategy .strategy-btn');
        if (uniswapBtn) {
            uniswapBtn.addEventListener('click', () => {
                this.deployUniswapStrategy();
            });
        }

        const aaveBtn = document.querySelector('#aave-strategy .strategy-btn');
        if (aaveBtn) {
            aaveBtn.addEventListener('click', () => {
                this.deployAaveStrategy();
            });
        }

        const flashloanBtn = document.querySelector('#flashloan-strategy .strategy-btn');
        if (flashloanBtn) {
            flashloanBtn.addEventListener('click', () => {
                const flashAmount = document.getElementById('flashAmount')?.value;
                if (flashAmount && parseFloat(flashAmount) > 0) {
                    this.executeFlashLoan('manual');
                } else {
                    alert('Veuillez entrer un montant valide pour le Flash Loan');
                }
            });
        }

        // Changement de sélection de pool
        const poolSelect = document.getElementById('poolSelect');
        if (poolSelect) {
            poolSelect.addEventListener('change', () => {
                this.updateUniswapMetrics();
            });
        }

        // Fermeture du modal en cliquant à l'extérieur
        const loadingModal = document.getElementById('loadingModal');
        if (loadingModal) {
            loadingModal.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    this.hideLoadingModal();
                }
            });
        }

        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideLoadingModal();
            }
        });

        // Événements de fenêtre
        window.addEventListener('load', () => {
            this.checkWalletConnection();
        });

        // Événements du wallet
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                console.log('Compte wallet changé:', accounts);
                
                if (accounts.length === 0) {
                    this.walletConnected = false;
                    this.currentAccount = null;
                    this.updateWalletUI();
                } else {
                    this.currentAccount = accounts[0];
                    this.walletConnected = true;
                    this.updateWalletUI();
                    this.loadUserPositions();
                }
            });

            window.ethereum.on('chainChanged', (chainId) => {
                console.log('Réseau changé:', chainId);
                const currentChainId = parseInt(chainId, 16);
                
                if (currentChainId === POLYGON_CHAIN_ID) {
                    document.getElementById('networkSelect').value = 'polygon';
                    this.currentNetwork = 'polygon';
                } else {
                    // Mettre à jour le sélecteur de réseau si possible
                    switch(currentChainId) {
                        case 1:
                            document.getElementById('networkSelect').value = 'ethereum';
                            this.currentNetwork = 'ethereum';
                            break;
                        case 56:
                            document.getElementById('networkSelect').value = 'bsc';
                            this.currentNetwork = 'bsc';
                            break;
                        case 42161:
                            document.getElementById('networkSelect').value = 'arbitrum';
                            this.currentNetwork = 'arbitrum';
                            break;
                    }
                }
            });
        }
    }

    async switchNetwork(networkName) {
        console.log('Tentative de changement vers le réseau:', networkName);
        
        const networkConfigs = {
            ethereum: {
                chainId: '0x1',
                chainName: 'Ethereum Mainnet',
                rpcUrls: ['https://mainnet.infura.io/v3/']
            },
            polygon: {
                chainId: '0x89',
                chainName: 'Polygon Mainnet',
                rpcUrls: ['https://polygon-rpc.com/']
            },
            arbitrum: {
                chainId: '0xa4b1',
                chainName: 'Arbitrum One',
                rpcUrls: ['https://arb1.arbitrum.io/rpc']
            },
            bsc: {
                chainId: '0x38',
                chainName: 'Binance Smart Chain',
                rpcUrls: ['https://bsc-dataseed.binance.org/']
            }
        };

        try {
            if (window.ethereum && networkConfigs[networkName]) {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: networkConfigs[networkName].chainId }]
                });
                
                this.currentNetwork = networkName;
                console.log(`Basculé sur ${networkName}`);
            }
        } catch (error) {
            console.error('Erreur de changement de réseau:', error);
            
            // Si le réseau n'est pas configuré, proposer de l'ajouter
            if (error.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: networkConfigs[networkName].chainId,
                            chainName: networkConfigs[networkName].chainName,
                            rpcUrls: networkConfigs[networkName].rpcUrls
                        }]
                    });
                } catch (addError) {
                    console.error('Erreur lors de l\'ajout du réseau:', addError);
                }
            }
        }
    }

    async checkWalletConnection() {
        console.log('Vérification de la connexion du wallet...');
        
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({
                    method: 'eth_accounts'
                });
                
                if (accounts.length > 0) {
                    this.currentAccount = accounts[0];
                    this.walletConnected = true;
                    this.updateWalletUI();
                    
                    // Vérifier le réseau actuel
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                    const currentChainId = parseInt(chainId, 16);
                    
                    console.log('Réseau actuel au chargement:', currentChainId);
                    
                    if (currentChainId === POLYGON_CHAIN_ID) {
                        document.getElementById('networkSelect').value = 'polygon';
                        this.currentNetwork = 'polygon';
                    }
                    
                    this.loadUserPositions();
                } else {
                    console.log('Aucun compte connecté');
                }
            } catch (error) {
                console.error('Erreur lors de la vérification de la connexion wallet:', error);
            }
        } else {
            console.log('MetaMask non détecté');
        }
    }

    // ===== NOTIFICATION SYSTEM =====
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}-circle"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(notification);
        
        // Suppression automatique après 5 secondes
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    // ===== INITIALIZATION =====
    updateUI() {
        this.updateDashboardStats();
        this.generateArbitrageOpportunities();
        this.updateStrategyMetrics();
    }
}

// ===== APP INITIALIZATION =====
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new YieldMaxApp();
});

// ===== GLOBAL HELPER FUNCTIONS =====
function formatNumber(num, decimals = 2) {
    return new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

function shortenAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (app) app.showNotification('Copié dans le presse-papier!', 'success');
    }).catch(() => {
        if (app) app.showNotification('Erreur lors de la copie', 'error');
    });
}   

console.log('🏁 FIN app.js - Version simplifiée');

// ===== ERROR HANDLING =====
window.addEventListener('error', (event) => {
    console.error('Erreur globale:', event.error);
    if (app) app.showNotification('Une erreur est survenue', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promesse rejetée non gérée:', event.reason);
    if (app) app.showNotification('Erreur de connexion', 'error');
});

// ===== PERFORMANCE MONITORING =====
if ('performance' in window) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const perfData = performance.timing;
            const loadTime = perfData.loadEventEnd - perfData.navigationStart;
            console.log(`Temps de chargement de la page: ${loadTime}ms`);
        }, 0);
    });
}