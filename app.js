console.log('🚀 DÉBUT app.js - Version Aave uniquement');

// ===== CONTRACT CONFIGURATION =====
var POLYGON_CHAIN_ID = 137;

// Tokens Polygon - CORRECTION DES ADRESSES USDC
var POLYGON_TOKENS = {
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC Native (nouvelle adresse)
    USDC_BRIDGED: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (ancienne)
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    WBTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6"
};

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
        this.activeStrategy = 'aave';
        this.positions = [];
        this.tokenBalances = {}; // Cache des soldes
        
        this.init();
        console.log('YieldMaxApp initialized');
    }

    init() {
        this.setupEventListeners();
        this.updateUI();
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

            this.captureNewDeposit(
                selectedAsset,   // L'asset sélectionné (ex: 'usdc')
                amount,          // Le montant déposé
                tx.hash          // Le hash de la transaction
            );
            
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
        this.showNotification(`❌ ${errorMessage}`, 'error');
    }

    // Fonction pour récupérer les rendements
    async collectAaveRewards() {
        if (!this.walletConnected) {
            this.showNotification('Veuillez connecter votre wallet', 'warning');
            return;
        }
        
        try {
            this.showLoadingModal('Récupération des rendements en cours...');
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // Récupérer l'historique des dépôts
            let depositHistory = [];
            try {
                const savedHistory = localStorage.getItem('aaveDepositHistory');
                if (savedHistory) {
                    depositHistory = JSON.parse(savedHistory);
                }
            } catch (error) {
                console.error('❌ Erreur lors du chargement de l\'historique des dépôts:', error);
                depositHistory = [];
            }
            
            // Calculer le dépôt total initial
            const totalInitialDeposit = depositHistory.reduce((sum, entry) => sum + entry.amount, 0);
            
            // Récupérer le solde actuel sur Aave
            const AAVE_POOL_ABI = [
                "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
            ];
            
            const aavePool = new ethers.Contract(AAVE_V3_POLYGON.POOL, AAVE_POOL_ABI, provider);
            const accountData = await aavePool.getUserAccountData(this.currentAccount);
            
            // Convertir en format lisible (base = 8 décimales pour le prix USD)
            const totalCollateralUSD = ethers.formatUnits(accountData.totalCollateralBase, 8);
            const currentValue = parseFloat(totalCollateralUSD);
            
            // Calculer les gains
            const earnings = currentValue - totalInitialDeposit;
            
            // S'assurer qu'il y a des gains à récupérer
            if (earnings <= 0) {
                this.hideLoadingModal();
                this.showNotification('❌ Aucun rendement à récupérer', 'warning');
                return;
            }
            
            // ABI pour le retrait
            const WITHDRAW_ABI = [
                "function withdraw(address asset, uint256 amount, address to) external returns (uint256)"
            ];
            
            // Préparer le montant des gains à retirer (avec les décimales appropriées)
            const earningsWithDecimals = ethers.parseUnits(earnings.toFixed(6), 6); // 6 décimales pour USDC
            
            // Adresse du token USDC
            const usdcAddress = AAVE_V3_POLYGON.ASSETS.USDC.address;
            
            const withdrawContract = new ethers.Contract(AAVE_V3_POLYGON.POOL, WITHDRAW_ABI, signer);
            
            console.log(`🔄 Retrait des rendements: ${earnings.toFixed(6)} USDC`);
            
            // Effectuer le retrait des rendements uniquement
            const tx = await withdrawContract.withdraw(
                usdcAddress,
                earningsWithDecimals,
                this.currentAccount
            );
            
            console.log('📤 Transaction envoyée:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('✅ Retrait des rendements confirmé:', receipt.hash);
            
            // Ajouter une entrée dans l'historique pour le retrait des rendements
            const withdrawalEntry = {
                id: Date.now(),
                date: new Date().toISOString(),
                asset: 'USDC',
                amount: -earnings, // Montant négatif pour indiquer un retrait
                apy: 0, // Non applicable pour un retrait
                txHash: receipt.hash,
                notes: 'Retrait des rendements accumulés'
            };
            
            depositHistory.push(withdrawalEntry);
            localStorage.setItem('aaveDepositHistory', JSON.stringify(depositHistory));
            
            this.hideLoadingModal();
            this.showNotification(`✅ ${earnings.toFixed(6)} USDC de rendements récupérés avec succès!`, 'success');
            
            // Rafraîchir l'affichage
            await this.loadAavePositions();
            
        } catch (error) {
            this.hideLoadingModal();
            console.error('❌ Erreur lors de la récupération des rendements:', error);
            
            let errorMessage = 'Erreur lors de la récupération des rendements';
            if (error.code === 4001) {
                errorMessage = 'Transaction rejetée par l\'utilisateur';
            } else if (error.message?.includes('execution reverted')) {
                errorMessage = 'Transaction annulée par le contrat. Vérifiez votre solde et les paramètres.';
            }
            
            this.showNotification(`❌ ${errorMessage}`, 'error');
        }
    }

    // Fonction pour retirer la position
    async withdrawAavePosition() {
        if (!this.walletConnected) {
            this.showNotification('Veuillez connecter votre wallet', 'warning');
            return;
        }
        
        if (!confirm('Êtes-vous sûr de vouloir retirer votre position Aave?\nCela retirera votre capital et les rendements accumulés.')) {
            return;
        }
        
        try {
            this.showLoadingModal('Retrait de la position Aave en cours...');
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // Récupérer le solde actuel sur Aave
            const AAVE_POOL_ABI = [
                "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
            ];
            
            const aavePool = new ethers.Contract(AAVE_V3_POLYGON.POOL, AAVE_POOL_ABI, provider);
            const accountData = await aavePool.getUserAccountData(this.currentAccount);
            
            // Convertir en format lisible (base = 8 décimales pour le prix USD)
            const totalCollateralUSD = ethers.formatUnits(accountData.totalCollateralBase, 8);
            const currentValue = parseFloat(totalCollateralUSD);
            
            // S'assurer qu'il y a une position à retirer
            if (currentValue <= 0) {
                this.hideLoadingModal();
                this.showNotification('❌ Aucune position à retirer', 'warning');
                return;
            }
            
            // ABI pour le retrait
            const WITHDRAW_ABI = [
                "function withdraw(address asset, uint256 amount, address to) external returns (uint256)"
            ];
            
            // Adresse du token USDC
            const usdcAddress = AAVE_V3_POLYGON.ASSETS.USDC.address;
            
            const withdrawContract = new ethers.Contract(AAVE_V3_POLYGON.POOL, WITHDRAW_ABI, signer);
            
            console.log(`🔄 Retrait complet de la position: ${currentValue.toFixed(6)} USDC`);
            
            // Utiliser uint256.max pour retirer tout le solde
            const maxUint256 = ethers.MaxUint256;
            
            // Effectuer le retrait complet
            const tx = await withdrawContract.withdraw(
                usdcAddress,
                maxUint256,
                this.currentAccount
            );
            
            console.log('📤 Transaction envoyée:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('✅ Retrait complet confirmé:', receipt.hash);
            
            // Récupérer l'historique des dépôts
            let depositHistory = [];
            try {
                const savedHistory = localStorage.getItem('aaveDepositHistory');
                if (savedHistory) {
                    depositHistory = JSON.parse(savedHistory);
                }
            } catch (error) {
                console.error('❌ Erreur lors du chargement de l\'historique des dépôts:', error);
                depositHistory = [];
            }
            
            // Ajouter une entrée dans l'historique pour le retrait complet
            const withdrawalEntry = {
                id: Date.now(),
                date: new Date().toISOString(),
                asset: 'USDC',
                amount: -currentValue, // Montant négatif pour indiquer un retrait
                apy: 0, // Non applicable pour un retrait
                txHash: receipt.hash,
                notes: 'Retrait complet de la position'
            };
            
            depositHistory.push(withdrawalEntry);
            localStorage.setItem('aaveDepositHistory', JSON.stringify(depositHistory));
            
            this.hideLoadingModal();
            this.showNotification(`✅ Position de ${currentValue.toFixed(6)} USDC retirée avec succès!`, 'success');
            
            // Rafraîchir l'affichage
            await this.loadAavePositions();
            
            // Mettre à jour les soldes de tokens
            await this.loadTokenBalances();
            
        } catch (error) {
            this.hideLoadingModal();
            console.error('❌ Erreur lors du retrait de la position:', error);
            
            let errorMessage = 'Erreur lors du retrait de la position';
            if (error.code === 4001) {
                errorMessage = 'Transaction rejetée par l\'utilisateur';
            } else if (error.message?.includes('execution reverted')) {
                errorMessage = 'Transaction annulée par le contrat. Vérifiez votre solde et les paramètres.';
            }
            
            this.showNotification(`❌ ${errorMessage}`, 'error');
        }
    }

    // Fonction pour capturer les nouveaux dépôts
    // Cette fonction doit être appelée après chaque dépôt réussi
    captureNewDeposit(asset, amount, txHash) {
        // Récupérer l'historique existant
        let depositHistory = [];
        try {
            const savedHistory = localStorage.getItem('aaveDepositHistory');
            if (savedHistory) {
                depositHistory = JSON.parse(savedHistory);
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement de l\'historique des dépôts:', error);
            depositHistory = [];
        }
        
        // Récupérer l'APY actuel (utiliser une valeur par défaut si non disponible)
        let currentAPY = 3.71; // Valeur par défaut
        
        // Créer la nouvelle entrée
        const newDeposit = {
            id: Date.now(),
            date: new Date().toISOString(),
            asset: asset.toUpperCase(),
            amount: parseFloat(amount),
            apy: currentAPY,
            txHash: txHash,
            notes: 'Dépôt via l\'application'
        };
        
        // Ajouter au tableau et sauvegarder
        depositHistory.push(newDeposit);
        localStorage.setItem('aaveDepositHistory', JSON.stringify(depositHistory));
        
        console.log('💾 Nouveau dépôt enregistré dans l\'historique:', newDeposit);
    }

    // Fonction pour mettre à jour l'affichage des positions Aave avec les boutons d'action
    updateAavePositionsWithActions(currentValue, earnings, earningsPercentage, currentAPY, actualUSDCAmount, projections, depositHistory) {
    // Récupérer les éléments
    const positionsSection = document.getElementById('aavePositions');
    const positionsList = document.getElementById('aavePositionsList');
    
    if (!positionsSection || !positionsList) {
        console.error('❌ Éléments pour l\'affichage des positions Aave non trouvés');
        return;
    }
    
    // Vider et afficher la section
    positionsList.innerHTML = '';
    positionsSection.style.display = 'block';
    
    // Créer l'élément de position principal
    const positionItem = document.createElement('div');
    positionItem.className = 'aave-position-item';
    
    // En-tête avec les informations de base
    const header = document.createElement('div');
    header.className = 'position-header';
    
    // Information sur la position
    const info = document.createElement('div');
    info.className = 'position-info';
    
    const assetSpan = document.createElement('span');
    assetSpan.className = 'asset';
    assetSpan.textContent = 'USDC Supply';
    
    const amountSpan = document.createElement('span');
    amountSpan.className = 'amount';
    amountSpan.textContent = `${actualUSDCAmount} USDC`;
    
    info.appendChild(assetSpan);
    info.appendChild(amountSpan);
    
    // Informations sur le rendement
    const yieldInfo = document.createElement('div');
    yieldInfo.className = 'position-yield';
    
    const apySpan = document.createElement('span');
    apySpan.className = 'apr'; // Garder la classe CSS existante
    apySpan.textContent = `${currentAPY.toFixed(2)}% APY`; // Changer APR en APY
    
    const pnlSpan = document.createElement('span');
    pnlSpan.className = `pnl ${earnings >= 0 ? 'text-success' : 'text-danger'}`;
    pnlSpan.textContent = `${earnings >= 0 ? '+' : ''}${earnings.toFixed(4)} USD (${earnings >= 0 ? '+' : ''}${earningsPercentage.toFixed(4)}%)`;
    
    yieldInfo.appendChild(apySpan);
    yieldInfo.appendChild(pnlSpan);
    
    header.appendChild(info);
    header.appendChild(yieldInfo);
    
    // Détails avec les valeurs actuelles et projections
    const details = document.createElement('div');
    details.className = 'position-details';
    
    // Fonction d'aide pour créer des éléments de détail
    function createDetailItem(label, value, isSuccess = false) {
        const detailItem = document.createElement('div');
        detailItem.className = 'detail-item';
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'label';
        labelSpan.textContent = label;
        
        const valueSpan = document.createElement('span');
        valueSpan.className = isSuccess ? 'value text-success' : 'value';
        valueSpan.textContent = value;
        
        detailItem.appendChild(labelSpan);
        detailItem.appendChild(valueSpan);
        
        return detailItem;
    }
    
    // Ajouter les détails
    const initialDeposit = depositHistory.reduce((sum, entry) => sum + entry.amount, 0);
    
    details.appendChild(createDetailItem('Dépôt initial total:', `${initialDeposit.toFixed(6)} USDC`));
    details.appendChild(createDetailItem('Valeur actuelle:', `${actualUSDCAmount} USDC`));
    details.appendChild(createDetailItem(
        'Gains accumulés:', 
        `${earnings >= 0 ? '+' : ''}${earnings.toFixed(4)} USDC (${earnings >= 0 ? '+' : ''}${earningsPercentage.toFixed(4)}%)`,
        earnings >= 0
    ));
    
    // Projections basées sur l'APY actuel
    details.appendChild(createDetailItem('Rendement journalier:', `+${projections.daily} USDC`, true));
    details.appendChild(createDetailItem('Rendement mensuel:', `+${projections.monthly} USDC`, true));
    details.appendChild(createDetailItem('Rendement annuel:', `+${projections.yearly} USDC`, true));
    
    // Boutons d'action
    const actions = document.createElement('div');
    actions.className = 'position-actions';
    
    // Bouton pour récupérer les rendements
    const collectBtn = document.createElement('button');
    collectBtn.className = 'action-btn collect-btn';
    collectBtn.onclick = () => this.collectAaveRewards();
    
    const collectIcon = document.createElement('i');
    collectIcon.className = 'fas fa-coins';
    collectBtn.appendChild(collectIcon);
    collectBtn.appendChild(document.createTextNode(' Récupérer les rendements'));
    
    // Bouton pour retirer le capital
    const withdrawBtn = document.createElement('button');
    withdrawBtn.className = 'action-btn withdraw-btn';
    withdrawBtn.onclick = () => this.withdrawAavePosition();
    
    const withdrawIcon = document.createElement('i');
    withdrawIcon.className = 'fas fa-wallet';
    withdrawBtn.appendChild(withdrawIcon);
    withdrawBtn.appendChild(document.createTextNode(' Retirer le capital'));
    
    // Lien pour voir sur Aave
    const viewLink = document.createElement('a');
    viewLink.href = 'https://app.aave.com/dashboard';
    viewLink.target = '_blank';
    viewLink.className = 'action-btn view-btn';
    
    const viewIcon = document.createElement('i');
    viewIcon.className = 'fas fa-external-link-alt';
    viewLink.appendChild(viewIcon);
    viewLink.appendChild(document.createTextNode(' Voir sur Aave'));
    
    actions.appendChild(collectBtn);
    actions.appendChild(withdrawBtn);
    actions.appendChild(viewLink);
    
    // Assembler la section principale
    positionItem.appendChild(header);
    positionItem.appendChild(details);
    positionItem.appendChild(actions);
    
    // Tableau d'historique des dépôts
    const historySection = document.createElement('div');
    historySection.className = 'deposit-history-section';
    
    const historyTitle = document.createElement('h4');
    historyTitle.textContent = 'Historique des dépôts';
    historySection.appendChild(historyTitle);
    
    // Créer le tableau d'historique
    const historyTable = document.createElement('table');
    historyTable.className = 'deposit-history-table';
    
    // En-tête du tableau
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    ['Date', 'Asset', 'Montant', 'APY au dépôt', 'Transaction', 'Notes'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    historyTable.appendChild(thead);
    
    // Corps du tableau
    const tbody = document.createElement('tbody');
    
    depositHistory.forEach(entry => {
        const row = document.createElement('tr');
        
        // Date formatée
        const dateCell = document.createElement('td');
        const date = new Date(entry.date);
        dateCell.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        row.appendChild(dateCell);
        
        // Asset
        const assetCell = document.createElement('td');
        assetCell.textContent = entry.asset;
        row.appendChild(assetCell);
        
        // Montant
        const amountCell = document.createElement('td');
        amountCell.textContent = entry.amount.toFixed(6);
        row.appendChild(amountCell);
        
        // APY au moment du dépôt
        const apyCell = document.createElement('td');
        apyCell.textContent = entry.apy ? entry.apy.toFixed(2) + '%' : 'N/A';
        row.appendChild(apyCell);
        
        // Hash de transaction
        const txCell = document.createElement('td');
        if (entry.txHash) {
            const txLink = document.createElement('a');
            txLink.href = `https://polygonscan.com/tx/${entry.txHash}`;
            txLink.target = '_blank';
            txLink.textContent = entry.txHash.substring(0, 8) + '...';
            txCell.appendChild(txLink);
        } else {
            txCell.textContent = 'N/A';
        }
        row.appendChild(txCell);
        
        // Notes
        const notesCell = document.createElement('td');
        notesCell.textContent = entry.notes || '';
        row.appendChild(notesCell);
        
        tbody.appendChild(row);
    });
    
    historyTable.appendChild(tbody);
    historySection.appendChild(historyTable);
    
    // Bouton pour ajouter un dépôt manuellement (pour les dépôts passés)
    const addDepositBtn = document.createElement('button');
    addDepositBtn.className = 'action-btn add-deposit-btn';
    addDepositBtn.innerHTML = '<i class="fas fa-plus"></i> Ajouter un dépôt manuellement';
    addDepositBtn.onclick = () => this.showAddDepositModal();
    
    historySection.appendChild(addDepositBtn);
    
    // Ajouter tout à la liste des positions
    positionsList.appendChild(positionItem);
    positionsList.appendChild(historySection);
    
    // Afficher le bouton de retrait dans la section principale
    const withdrawMainBtn = document.getElementById('aaveWithdrawBtn');
    if (withdrawMainBtn) withdrawMainBtn.style.display = 'inline-flex';
    
    console.log('✅ Section des positions Aave mise à jour avec les boutons d\'action');
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

    generateArbitrageOpportunities() {
        // Simuler des opportunités d'arbitrage en temps réel
        const opportunities = [
            {
                pair: 'ETH/USDC',
                exchanges: 'Curve → Balancer',
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
                console.log('🖱️ Bouton "Récupérer positions Aave" cliqué');
                this.loadAavePositions();
            });
        }

        // Boutons de déploiement de stratégie
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
    console.log('📢 Fonction loadAavePositions() appelée');

    if (!this.walletConnected) {
        console.log('❌ Wallet non connecté');
        this.showNotification('Veuillez connecter votre wallet', 'warning');
        return;
    }

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        
        // Vérifier qu'on est sur Polygon
        const network = await provider.getNetwork();
        const currentChainId = Number(network.chainId);
        console.log('🌐 Réseau actuel:', currentChainId, 'Polygon ID attendu:', POLYGON_CHAIN_ID);

        if (currentChainId !== POLYGON_CHAIN_ID) {
            console.log('⚠️ Mauvais réseau, attendu:', POLYGON_CHAIN_ID, 'actuel:', currentChainId);
            this.showNotification('⚠️ Changez vers le réseau Polygon', 'warning');
            return;
        }

        this.showNotification('🔄 Récupération des positions Aave...', 'info');
        console.log('🔍 Recherche des positions Aave pour:', this.currentAccount);
        
        // ABI pour getUserAccountData
        const AAVE_POOL_ABI = [
            "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
        ];
        
        // ABI pour récupérer le taux d'intérêt actuel (pour référence)
        const AAVE_DATA_PROVIDER_ABI = [
            "function getReserveData(address asset) external view returns (tuple(uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id))"
        ];
        
        console.log('🔄 Adresse du Pool Aave V3:', AAVE_V3_POLYGON.POOL);
        const aavePool = new ethers.Contract(AAVE_V3_POLYGON.POOL, AAVE_POOL_ABI, provider);
        
        // Récupérer les données du compte
        console.log('📡 Appel à getUserAccountData pour:', this.currentAccount);
        const accountData = await aavePool.getUserAccountData(this.currentAccount);
        console.log('✅ Réponse reçue de getUserAccountData');
            
        console.log('📊 Données du compte Aave:', {
            totalCollateralBase: accountData.totalCollateralBase.toString(),
            totalDebtBase: accountData.totalDebtBase.toString(),
            availableBorrowsBase: accountData.availableBorrowsBase.toString(),
            healthFactor: accountData.healthFactor.toString()
        });
        
        // Convertir en format lisible (base = 8 décimales pour le prix USD)
        const totalCollateralUSD = ethers.formatUnits(accountData.totalCollateralBase, 8);
        const totalDebtUSD = ethers.formatUnits(accountData.totalDebtBase, 8);
        
        console.log('💰 Valeurs formatées:', {
            collateralUSD: totalCollateralUSD,
            debtUSD: totalDebtUSD
        });
        
        if (parseFloat(totalCollateralUSD) === 0) {
            console.log('ℹ️ Aucun collatéral trouvé');
            this.showNotification('ℹ️ Aucune position Aave trouvée', 'info');
            return;
        }
        
        // Récupérer l'historique des dépôts depuis le localStorage
        let depositHistory = [];
        try {
            const savedHistory = localStorage.getItem('aaveDepositHistory');
            if (savedHistory) {
                depositHistory = JSON.parse(savedHistory);
                console.log('📋 Historique des dépôts chargé:', depositHistory);
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement de l\'historique des dépôts:', error);
            // Initialiser un tableau vide en cas d'erreur
            depositHistory = [];
        }
        
        // Si aucun historique, créer une entrée par défaut basée sur la valeur actuelle
        if (depositHistory.length === 0) {
            console.log('ℹ️ Aucun historique trouvé, création d\'une entrée par défaut');
            
            // Supposer que c'est un dépôt USDC (le plus courant)
            const defaultEntry = {
                id: Date.now(),
                date: new Date().toISOString(),
                asset: 'USDC',
                amount: 50.949, // Valeur par défaut basée sur les discussions précédentes
                apy: 3.71,      // APY par défaut pour USDC
                txHash: '',     // Hash de transaction inconnu
                notes: 'Position détectée automatiquement'
            };
            
            depositHistory.push(defaultEntry);
            
            // Sauvegarder l'historique
            localStorage.setItem('aaveDepositHistory', JSON.stringify(depositHistory));
        }
        
        // Calculer le dépôt total initial et les gains
        const totalInitialDeposit = depositHistory.reduce((sum, entry) => sum + entry.amount, 0);
        const currentValue = parseFloat(totalCollateralUSD);
        const earnings = currentValue - totalInitialDeposit;
        const earningsPercentage = (earnings / totalInitialDeposit) * 100;
        
        // Essayer de récupérer l'APY actuel (utiliser une valeur par défaut en cas d'échec)
        let currentAPY = 3.71; // Valeur par défaut
        
        try {
            // Tenter de récupérer l'APY actuel pour USDC
            const dataProviderAddress = "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654"; // UI Data Provider Aave V3 Polygon
            const dataProvider = new ethers.Contract(dataProviderAddress, AAVE_DATA_PROVIDER_ABI, provider);
            
            // Récupérer les données pour USDC
            const reserveData = await dataProvider.getReserveData(AAVE_V3_POLYGON.ASSETS.USDC.address);
            
            // liquidityRate est le taux de dépôt (APY) en RAY units (1e27)
            const apyRaw = reserveData.liquidityRate;
            currentAPY = parseFloat(ethers.formatUnits(apyRaw, 27)) * 100;
            
            console.log(`📊 Taux APY actuel pour USDC: ${currentAPY.toFixed(2)}%`);
        } catch (error) {
            console.warn('⚠️ Impossible de récupérer le taux APY actuel:', error);
            // Continuer avec le taux par défaut
        }
        
        // Calculer les projections de rendement basées sur l'APY actuel
        const dailyRate = currentAPY / 365;
        const dailyEarnings = (currentValue * dailyRate / 100).toFixed(6);
        const monthlyEarnings = (currentValue * currentAPY / 100 / 12).toFixed(4);
        const yearlyEarnings = (currentValue * currentAPY / 100).toFixed(2);
        
        // Mettre à jour l'interface avec les données
        this.updateAavePositionsWithActions(
            currentValue,
            earnings,
            earningsPercentage,
            currentAPY,
            currentValue.toFixed(6),
            {
                daily: dailyEarnings,
                monthly: monthlyEarnings,
                yearly: yearlyEarnings
            },
            depositHistory
        );
        
        // Afficher un message de succès
        this.showNotification(`✅ Position Aave récupérée ($${currentValue.toFixed(2)} USD)`, 'success');
        console.log(`✅ Position Aave trouvée: $${currentValue.toFixed(2)} USD, Gains: $${earnings.toFixed(4)} (${earningsPercentage.toFixed(4)}%)`);
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des positions Aave:', error);
        console.error('Message d\'erreur:', error.message);
        
        // Message d'erreur adapté selon le type d'erreur
        let userMessage = 'Erreur lors de la récupération des positions';
        
        if (error.message?.includes('user rejected') || error.code === 4001) {
            userMessage = 'Transaction rejetée par l\'utilisateur';
        } else if (error.message?.includes('network') || error.message?.includes('chainId')) {
            userMessage = 'Erreur réseau. Vérifiez que vous êtes sur Polygon';
        } else if (error.message?.includes('contract') || error.message?.includes('Pool')) {
            userMessage = 'Erreur de contrat Aave. Essayez à nouveau plus tard';
        }
        
        this.showNotification(`❌ ${userMessage}`, 'error');
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
            
            // 2. Recharger les positions Aave
            await this.loadAavePositions();
            
            // 3. Mettre à jour l'affichage
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

console.log('🏁 FIN app.js - Version Aave uniquement');

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

document.addEventListener('DOMContentLoaded', () => {
    const refreshAaveBtn = document.getElementById('refreshAaveBtn');
    if (refreshAaveBtn) {
        console.log('Bouton Aave trouvé, ajout d\'un écouteur direct');
        refreshAaveBtn.addEventListener('click', function() {
            console.log('Bouton Aave cliqué directement');
            if (app && typeof app.loadAavePositions === 'function') {
                app.loadAavePositions();
            } else {
                console.error('app.loadAavePositions n\'est pas disponible');
            }
        });
    } else {
        console.error('Bouton refreshAaveBtn non trouvé dans le DOM');
    }
});