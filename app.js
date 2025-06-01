console.log('🚀 DÉBUT app.js - Version avec correction solde USDC');

// ===== CONTRACT CONFIGURATION =====
var POLYGON_CONTRACTS = {
    STRATEGY_UNISWAP_V3: "0x669227b0bB3A6BFC717fe8bEA17EEF3cB37f5eBC"
};

var POLYGON_CHAIN_ID = 137;

// Tokens Polygon - CORRECTION DES ADRESSES USDC
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

// Configuration Aave V3 sur Polygon - CORRECTION ADRESSES
const AAVE_V3_POLYGON = {
    POOL: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    PRICE_ORACLE: "0xb023e699F5a33916Ea823A16485e259257cA8Bd1",
    // Tokens supportés avec TOUTES les variantes USDC
    ASSETS: {
        WETH: {
            address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
            aToken: "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8",
            decimals: 18,
            symbol: "WETH"
        },
        USDC: {
            address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (plus largement supporté)
            aToken: "0x625E7708f30cA75bfd92586e17077590C60eb4cD",
            decimals: 6,
            symbol: "USDC"
        },
        USDC_NATIVE: {
            address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC Native
            aToken: "0x625E7708f30cA75bfd92586e17077590C60eb4cD", // Même aToken pour l'instant
            decimals: 6,
            symbol: "USDC"
        },
        WMATIC: {
            address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
            aToken: "0x6d80113e533a2C0fe82EaBD35f1875DcEA89Ea97",
            decimals: 18,
            symbol: "WMATIC"
        },
        WBTC: {
            address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
            aToken: "0x078f358208685046a11C85e8ad32895DED33A249",
            decimals: 8,
            symbol: "WBTC"
        }
    }
};

// ABI ERC20 pour vérifier les soldes
const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// ===== GLOBAL STATE MANAGEMENT =====
class YieldMaxApp {
    constructor() {
        this.walletConnected = false;
        this.currentAccount = null;
        this.currentNetwork = 'polygon';
        this.activeStrategy = 'uniswap';
        this.loadContractABI();
        this.positions = [];
        this.tokenBalances = {}; // Cache des soldes
        
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
                
                // Charger les soldes des tokens
                await this.loadTokenBalances();
                
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

    // ===== GESTION DES SOLDES =====
    async loadTokenBalances() {
        if (!this.walletConnected) return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            
            console.log('🔍 Chargement des soldes des tokens...');
            
            // Afficher le loader dans l'interface
            const balanceDisplay = document.getElementById('aaveBalanceDisplay');
            if (balanceDisplay) {
                balanceDisplay.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value balance-loading">Chargement...</span>
                `;
            }
            
            // Charger le solde MATIC natif (token natif de Polygon)
            const nativeBalance = await provider.getBalance(this.currentAccount);
            this.tokenBalances.NATIVE = ethers.formatEther(nativeBalance);
            
            console.log(`💰 MATIC Natif: ${this.tokenBalances.NATIVE}`);
            
            // Charger les soldes des tokens ERC20 avec gestion d'erreur robuste
            for (const [key, asset] of Object.entries(AAVE_V3_POLYGON.ASSETS)) {
                try {
                    const tokenContract = new ethers.Contract(asset.address, ERC20_ABI, provider);
                    const balance = await tokenContract.balanceOf(this.currentAccount);
                    const formattedBalance = ethers.formatUnits(balance, asset.decimals);
                    this.tokenBalances[key] = formattedBalance;
                    
                    console.log(`💰 ${asset.symbol}: ${formattedBalance}`);
                    
                    // Petit délai pour éviter les rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`❌ Erreur chargement solde ${asset.symbol}:`, error);
                    this.tokenBalances[key] = "0.0";
                }
            }
            
            // Vérifier aussi USDC Native séparément (nouvelle adresse Polygon)
            try {
                const usdcNativeContract = new ethers.Contract(POLYGON_TOKENS.USDC, ERC20_ABI, provider);
                const usdcNativeBalance = await usdcNativeContract.balanceOf(this.currentAccount);
                const formattedUsdcNative = ethers.formatUnits(usdcNativeBalance, 6);
                this.tokenBalances.USDC_NATIVE = formattedUsdcNative;
                
                console.log(`💰 USDC Native: ${formattedUsdcNative}`);
            } catch (error) {
                console.error('❌ Erreur chargement USDC Native:', error);
                this.tokenBalances.USDC_NATIVE = "0.0";
            }
            
            console.log('✅ Tous les soldes chargés:', this.tokenBalances);
            
            // Mettre à jour l'affichage du solde
            this.updateBalanceDisplay();
            
            // Notification de succès
            this.showNotification('💰 Soldes mis à jour avec succès', 'success');
            
        } catch (error) {
            console.error('❌ Erreur lors du chargement des soldes:', error);
            this.showNotification('❌ Erreur lors du chargement des soldes', 'error');
            
            // En cas d'erreur, afficher un message d'erreur dans l'interface
            const balanceDisplay = document.getElementById('aaveBalanceDisplay');
            if (balanceDisplay) {
                balanceDisplay.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value balance-zero">Erreur de chargement</span>
                    <span class="balance-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        Cliquez sur "Connecter Wallet" pour réessayer
                    </span>
                `;
            }
        }
    }

    // Fonction pour obtenir le meilleur solde USDC disponible
    getBestUSDCBalance() {
        const usdcBalance = parseFloat(this.tokenBalances.USDC || "0");
        const usdcNativeBalance = parseFloat(this.tokenBalances.USDC_NATIVE || "0");
        
        console.log('🔍 Comparaison soldes USDC:');
        console.log(`USDC.e: ${usdcBalance}`);
        console.log(`USDC Native: ${usdcNativeBalance}`);
        
        if (usdcNativeBalance > 0) {
            return { balance: usdcNativeBalance, type: 'NATIVE', address: POLYGON_TOKENS.USDC };
        } else if (usdcBalance > 0) {
            return { balance: usdcBalance, type: 'BRIDGED', address: AAVE_V3_POLYGON.ASSETS.USDC.address };
        } else {
            return { balance: 0, type: 'NONE', address: null };
        }
    }

    updateBalanceDisplay() {
        const selectedAsset = document.getElementById('aaveAssetSelect')?.value || 'weth';
        const balanceElement = document.getElementById('aaveBalanceDisplay');
        
        if (!balanceElement) return;
        
        let balance = 0;
        let symbol = '';
        let balanceType = '';
        
        // Logique corrigée pour chaque asset
        if (selectedAsset === 'usdc') {
            const usdcInfo = this.getBestUSDCBalance();
            balance = usdcInfo.balance;
            symbol = 'USDC';
            balanceType = usdcInfo.type === 'NATIVE' ? '(USDC Native)' : 
                         usdcInfo.type === 'BRIDGED' ? '(USDC.e)' : '';
            
            if (usdcInfo.balance > 0) {
                balanceElement.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value">${balance.toFixed(6)} ${symbol}</span>
                    <span class="balance-type">${balanceType}</span>
                `;
            } else {
                balanceElement.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value balance-zero">0.000000 ${symbol}</span>
                    <span class="balance-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        Aucun USDC trouvé
                    </span>
                `;
            }
        } else if (selectedAsset === 'weth') {
            // Pour WETH, utiliser le solde WETH réel (token ERC20)
            balance = parseFloat(this.tokenBalances.WETH || "0");
            symbol = 'WETH';
            
            if (balance > 0) {
                balanceElement.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value">${balance.toFixed(6)} ${symbol}</span>
                    <span class="balance-type">(Token ERC20)</span>
                `;
            } else {
                // Si pas de WETH, informer sur MATIC disponible
                const maticBalance = parseFloat(this.tokenBalances.NATIVE || "0");
                balanceElement.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value balance-zero">0.000000 ${symbol}</span>
                    <div class="balance-warning">
                        <i class="fas fa-info-circle"></i>
                        ${maticBalance > 0 ? 
                          `Vous avez ${maticBalance.toFixed(4)} MATIC. Convertissez en WETH d'abord.` : 
                          'Aucun WETH trouvé. Convertissez du MATIC ou transférez du WETH.'}
                    </div>
                `;
            }
        } else if (selectedAsset === 'wmatic') {
            // Pour WMATIC, utiliser le solde WMATIC token
            balance = parseFloat(this.tokenBalances.WMATIC || "0");
            const nativeBalance = parseFloat(this.tokenBalances.NATIVE || "0");
            symbol = 'WMATIC';
            
            if (balance > 0) {
                balanceElement.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value">${balance.toFixed(6)} ${symbol}</span>
                    <span class="balance-type">(Token ERC20)</span>
                `;
            } else if (nativeBalance > 0) {
                balanceElement.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value balance-zero">0.000000 ${symbol}</span>
                    <div class="balance-warning">
                        <i class="fas fa-info-circle"></i>
                        Vous avez ${nativeBalance.toFixed(4)} MATIC natif. Convertissez en WMATIC d'abord.
                    </div>
                `;
            } else {
                balanceElement.innerHTML = `
                    <span class="balance-label">Solde disponible:</span>
                    <span class="balance-value balance-zero">0.000000 ${symbol}</span>
                `;
            }
        } else {
            // Autres tokens (WBTC, etc.)
            balance = parseFloat(this.tokenBalances[selectedAsset.toUpperCase()] || "0");
            symbol = AAVE_V3_POLYGON.ASSETS[selectedAsset.toUpperCase()]?.symbol || selectedAsset.toUpperCase();
            
            balanceElement.innerHTML = `
                <span class="balance-label">Solde disponible:</span>
                <span class="balance-value ${balance === 0 ? 'balance-zero' : ''}">${balance.toFixed(8)} ${symbol}</span>
                <span class="balance-type">(Token ERC20)</span>
            `;
        }
        
        // Déclencher la validation après mise à jour du solde
        this.validateAaveForm();
    }

    validateAaveForm() {
        const amount = parseFloat(document.getElementById('aaveAmount')?.value || "0");
        const selectedAsset = document.getElementById('aaveAssetSelect')?.value || 'weth';
        const depositBtn = document.getElementById('aaveDepositBtn');
        const errorElement = document.getElementById('aaveBalanceError');
        
        if (!depositBtn || !errorElement) return;
        
        let availableBalance = 0;
        let warningMessage = '';
        let canDeposit = false;
        
        // Déterminer le solde disponible selon l'asset sélectionné
        if (selectedAsset === 'usdc') {
            const usdcInfo = this.getBestUSDCBalance();
            availableBalance = usdcInfo.balance;
            canDeposit = availableBalance > 0;
        } else if (selectedAsset === 'weth') {
            // Pour WETH, utiliser le solde WETH réel, pas MATIC
            availableBalance = parseFloat(this.tokenBalances.WETH || "0");
            canDeposit = availableBalance > 0;
            
            if (availableBalance === 0) {
                const maticBalance = parseFloat(this.tokenBalances.NATIVE || "0");
                if (maticBalance > 0) {
                    warningMessage = `Vous devez d'abord convertir vos ${maticBalance.toFixed(4)} MATIC en WETH`;
                } else {
                    warningMessage = `Vous n'avez pas de WETH. Transférez du WETH ou convertissez du MATIC`;
                }
            }
        } else if (selectedAsset === 'wmatic') {
            // Pour WMATIC, utiliser le solde WMATIC token
            availableBalance = parseFloat(this.tokenBalances.WMATIC || "0");
            canDeposit = availableBalance > 0;
            
            if (availableBalance === 0) {
                const nativeBalance = parseFloat(this.tokenBalances.NATIVE || "0");
                if (nativeBalance > 0) {
                    warningMessage = `Vous devez d'abord convertir vos ${nativeBalance.toFixed(4)} MATIC en WMATIC`;
                } else {
                    warningMessage = `Vous n'avez pas de WMATIC. Transférez du WMATIC ou convertissez du MATIC`;
                }
            }
        } else {
            // Autres tokens (WBTC, etc.)
            availableBalance = parseFloat(this.tokenBalances[selectedAsset.toUpperCase()] || "0");
            canDeposit = availableBalance > 0;
            
            if (availableBalance === 0) {
                warningMessage = `Vous n'avez pas de ${selectedAsset.toUpperCase()}. Transférez des tokens vers votre wallet`;
            }
        }
        
        // Logique de validation
        if (amount > 0 && amount > availableBalance) {
            // Montant supérieur au solde disponible
            depositBtn.disabled = true;
            depositBtn.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                Solde Insuffisant
            `;
            depositBtn.classList.add('disabled');
            
            const errorMsg = `Solde insuffisant. Vous avez ${availableBalance.toFixed(6)} ${selectedAsset.toUpperCase()}, mais vous voulez déposer ${amount.toFixed(6)}`;
            
            errorElement.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>${errorMsg}</span>
            `;
            errorElement.classList.add('show');
            
        } else if (amount > 0 && !canDeposit) {
            // Pas de solde du tout pour cet asset
            depositBtn.disabled = true;
            depositBtn.innerHTML = `
                <i class="fas fa-exchange-alt"></i>
                Conversion Requise
            `;
            depositBtn.classList.add('disabled');
            
            errorElement.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <span>${warningMessage}</span>
            `;
            errorElement.classList.add('show');
            
        } else if (amount > 0 && canDeposit) {
            // Montant valide et solde suffisant
            depositBtn.disabled = false;
            depositBtn.innerHTML = `
                <i class="fas fa-plus-circle"></i>
                Déposer ${amount.toFixed(4)} ${selectedAsset.toUpperCase()}
            `;
            depositBtn.classList.remove('disabled');
            errorElement.classList.remove('show');
            
        } else if (amount <= 0 && canDeposit) {
            // Pas de montant mais solde disponible
            depositBtn.disabled = false;
            depositBtn.innerHTML = `
                <i class="fas fa-plus-circle"></i>
                Déposer sur Aave
            `;
            depositBtn.classList.remove('disabled');
            errorElement.classList.remove('show');
            
        } else {
            // Pas de montant et pas de solde
            depositBtn.disabled = true;
            depositBtn.innerHTML = `
                <i class="fas fa-wallet"></i>
                Aucun Solde Disponible
            `;
            depositBtn.classList.add('disabled');
            
            if (warningMessage) {
                errorElement.innerHTML = `
                    <i class="fas fa-info-circle"></i>
                    <span>${warningMessage}</span>
                `;
                errorElement.classList.add('show');
            } else {
                errorElement.classList.remove('show');
            }
        }
    }

    // ===== FONCTION POUR RAFRAÎCHIR LES SOLDES MANUELLEMENT =====
    async refreshBalances() {
        if (!this.walletConnected) {
            this.showNotification('Veuillez d\'abord connecter votre wallet', 'warning');
            return;
        }
        
        this.showNotification('🔄 Actualisation des soldes...', 'info');
        await this.loadTokenBalances();
    }

    // ===== STRATEGY MANAGEMENT =====
    switchStrategy(strategyName) {
        console.log('🔄 Changement de stratégie vers:', strategyName);
        
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
        
        // Si on change vers Aave, charger les soldes et mettre à jour les métriques
        if (strategyName === 'aave') {
            if (this.walletConnected) {
                // Recharger les soldes si nécessaire
                if (Object.keys(this.tokenBalances).length === 0) {
                    this.loadTokenBalances();
                } else {
                    // Juste mettre à jour l'affichage
                    this.updateAaveMetrics();
                }
            } else {
                // Wallet pas connecté, afficher valeurs par défaut
                this.updateAaveMetrics();
            }
        } else {
            // Pour les autres stratégies, utiliser leurs fonctions de mise à jour
            this.updateStrategyMetrics();
        }
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
    const amount = parseFloat(document.getElementById('aaveAmount')?.value) || 0;
    const selectedAsset = document.getElementById('aaveAssetSelect')?.value || 'weth';
    
    // APRs réels d'Aave sur Polygon
    const aprs = {
        weth: 5.2,
        usdc: 3.71, // APR réel que vous avez confirmé
        wmatic: 6.1,
        wbtc: 4.9
    };
    
    // Prix approximatifs en USD pour calculs
    const prices = {
        weth: 2500,
        usdc: 1,
        wmatic: 0.8,
        wbtc: 45000
    };
    
    const currentAPR = aprs[selectedAsset] || 5.0;
    const price = prices[selectedAsset] || 1;
    
    // Calculs de rendement basés sur le montant saisi
    let dailyYield = 0;
    let monthlyYield = 0;
    let dailyUSD = 0;
    let monthlyUSD = 0;
    
    if (amount > 0) {
        // Calcul des rendements en tokens
        dailyYield = (amount * currentAPR / 100 / 365);
        monthlyYield = dailyYield * 30;
        
        // Conversion en USD
        dailyUSD = dailyYield * price;
        monthlyUSD = monthlyYield * price;
    }
    
    // Mettre à jour l'interface avec animation
    const aprElement = document.getElementById('aaveCurrentAPR');
    const dailyElement = document.getElementById('aaveDailyYield');
    const monthlyElement = document.getElementById('aaveMonthlyYield');
    const symbolElement = document.getElementById('aaveAssetSymbol');
    const aTokenElement = document.getElementById('aTokenName');
    
    if (aprElement) {
        aprElement.classList.add('updating');
        aprElement.textContent = `${currentAPR}%`;
        setTimeout(() => aprElement.classList.remove('updating'), 300);
    }
    
    if (dailyElement) {
        dailyElement.classList.add('updating');
        if (amount > 0) {
            dailyElement.textContent = `$${dailyUSD.toFixed(4)} (${dailyYield.toFixed(6)} ${selectedAsset.toUpperCase()})`;
        } else {
            dailyElement.textContent = `$0.0000`;
        }
        setTimeout(() => dailyElement.classList.remove('updating'), 300);
    }
    
    if (monthlyElement) {
        monthlyElement.classList.add('updating');
        if (amount > 0) {
            monthlyElement.textContent = `$${monthlyUSD.toFixed(2)} (${monthlyYield.toFixed(4)} ${selectedAsset.toUpperCase()})`;
        } else {
            monthlyElement.textContent = `$0.00`;
        }
        setTimeout(() => monthlyElement.classList.remove('updating'), 300);
    }
    
    if (symbolElement) {
        symbolElement.textContent = selectedAsset.toUpperCase();
    }
    
    if (aTokenElement) {
        aTokenElement.textContent = `a${selectedAsset.toUpperCase()}`;
    }
    
    // NOUVEAU: Mettre à jour les informations de lending
    this.updateLendingInfo(selectedAsset, currentAPR);
    
    // Mettre à jour l'affichage du solde et la validation
    this.updateBalanceDisplay();
    this.validateAaveForm();
    
    console.log(`📊 Métriques Aave mises à jour:`, {
        asset: selectedAsset,
        amount: amount,
        apr: currentAPR + '%',
        dailyUSD: '$' + dailyUSD.toFixed(4),
        monthlyUSD: '$' + monthlyUSD.toFixed(2)
    });
}

// ===== NOUVELLE FONCTION POUR METTRE À JOUR LES INFOS DE LENDING =====
updateLendingInfo(selectedAsset, currentAPR) {
    // Informations spécifiques à chaque asset
    const assetInfos = {
        weth: {
            strategy: 'Lending ETH',
            aToken: 'aWETH',
            liquidity: 'Excellente',
            features: 'Collatéral premium'
        },
        usdc: {
            strategy: 'Lending Stablecoin',
            aToken: 'aUSDC',
            liquidity: 'Très élevée',
            features: 'Stable, faible risque'
        },
        wmatic: {
            strategy: 'Lending MATIC',
            aToken: 'aWMATIC',
            liquidity: 'Élevée',
            features: 'Token natif Polygon'
        },
        wbtc: {
            strategy: 'Lending Bitcoin',
            aToken: 'aWBTC',
            liquidity: 'Bonne',
            features: 'Bitcoin sur Ethereum'
        }
    };
    
    const info = assetInfos[selectedAsset] || assetInfos.weth;
    
    // Mettre à jour les éléments du DOM
    const strategyElement = document.querySelector('.info-item:nth-child(1) strong');
    const aTokenElement = document.querySelector('.info-item:nth-child(2) strong');
    const interestElement = document.querySelector('.info-item:nth-child(3) strong');
    const liquidityElement = document.querySelector('.info-item:nth-child(4) strong');
    
    if (strategyElement) strategyElement.textContent = info.strategy;
    if (aTokenElement) aTokenElement.textContent = info.aToken;
    if (interestElement) interestElement.textContent = `${currentAPR}% APR`;
    if (liquidityElement) liquidityElement.textContent = info.liquidity;
    }

    async deployAaveStrategy() {
        if (!this.walletConnected) {
            alert('Veuillez connecter votre wallet');
            return;
        }

        const amount = document.getElementById('aaveAmount').value;
        const selectedAsset = document.getElementById('aaveAssetSelect').value;
        
        if (!amount || parseFloat(amount) <= 0) {
            alert('Veuillez entrer un montant valide');
            return;
        }

        // Vérification du solde avant de continuer
        let availableBalance = 0;
        let assetInfo = null;
        let tokenAddress = null;
        
        if (selectedAsset === 'usdc') {
            const usdcInfo = this.getBestUSDCBalance();
            availableBalance = usdcInfo.balance;
            tokenAddress = usdcInfo.address;
            
            if (usdcInfo.type === 'NATIVE') {
                assetInfo = { ...AAVE_V3_POLYGON.ASSETS.USDC, address: tokenAddress, symbol: 'USDC' };
            } else {
                assetInfo = AAVE_V3_POLYGON.ASSETS.USDC;
            }
        } else if (selectedAsset === 'weth') {
            availableBalance = parseFloat(this.tokenBalances.WETH || "0");
            assetInfo = AAVE_V3_POLYGON.ASSETS.WETH;
            tokenAddress = assetInfo.address;
        } else {
            availableBalance = parseFloat(this.tokenBalances[selectedAsset.toUpperCase()] || "0");
            assetInfo = AAVE_V3_POLYGON.ASSETS[selectedAsset.toUpperCase()];
            tokenAddress = assetInfo.address;
        }
        
        if (parseFloat(amount) > availableBalance) {
            alert(`❌ Solde insuffisant!\n\nVous voulez déposer: ${amount} ${assetInfo.symbol}\nSolde disponible: ${availableBalance.toFixed(6)} ${assetInfo.symbol}`);
            return;
        }

        this.showLoadingModal('Dépôt sur Aave en cours...');

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            
            console.log("=== AAVE LENDING SIMPLE ===");
            console.log("Asset:", selectedAsset);
            console.log("Montant:", amount);
            console.log("Adresse token:", tokenAddress);
            console.log("Solde disponible:", availableBalance);
            
            const amountInWei = ethers.parseUnits(amount, assetInfo.decimals);
            
            // ABI du Pool Aave V3
            const AAVE_POOL_ABI = [
                "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
                "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
            ];
            
            const aavePool = new ethers.Contract(AAVE_V3_POLYGON.POOL, AAVE_POOL_ABI, signer);
            
            let tx;
            
            if (selectedAsset === 'weth') {
                // Pour WETH, on doit d'abord convertir ETH en WETH
                console.log('Conversion ETH -> WETH...');
                
                const WETH_ABI = [
                    "function deposit() payable",
                    "function approve(address spender, uint256 amount) returns (bool)"
                ];
                
                const wethContract = new ethers.Contract(assetInfo.address, WETH_ABI, signer);
                
                // Convertir ETH en WETH
                const depositTx = await wethContract.deposit({ value: amountInWei });
                await depositTx.wait();
                console.log('✅ ETH converti en WETH');
                
                // Approuver WETH pour Aave
                const approveTx = await wethContract.approve(AAVE_V3_POLYGON.POOL, amountInWei);
                await approveTx.wait();
                console.log('✅ WETH approuvé pour Aave');
                
                // Déposer sur Aave
                tx = await aavePool.supply(assetInfo.address, amountInWei, userAddress, 0);
                
            } else {
                // Pour les autres tokens, approuver puis déposer
                console.log(`Approbation ${assetInfo.symbol}...`);
                
                const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
                
                const approveTx = await tokenContract.approve(AAVE_V3_POLYGON.POOL, amountInWei);
                await approveTx.wait();
                console.log(`✅ ${assetInfo.symbol} approuvé`);
                
                // Déposer sur Aave
                tx = await aavePool.supply(tokenAddress, amountInWei, userAddress, 0);
            }
            
            console.log('📤 Transaction Aave envoyée:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('✅ Dépôt Aave confirmé!', receipt.hash);
            
            // Ajouter la position à l'interface
            const newPosition = {
                id: Date.now(),
                strategy: 'Aave Lending',
                pool: `${assetInfo.symbol} Supply`,
                amount: `${amount} ${assetInfo.symbol}`,
                apr: '5.2%', // APR de base, sera mis à jour
                pnl: '+0.00%',
                status: 'active',
                aToken: assetInfo.aToken
            };
            
            this.positions.push(newPosition);
            this.updatePositionsTable();
            this.updateDashboardStats();
            
            // Mettre à jour l'interface Aave
            this.updateAavePositions();
            
            // Recharger les soldes
            await this.loadTokenBalances();
            
            this.hideLoadingModal();
            
            alert(`🎉 Dépôt Aave réussi!\n\n💰 ${amount} ${assetInfo.symbol} déposé\n📈 Vous recevez des aTokens qui génèrent des intérêts automatiquement\n\n📄 Transaction: ${tx.hash}\n🔗 Voir sur PolygonScan: https://polygonscan.com/tx/${tx.hash}`);
            
        } catch (error) {
            this.hideLoadingModal();
            console.error('❌ Erreur Aave:', error);
            
            let errorMessage = "Erreur Aave inconnue";
            
            if (error.code === 4001) {
                errorMessage = 'Transaction annulée par l\'utilisateur';
            } else if (error.reason) {
                errorMessage = `Erreur Aave: ${error.reason}`;
            } else if (error.message) {
                errorMessage = `Erreur: ${error.message}`;
            }
            
            alert(errorMessage);
        }
    }

    // Fonction pour mettre à jour les positions Aave
    updateAavePositions() {
        // Afficher la section des positions si l'utilisateur a des positions
        const hasAavePositions = this.positions.some(pos => pos.strategy === 'Aave Lending');
        
        const positionsSection = document.getElementById('aavePositions');
        const withdrawBtn = document.getElementById('aaveWithdrawBtn');
        
        if (hasAavePositions) {
            if (positionsSection) positionsSection.style.display = 'block';
            if (withdrawBtn) withdrawBtn.style.display = 'inline-flex';
            
            // Mettre à jour la liste des positions
            const positionsList = document.getElementById('aavePositionsList');
            if (positionsList) {
                const aavePositions = this.positions.filter(pos => pos.strategy === 'Aave Lending');
                
                positionsList.innerHTML = aavePositions.map(pos => `
                    <div class="aave-position-item">
                        <div class="position-info">
                            <span class="asset">${pos.pool}</span>
                            <span class="amount">${pos.amount}</span>
                        </div>
                        <div class="position-yield">
                            <span class="apr">${pos.apr}</span>
                            <span class="pnl">${pos.pnl}</span>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            if (positionsSection) positionsSection.style.display = 'none';
            if (withdrawBtn) withdrawBtn.style.display = 'none';
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
        // NOUVELLE STRUCTURE: Utilise des div avec grid pour respecter les colonnes
        tableBody.innerHTML = this.positions.map(position => `
            <div class="position-row">
                <div class="position-cell strategy-cell">
                    <div class="cell-content">
                        <i class="fas fa-university"></i>
                        <span>${position.strategy}</span>
                    </div>
                </div>
                <div class="position-cell pool-cell">
                    <span class="pool-name">${position.pool}</span>
                </div>
                <div class="position-cell amount-cell">
                    <span class="amount-value">${position.amount}</span>
                </div>
                <div class="position-cell apr-cell">
                    <span class="apr-value text-success">${position.apr}</span>
                </div>
                <div class="position-cell pnl-cell">
                    <span class="pnl-value ${position.pnl.startsWith('+') ? 'text-success' : 'text-danger'}">${position.pnl}</span>
                </div>
                <div class="position-cell actions-cell">
                    <button class="action-btn" onclick="app.closePosition(${position.id})" title="Fermer la position">
                        <i class="fas fa-times"></i>
                    </button>
                    ${position.txHash ? `
                        <button class="action-btn view-btn" onclick="app.viewTransaction('${position.txHash}')" title="Voir la transaction">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
}

    // ===== NOUVELLE FONCTION POUR VOIR LES TRANSACTIONS =====
        viewTransaction(txHash) {
            const url = `https://polygonscan.com/tx/${txHash}`;
            window.open(url, '_blank');
            this.showNotification('🔗 Transaction ouverte dans PolygonScan', 'info');
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

    // Fonction pour définir le montant maximum disponible
    setMaxAmount() {
        if (!this.walletConnected) {
            this.showNotification('Veuillez d\'abord connecter votre wallet', 'warning');
            return;
        }
        
        const selectedAsset = document.getElementById('aaveAssetSelect').value;
        const amountInput = document.getElementById('aaveAmount');
        
        let maxBalance = 0;
        let warningMsg = '';
        
        if (selectedAsset === 'usdc') {
            const usdcInfo = this.getBestUSDCBalance();
            maxBalance = usdcInfo.balance;
        } else if (selectedAsset === 'weth') {
            // Pour WETH, utiliser le solde WETH réel
            maxBalance = parseFloat(this.tokenBalances.WETH || "0");
            
            if (maxBalance === 0) {
                const maticBalance = parseFloat(this.tokenBalances.NATIVE || "0");
                if (maticBalance > 0) {
                    warningMsg = `Vous avez ${maticBalance.toFixed(4)} MATIC. Convertissez d'abord en WETH.`;
                } else {
                    warningMsg = 'Aucun WETH disponible. Transférez du WETH ou convertissez du MATIC.';
                }
            }
        } else if (selectedAsset === 'wmatic') {
            // Pour WMATIC, utiliser le solde WMATIC token
            maxBalance = parseFloat(this.tokenBalances.WMATIC || "0");
            
            if (maxBalance === 0) {
                const nativeBalance = parseFloat(this.tokenBalances.NATIVE || "0");
                if (nativeBalance > 0) {
                    warningMsg = `Vous avez ${nativeBalance.toFixed(4)} MATIC natif. Convertissez d'abord en WMATIC.`;
                }
            }
        } else {
            maxBalance = parseFloat(this.tokenBalances[selectedAsset.toUpperCase()] || "0");
        }
        
        if (maxBalance > 0) {
            // Garder une petite marge de sécurité (99.9%)
            const maxAmount = maxBalance * 0.999;
            amountInput.value = maxAmount.toFixed(8);
            
            // Déclencher immédiatement la mise à jour des métriques
            this.updateAaveMetrics();
            
            // Notification de succès
            this.showNotification(`💰 Montant maximum défini: ${maxAmount.toFixed(6)} ${selectedAsset.toUpperCase()}`, 'success');
        } else {
            if (warningMsg) {
                this.showNotification(`⚠️ ${warningMsg}`, 'warning');
            } else {
                this.showNotification(`❌ Aucun solde ${selectedAsset.toUpperCase()} disponible`, 'error');
            }
        }
    }

    // ===== FONCTIONS POUR DÉTECTER LES CHANGEMENTS DE RÉSEAU =====
    handleNetworkChange() {
        console.log('🌐 Changement de réseau détecté, rechargement des soldes...');
        
        // Réinitialiser les soldes
        this.tokenBalances = {};
        
        // Recharger les soldes si wallet connecté
        if (this.walletConnected) {
            setTimeout(() => {
                this.loadTokenBalances();
            }, 1000); // Petit délai pour laisser le réseau se stabiliser
        }
    }

    // ===== INITIALIZATION =====
    updateUI() {
        this.updateDashboardStats();
        this.generateArbitrageOpportunities();
        this.updateStrategyMetrics();
    }

    updateStrategyMetrics() {
        console.log('📊 Mise à jour des métriques pour:', this.activeStrategy);
        
        switch(this.activeStrategy) {
            case 'uniswap':
                this.updateUniswapMetrics();
                break;
            case 'aave':
                this.updateAaveMetrics();
                break;
            case 'flashloan':
                // Pas de métriques spécifiques pour flashloan
                break;
            default:
                console.log('Stratégie inconnue:', this.activeStrategy);
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

        // Bouton d'actualisation des données
        const refreshDataBtn = document.getElementById('refreshDataBtn');
        if (refreshDataBtn) {
            refreshDataBtn.addEventListener('click', () => {
                this.refreshAllData();
            });
        }

        // Bouton spécifique pour Aave
        const refreshAaveBtn = document.getElementById('refreshAaveBtn');
        if (refreshAaveBtn) {
            refreshAaveBtn.addEventListener('click', () => {
                this.loadAavePositions();
            });
        }

        // Changements d'input pour mises à jour en temps réel
        const ethAmountInput = document.getElementById('ethAmount');
        if (ethAmountInput) {
            ethAmountInput.addEventListener('input', () => {
                this.updateUniswapMetrics();
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

        // Bouton dépôt Aave
        const aaveDepositBtn = document.getElementById('aaveDepositBtn');
        if (aaveDepositBtn) {
            aaveDepositBtn.addEventListener('click', () => {
                this.deployAaveStrategy();
            });
        }

        // Changement d'asset Aave
        const aaveAssetSelect = document.getElementById('aaveAssetSelect');
        if (aaveAssetSelect) {
            aaveAssetSelect.addEventListener('change', () => {
                console.log('🔄 Asset Aave changé, mise à jour des métriques...');
                // Réinitialiser le montant pour éviter la confusion
                const amountInput = document.getElementById('aaveAmount');
                if (amountInput && amountInput.value) {
                    // Si il y avait un montant, garder et recalculer
                    this.updateAaveMetrics();
                } else {
                    // Sinon, juste mettre à jour l'affichage
                    this.updateBalanceDisplay();
                }
            });
        }

        // Changement de montant Aave
        const aaveAmountInput = document.getElementById('aaveAmount');
        if (aaveAmountInput) {
            // Mise à jour en temps réel pendant la frappe
            aaveAmountInput.addEventListener('input', () => {
                console.log('💱 Montant Aave changé, recalcul des métriques...');
                this.updateAaveMetrics();
            });
            
            // Mise à jour aussi sur focus out pour être sûr
            aaveAmountInput.addEventListener('blur', () => {
                this.updateAaveMetrics();
            });
        }

        console.log('✅ Aave Simple Lending configuré et prêt!');

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
                console.log('👤 Compte wallet changé:', accounts);
                
                if (accounts.length === 0) {
                    this.walletConnected = false;
                    this.currentAccount = null;
                    this.tokenBalances = {}; // Réinitialiser les soldes
                    this.updateWalletUI();
                    this.updateBalanceDisplay(); // Mettre à jour l'affichage Aave
                } else {
                    this.currentAccount = accounts[0];
                    this.walletConnected = true;
                    this.updateWalletUI();
                    this.loadUserPositions();
                    this.loadTokenBalances(); // Charger les nouveaux soldes
                }
            });

            window.ethereum.on('chainChanged', (chainId) => {
                console.log('🌐 Réseau changé:', chainId);
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
                
                // Appeler la fonction de gestion du changement de réseau
                this.handleNetworkChange();
            });
        }
    }

    // Fonction pour récupérer les positions Aave réelles depuis la blockchain
async loadAavePositions() {
    if (!this.walletConnected) {
        this.showNotification('Veuillez connecter votre wallet', 'warning');
        return;
    }

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        
        // Vérifier qu'on est sur Polygon
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== POLYGON_CHAIN_ID) {
            this.showNotification('⚠️ Changez vers le réseau Polygon', 'warning');
            return;
        }

        this.showNotification('🔄 Récupération des positions Aave...', 'info');
        
        console.log('🔍 Recherche des positions Aave pour:', this.currentAccount);
        
        // ABI pour lire les soldes aTokens
        const ATOKEN_ABI = [
            "function balanceOf(address account) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];

        // Effacer les anciennes positions Aave
        this.positions = this.positions.filter(pos => pos.strategy !== 'Aave Lending');
        
        let totalPositions = 0;
        
        // Vérifier chaque aToken
        for (const [assetKey, assetInfo] of Object.entries(AAVE_V3_POLYGON.ASSETS)) {
            try {
                const aTokenContract = new ethers.Contract(assetInfo.aToken, ATOKEN_ABI, provider);
                const aTokenBalance = await aTokenContract.balanceOf(this.currentAccount);
                const decimals = await aTokenContract.decimals();
                
                if (aTokenBalance > 0) {
                    const formattedBalance = ethers.formatUnits(aTokenBalance, decimals);
                    const balanceNum = parseFloat(formattedBalance);
                    
                    if (balanceNum > 0.000001) { // Filtrer les poussières
                        console.log(`💰 Position trouvée: ${balanceNum.toFixed(6)} a${assetInfo.symbol}`);
                        
                        // Calculer les gains estimés (approximatifs)
                        const aprs = { weth: 5.2, usdc: 3.71, wmatic: 6.1, wbtc: 4.9 };
                        const currentAPR = aprs[assetKey.toLowerCase()] || 5.0;
                        
                        // Estimer les gains (les aTokens augmentent avec le temps)
                        const estimatedDeposit = balanceNum * 0.999; // Estimation du dépôt initial
                        const estimatedGains = balanceNum - estimatedDeposit;
                        const pnlPercentage = estimatedGains > 0 ? 
                            `+${((estimatedGains / estimatedDeposit) * 100).toFixed(4)}%` : 
                            '+0.0000%';
                        
                        // Créer la position
                        const aavePosition = {
                            id: `aave_${assetKey}_${Date.now()}`,
                            strategy: 'Aave Lending',
                            pool: `${assetInfo.symbol} Supply`,
                            amount: `${balanceNum.toFixed(6)} a${assetInfo.symbol}`,
                            apr: `${currentAPR}%`,
                            pnl: pnlPercentage,
                            status: 'active',
                            aToken: assetInfo.aToken,
                            asset: assetKey,
                            realBalance: balanceNum
                        };
                        
                        this.positions.push(aavePosition);
                        totalPositions++;
                    }
                }
                
                // Petit délai pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (error) {
                console.error(`❌ Erreur lecture a${assetInfo.symbol}:`, error);
            }
        }
        
        // Mettre à jour l'interface
        this.updatePositionsTable();
        this.updateDashboardStats();
        this.updateAavePositions();
        
        if (totalPositions > 0) {
            this.showNotification(`✅ ${totalPositions} position(s) Aave récupérée(s)`, 'success');
            console.log(`✅ ${totalPositions} positions Aave trouvées et ajoutées`);
        } else {
            this.showNotification('ℹ️ Aucune position Aave trouvée', 'info');
            console.log('ℹ️ Aucune position Aave active trouvée');
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des positions Aave:', error);
        this.showNotification('❌ Erreur lors de la récupération des positions', 'error');
    }
}

// Fonction pour actualiser toutes les données
async refreshAllData() {
    if (!this.walletConnected) {
        this.showNotification('Veuillez connecter votre wallet', 'warning');
        return;
    }
    
    try {
        // Désactiver le bouton pendant l'actualisation
        const refreshBtn = document.getElementById('refreshDataBtn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Actualisation...
            `;
        }
        
        this.showNotification('🔄 Actualisation de toutes les données...', 'info');
        
        // 1. Recharger les soldes des tokens
        await this.loadTokenBalances();
        
        // 2. Recharger les positions Uniswap (si applicable)
        await this.loadUserPositions();
        
        // 3. Recharger les positions Aave
        await this.loadAavePositions();
        
        // 4. Mettre à jour l'affichage
        this.updateBalanceDisplay();
        this.updateAaveMetrics();
        
        this.showNotification('✅ Toutes les données actualisées', 'success');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'actualisation:', error);
        this.showNotification('❌ Erreur lors de l\'actualisation', 'error');
    } finally {
        // Réactiver le bouton
        const refreshBtn = document.getElementById('refreshDataBtn');
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `
                <i class="fas fa-sync-alt"></i>
                Actualiser les données
            `;
        }
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
                    this.loadTokenBalances();
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

console.log('🏁 FIN app.js - Version avec correction solde USDC');

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
