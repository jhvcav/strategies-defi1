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

    async debugTokenBalances(userAddress) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    
    // ABI pour ERC20
    const ERC20_ABI = [
        "function balanceOf(address account) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
        "function name() external view returns (string)"
    ];
    
    // Adresses de tokens à tester
    const tokensToTest = [
        { name: "USDC Native", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
        { name: "USDC.e (Bridged)", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" },
        { name: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
        { name: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" },
        { name: "WMATIC", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" }
    ];
    
    console.log("=== DEBUG DES SOLDES DE TOKENS ===");
    console.log("Adresse utilisateur:", userAddress);
    
    const results = {};
    
    for (const token of tokensToTest) {
        try {
            const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
            
            const [balance, decimals, symbol, name] = await Promise.all([
                contract.balanceOf(userAddress),
                contract.decimals(),
                contract.symbol(),
                contract.name()
            ]);
            
            const formattedBalance = ethers.formatUnits(balance, decimals);
            
            results[token.name] = {
                address: token.address,
                symbol: symbol,
                name: name,
                balance: formattedBalance,
                decimals: decimals,
                rawBalance: balance.toString(),
                hasBalance: parseFloat(formattedBalance) > 0
            };
            
            console.log(`${token.name}:`, {
                symbol: symbol,
                balance: formattedBalance,
                address: token.address
            });
            
        } catch (error) {
            console.error(`❌ Erreur pour ${token.name}:`, error.message);
            results[token.name] = { error: error.message };
        }
    }
    
    return results;
}

    async deployUniswapStrategy() {
    if (!this.walletConnected) {
        alert('Veuillez connecter votre wallet');
        return;
    }

    // Vérifier qu'on est sur Polygon
    try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (parseInt(chainId, 16) !== POLYGON_CHAIN_ID) {
            alert('Veuillez vous connecter au réseau Polygon');
            return;
        }
    } catch (error) {
        console.error('Erreur lors de la vérification du réseau:', error);
        alert('Impossible de vérifier le réseau actuel');
        return;
    }

    const ethAmount = document.getElementById('ethAmount').value;
    const selectedPool = document.getElementById('poolSelect').value;
    const selectedRange = document.querySelector('.range-btn.active')?.dataset.range || 10;
    
    if (!ethAmount || parseFloat(ethAmount) <= 0) {
        alert('Veuillez entrer un montant valide');
        return;
    }

    // Afficher le modal de chargement
    this.showLoadingModal('Analyse de vos soldes...');

    try {
        // Initialiser ethers
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();
        
        // === ÉTAPE 1: DEBUG COMPLET DES SOLDES ===
        console.log("=== DÉBUT DEBUG DES SOLDES ===");
        const tokenBalances = await this.debugTokenBalances(userAddress);
        console.log("Résultats complets:", tokenBalances);
        console.log("=== FIN DEBUG DES SOLDES ===");
        
        // === ÉTAPE 2: CONFIGURATION CORRECTE DES TOKENS ===
        let tokenA, tokenB, poolFee;
        let needsStablecoin = false;
        
        // Définir les tokens selon le pool sélectionné
        switch(selectedPool) {
            case 'weth-usdc':
                tokenA = POLYGON_TOKENS.USDC;  // 0x3c...
                tokenB = POLYGON_TOKENS.WETH;  // 0x7c...
                poolFee = 500;  // 0.05%
                needsStablecoin = true;
                break;
                
            case 'matic-usdc':
                tokenA = POLYGON_TOKENS.USDC;
                tokenB = POLYGON_TOKENS.WMATIC;
                poolFee = 500;
                needsStablecoin = true;
                break;
                
            default:
                tokenA = POLYGON_TOKENS.USDC;
                tokenB = POLYGON_TOKENS.WETH;
                poolFee = 500;
                needsStablecoin = true;
        }
        
        // Ordonner correctement les tokens (token0 < token1)
        const token0 = tokenA < tokenB ? tokenA : tokenB;
        const token1 = tokenA < tokenB ? tokenB : tokenA;
        
        console.log("=== CONFIGURATION DU POOL ===");
        console.log("Token0 (adresse plus petite):", token0);
        console.log("Token1 (adresse plus grande):", token1);
        console.log("Fee tier:", poolFee);
        
        // === ÉTAPE 3: VÉRIFICATION DE L'EXISTENCE DU POOL ===
        this.showLoadingModal('Vérification de l\'existence du pool...');
        
        const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984"; // Uniswap V3 Factory
        const FACTORY_ABI = [
            "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
        ];
        
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const poolAddress = await factory.getPool(token0, token1, poolFee);
        
        if (poolAddress === "0x0000000000000000000000000000000000000000") {
            this.hideLoadingModal();
            alert(`❌ Le pool ${selectedPool.toUpperCase()} avec fee tier ${poolFee/10000}% n'existe pas sur Uniswap V3 Polygon.\n\nEssayez avec un autre fee tier (ex: 3000 pour 0.3%)`);
            return;
        }
        
        console.log("✅ Pool trouvé à l'adresse:", poolAddress);
        
        // === ÉTAPE 4: RÉCUPÉRER LES INFORMATIONS DU POOL ===
        const POOL_ABI = [
            "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
            "function tickSpacing() external view returns (int24)"
        ];
        
        const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
        const [slot0, tickSpacing] = await Promise.all([
            poolContract.slot0(),
            poolContract.tickSpacing()
        ]);
        
        const currentTick = slot0.tick;
        const currentSqrtPriceX96 = slot0.sqrtPriceX96;
        
        console.log("=== INFORMATIONS DU POOL ===");
        console.log("Tick actuel:", currentTick.toString());
        console.log("Prix actuel (sqrtPriceX96):", currentSqrtPriceX96.toString());
        console.log("Espacement des ticks:", tickSpacing.toString());

        // ABI minimal pour ERC20
        const ERC20_ABI = [
            "function balanceOf(address account) external view returns (uint256)",
            "function decimals() external view returns (uint8)",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function allowance(address owner, address spender) external view returns (uint256)",
            "function symbol() external view returns (string)"
        ];

        // Vérifier le solde ETH natif
        const ethBalance = await provider.getBalance(userAddress);
        const ethValue = ethers.parseEther(ethAmount);
        
        console.log('Solde ETH:', ethers.formatEther(ethBalance), 'ETH');
        console.log('Montant requis:', ethAmount, 'ETH');
        
        if (ethBalance < ethValue) {
            this.hideLoadingModal();
            alert(`Solde ETH insuffisant! Vous avez ${ethers.formatEther(ethBalance)} ETH, mais ${ethAmount} ETH sont nécessaires.`);
            return;
        }
        
        // === ÉTAPE 5: DÉTECTION INTELLIGENTE DU STABLECOIN ===
        let stablecoinContract, stablecoinDecimals, stablecoinBalance, stablecoinSymbol;
        let stablecoinAddress;
        
        if (needsStablecoin) {
            console.log("=== DÉTECTION DU STABLECOIN DISPONIBLE ===");
            
            let stablecoinFound = false;
            
            // Prioriser USDC Native, puis USDC.e
            const stablecoinCandidates = [
                { 
                    name: "USDC Native", 
                    address: POLYGON_TOKENS.USDC,
                    result: tokenBalances["USDC Native"]
                },
                { 
                    name: "USDC.e (Bridged)", 
                    address: POLYGON_TOKENS.USDC_BRIDGED,
                    result: tokenBalances["USDC.e (Bridged)"]
                }
            ];
            
            for (const candidate of stablecoinCandidates) {
                if (candidate.result && candidate.result.hasBalance) {
                    console.log(`✅ ${candidate.name} trouvé: ${candidate.result.balance} ${candidate.result.symbol}`);
                    
                    // Utiliser cette adresse de stablecoin
                    stablecoinAddress = candidate.address;
                    stablecoinContract = new ethers.Contract(stablecoinAddress, ERC20_ABI, provider);
                    stablecoinBalance = ethers.parseUnits(candidate.result.balance, candidate.result.decimals);
                    stablecoinDecimals = candidate.result.decimals;
                    stablecoinSymbol = candidate.result.symbol;
                    stablecoinFound = true;
                    break;
                }
            }
            
            if (!stablecoinFound) {
                this.hideLoadingModal();
                alert('❌ Aucun solde USDC trouvé sur votre wallet.\n\nVeuillez vous assurer d\'avoir:\n- USDC Native, ou\n- USDC.e (Bridged)\nsur le réseau Polygon.');
                return;
            }
        }
        
        // === ÉTAPE 6: CALCUL CORRECT DES TICKS ===
        this.showLoadingModal('Calcul de la plage de prix...');
        
        // Calculer les ticks pour la plage de prix - utilisons une plage plus large pour éviter les erreurs
        const rangePercentage = parseInt(selectedRange);
        const tickRange = Math.floor(rangePercentage * 200); // Plus large que l'original
        
        // Calculer les ticks basés sur le tick actuel
        const tickLower = Math.floor((Number(currentTick) - tickRange) / Number(tickSpacing)) * Number(tickSpacing);
        const tickUpper = Math.ceil((Number(currentTick) + tickRange) / Number(tickSpacing)) * Number(tickSpacing);
        
        console.log("=== PARAMÈTRES DE LA PLAGE ===");
        console.log("Tick actuel du pool:", currentTick.toString());
        console.log("Plage sélectionnée:", rangePercentage + "%");
        console.log("Tick range calculé:", tickRange);
        console.log("Tick inférieur calculé:", tickLower);
        console.log("Tick supérieur calculé:", tickUpper);
        console.log("Espacement des ticks:", tickSpacing.toString());
        
        // === ÉTAPE 7: CALCUL SIMPLIFIÉ DES MONTANTS ===
        this.showLoadingModal('Calcul des montants optimaux...');
        
        // Détecter quel token nous utilisons
        const isToken0Stablecoin = (token0 === stablecoinAddress);
        
        let amount0Desired, amount1Desired;
        let requiredStablecoin = 0n;
        
        if (needsStablecoin) {
            // Calcul simplifié basé sur le prix actuel
            // Avec tick ~198000, le prix USDC/WETH est d'environ 0.0004 (soit 1 WETH = 2500 USDC)
            
            const ethAmountBigInt = ethValue; // 0.02 ETH en wei
            
            if (isToken0Stablecoin) {
                // USDC est token0, WETH est token1
                console.log("Configuration: USDC (token0) + WETH (token1)");
                
                // Pour une position équilibrée, on utilise à peu près le prix du marché
                // 1 WETH ≈ 2500 USDC, donc 0.02 WETH ≈ 50 USDC
                const usdcEquivalent = parseFloat(ethAmount) * 2500;
                const usdcAmount = ethers.parseUnits(usdcEquivalent.toString(), 6); // 6 décimales pour USDC
                
                amount0Desired = usdcAmount; // USDC
                amount1Desired = ethAmountBigInt; // WETH 
                requiredStablecoin = usdcAmount;
                
                console.log("Montants calculés (méthode simplifiée):");
                console.log(`- USDC (token0): ${usdcEquivalent} USDC`);
                console.log(`- WETH (token1): ${ethAmount} ETH`);
                
            } else {
                // WETH est token0, USDC est token1  
                console.log("Configuration: WETH (token0) + USDC (token1)");
                
                const usdcEquivalent = parseFloat(ethAmount) * 2500;
                const usdcAmount = ethers.parseUnits(usdcEquivalent.toString(), 6);
                
                amount0Desired = ethAmountBigInt; // WETH
                amount1Desired = usdcAmount; // USDC
                requiredStablecoin = usdcAmount;
                
                console.log("Montants calculés (méthode simplifiée):");
                console.log(`- WETH (token0): ${ethAmount} ETH`);
                console.log(`- USDC (token1): ${usdcEquivalent} USDC`);
            }
        } else {
            // Pas de stablecoin
            amount0Desired = token0 === POLYGON_TOKENS.WETH ? ethValue : 0n;
            amount1Desired = token1 === POLYGON_TOKENS.WETH ? ethValue : 0n;
        }
        
        console.log("=== MONTANTS CALCULÉS ===");
        console.log("Amount0 désiré:", amount0Desired.toString());
        console.log("Amount1 désiré:", amount1Desired.toString());
        
        // Debug formaté pour comprendre les montants
        if (needsStablecoin) {
            if (isToken0Stablecoin) {
                console.log(`Amount0 (USDC): ${ethers.formatUnits(amount0Desired, 6)} USDC`);
                console.log(`Amount1 (WETH): ${ethers.formatUnits(amount1Desired, 18)} WETH`);
            } else {
                console.log(`Amount0 (WETH): ${ethers.formatUnits(amount0Desired, 18)} WETH`);
                console.log(`Amount1 (USDC): ${ethers.formatUnits(amount1Desired, 6)} USDC`);
            }
        }
        
        if (needsStablecoin && requiredStablecoin > 0n) {
            const requiredStablecoinFormatted = ethers.formatUnits(requiredStablecoin, stablecoinDecimals);
            const availableStablecoinFormatted = ethers.formatUnits(stablecoinBalance, stablecoinDecimals);
            
            console.log(`${stablecoinSymbol} requis: ${requiredStablecoinFormatted}`);
            console.log(`${stablecoinSymbol} disponible: ${availableStablecoinFormatted}`);
            
            if (stablecoinBalance < requiredStablecoin) {
                this.hideLoadingModal();
                alert(`❌ Solde ${stablecoinSymbol} insuffisant!\n\nVous avez: ${availableStablecoinFormatted} ${stablecoinSymbol}\nRequis: ${requiredStablecoinFormatted} ${stablecoinSymbol}\n\nPour ${ethAmount} ETH à ce prix, vous avez besoin de ${requiredStablecoinFormatted} ${stablecoinSymbol}.`);
                return;
            }
            
            // === ÉTAPE 8: VÉRIFICATION ET APPROBATION ===
            console.log("=== VÉRIFICATION DE L'APPROBATION ===");
            this.showLoadingModal(`Vérification des approbations ${stablecoinSymbol}...`);
            
            const NFT_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
            const currentAllowance = await stablecoinContract.allowance(userAddress, NFT_POSITION_MANAGER);
            
            console.log(`Approbation actuelle: ${ethers.formatUnits(currentAllowance, stablecoinDecimals)} ${stablecoinSymbol}`);
            
            if (currentAllowance < requiredStablecoin) {
                console.log('🔓 Approbation stablecoin requise...');
                this.showLoadingModal(`Approbation ${stablecoinSymbol} en cours...`);
                
                const stablecoinWithSigner = stablecoinContract.connect(signer);
                const approveTx = await stablecoinWithSigner.approve(
                    NFT_POSITION_MANAGER,
                    ethers.parseUnits("1000000", stablecoinDecimals)
                );
                
                console.log('📤 Transaction d\'approbation envoyée:', approveTx.hash);
                const approveReceipt = await approveTx.wait();
                console.log('✅ Approbation confirmée:', approveReceipt.hash);
            } else {
                console.log('✅ Approbation existante suffisante');
            }
        }
        
        // === ÉTAPE 9: CRÉATION DE LA POSITION ===
        this.showLoadingModal('Création de la position Uniswap V3...');
        
        const NFT_POSITION_MANAGER_ABI = [
            "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
        ];
        
        const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes
        
        // Paramètres pour la position
        const NFT_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
        const positionManager = new ethers.Contract(NFT_POSITION_MANAGER, NFT_POSITION_MANAGER_ABI, signer);
        
        // *** CORRECTION IMPORTANTE ***
        // Quand on utilise ETH natif, on ne doit pas spécifier les montants WETH dans les paramètres
        // Le contrat se charge automatiquement de la conversion ETH -> WETH
        
        let finalAmount0Desired, finalAmount1Desired;
        let ethToSend = 0n;
        
        if (isToken0Stablecoin) {
            // USDC est token0, WETH est token1
            finalAmount0Desired = amount0Desired; // USDC
            finalAmount1Desired = 0n; // ETH sera envoyé via value, pas amount1Desired
            ethToSend = ethValue;
        } else {
            // WETH est token0, USDC est token1
            finalAmount0Desired = 0n; // ETH sera envoyé via value, pas amount0Desired
            finalAmount1Desired = amount1Desired; // USDC
            ethToSend = ethValue;
        }
        
        const params = {
            token0,
            token1,
            fee: poolFee,
            tickLower,
            tickUpper,
            amount0Desired: finalAmount0Desired,
            amount1Desired: finalAmount1Desired,
            amount0Min: finalAmount0Desired * 95n / 100n, // 5% de slippage minimum
            amount1Min: finalAmount1Desired * 95n / 100n, // 5% de slippage minimum
            recipient: userAddress,
            deadline
        };
        
        console.log('🚀 Paramètres finaux de la position:', {
            token0: `${token0}`,
            token1: `${token1}`,
            fee: poolFee,
            tickLower,
            tickUpper,
            amount0Desired: finalAmount0Desired.toString(),
            amount1Desired: finalAmount1Desired.toString(),
            ethToSend: ethToSend.toString(),
            poolAddress
        });
        
        // Créer la position
        const tx = await positionManager.mint(params, {
            value: ethToSend, // Envoyer ETH - sera automatiquement converti en WETH
            gasLimit: 5000000
        });
        
        console.log('📤 Transaction envoyée:', tx.hash);
        
        const receipt = await tx.wait();
        console.log('✅ Transaction confirmée:', receipt.hash);
        
        // Ajouter à l'interface
        const newPosition = {
            id: Date.now(),
            strategy: 'Uniswap V3',
            pool: selectedPool.toUpperCase(),
            amount: needsStablecoin ? 
                `${ethAmount} ETH + ${ethers.formatUnits(requiredStablecoin, stablecoinDecimals)} ${stablecoinSymbol}` :
                `${ethAmount} ETH`,
            apr: '45.0%',
            pnl: '+0.00%',
            status: 'active',
            tokenId: "N/A"
        };
        
        this.positions.push(newPosition);
        this.updatePositionsTable();
        this.updateDashboardStats();
        
        this.hideLoadingModal();
        
        alert(`🎉 Position créée avec succès!\n\n📄 Transaction: ${tx.hash}\n💰 Montant: ${newPosition.amount}\n🔗 Voir sur PolygonScan: https://polygonscan.com/tx/${tx.hash}`);
        
    } catch (error) {
        this.hideLoadingModal();
        console.error('❌ Erreur complète:', error);
        
        let errorMessage = "Erreur inconnue";
        
        if (error.code === 4001) {
            errorMessage = 'Transaction annulée par l\'utilisateur';
        } else if (error.code === -32603) {
            errorMessage = 'Erreur de gas - Augmentez la limite ou vérifiez vos fonds';
        } else if (error.reason) {
            errorMessage = `Erreur contractuelle: ${error.reason}`;
        } else if (error.message) {
            errorMessage = `Erreur: ${error.message}`;
            
            if (error.message.includes('execution reverted')) {
                errorMessage = 'Erreur: Transaction échouée. Vérifiez que:\n- Le pool existe avec ce fee tier\n- Les ticks sont valides\n- Vous avez suffisamment de fonds\n- Les approbations sont correctes';
            } else if (error.message.includes('insufficient funds')) {
                errorMessage = 'Fonds insuffisants pour cette transaction.';
            } else if (error.message.includes('INVALID_TICK')) {
                errorMessage = 'Erreur: Ticks invalides. La plage de prix sélectionnée n\'est pas valide pour ce pool.';
            }
        }
        
        alert(errorMessage);
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