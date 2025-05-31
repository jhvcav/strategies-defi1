console.log('🚀 DÉBUT app.js');

try {
    console.log('Définition de la classe YieldMaxApp...');

// ===== GLOBAL STATE MANAGEMENT =====
class YieldMaxApp {
    constructor() {
        this.walletConnected = false;
        this.currentAccount = null;
        this.currentNetwork = 'ethereum';
        this.activeStrategy = 'uniswap';
        this.positions = [];
        this.web3Provider = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateUI();
        this.startRealTimeUpdates();
    }

    // ===== CONTRACT CONFIGURATION =====
    const POLYGON_CONTRACTS = {
        STRATEGY_UNISWAP_V3: "0x669227b0bB3A6BFC717fe8bEA17EEF3cB37f5eBC",
    // Pour plus tard :
    // STRATEGY_AAVE: "0x...",  
    // STRATEGY_FLASH: "0x..."
    };

    const POLYGON_CHAIN_ID = 137;

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
        // Hide all strategy contents
        document.querySelectorAll('.strategy-content').forEach(content => {
            content.classList.remove('active');
        });

        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected strategy
        document.getElementById(`${strategyName}-strategy`).classList.add('active');
        document.querySelector(`[data-strategy="${strategyName}"]`).classList.add('active');
        
        this.activeStrategy = strategyName;
        this.updateStrategyMetrics();
    }

    // ===== UNISWAP V3 STRATEGY =====
    updateUniswapMetrics() {
        const ethAmount = parseFloat(document.getElementById('ethAmount').value) || 0;
        const selectedRange = document.querySelector('.range-btn.active')?.dataset.range || 10;
        
        if (ethAmount > 0) {
            // Calculs simulés pour l'exemple
            const baseAPR = 45;
            const rangeMultiplier = selectedRange === '5' ? 1.8 : selectedRange === '10' ? 1.4 : 1.2;
            const estimatedAPR = (baseAPR * rangeMultiplier).toFixed(1);
            const dailyFees = (ethAmount * 0.0012 * rangeMultiplier).toFixed(2);
            const impermanentLoss = selectedRange === '5' ? 2.1 : selectedRange === '10' ? 1.5 : 0.8;

            // Update UI
            document.querySelector('#uniswap-strategy .highlight').textContent = `${estimatedAPR}%`;
            document.querySelector('#uniswap-strategy .yield-metrics .metric:nth-child(2) strong').textContent = `$${dailyFees}`;
            document.querySelector('#uniswap-strategy .warning').textContent = `-${impermanentLoss}%`;
        }
    }

    async deployUniswapStrategy() {
    if (!this.walletConnected) {
        alert('Veuillez connecter votre wallet');
        return;
    }

    // Vérifier qu'on est sur Polygon
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (parseInt(chainId, 16) !== POLYGON_CHAIN_ID) {
        alert('Veuillez vous connecter au réseau Polygon');
        return;
    }

    const ethAmount = document.getElementById('ethAmount').value;
    const selectedPool = document.getElementById('poolSelect').value;
    
    if (!ethAmount || ethAmount <= 0) {
        alert('Veuillez entrer un montant valide');
        return;
    }

    this.showLoadingModal('Transaction en cours sur Polygon...');

    try {
        // TODO: Appel au vrai contrat ici
        // const contract = new ethers.Contract(POLYGON_CONTRACTS.STRATEGY_UNISWAP_V3, ABI, signer);
        
        // Pour l'instant, simulation
        await this.simulateTransaction(3000);
        
        const newPosition = {
            id: Date.now(),
            strategy: 'Uniswap V3',
            pool: selectedPool.toUpperCase(),
            amount: `${ethAmount} ETH`,
            apr: '78.5%',
            pnl: '+0.00%',
            status: 'active'
        };
        
        this.positions.push(newPosition);
        this.updatePositionsTable();
        this.updateDashboardStats();
        
        this.hideLoadingModal();
        alert(`Position créée sur Polygon!\nContrat: ${POLYGON_CONTRACTS.STRATEGY_UNISWAP_V3}`);
        
    } catch (error) {
        this.hideLoadingModal();
        console.error('Erreur:', error);
        alert('Erreur lors de la transaction');
    }
}

    // ===== AAVE STRATEGY =====
    updateAaveMetrics() {
        const collateralAmount = parseFloat(document.getElementById('collateralAmount').value) || 0;
        const leverage = parseFloat(document.getElementById('leverageRange').value) || 2;
        
        document.getElementById('leverageValue').textContent = `${leverage.toFixed(1)}x`;
        
        if (collateralAmount > 0) {
            // Calculs simulés
            const baseAPR = 18;
            const leveragedAPR = (baseAPR * leverage * 0.7).toFixed(1);
            const healthFactor = (4 / leverage).toFixed(2);
            const liquidationPrice = (2000 / leverage * 0.85).toFixed(0);

            // Update UI
            document.querySelector('#aave-strategy .highlight').textContent = `${leveragedAPR}%`;
            document.querySelector('#aave-strategy .safe').textContent = healthFactor;
            document.querySelector('#aave-strategy .warning').textContent = `$${liquidationPrice}`;
        }
    }

    async deployAaveStrategy() {
        if (!this.walletConnected) {
            alert('Veuillez connecter votre wallet');
            return;
        }

        const collateralAmount = document.getElementById('collateralAmount').value;
        const leverage = document.getElementById('leverageRange').value;
        
        if (!collateralAmount || collateralAmount <= 0) {
            alert('Veuillez entrer un montant valide');
            return;
        }

        this.showLoadingModal('Déploiement de la stratégie Aave...');

        try {
            await this.simulateTransaction(4000);
            
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
            await this.simulateTransaction(2000);
            
            // Simulate profit
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
        const totalValue = this.positions.reduce((sum, pos) => {
            return sum + parseFloat(pos.amount.split(' ')[0]) * 2000; // Estimation ETH price
        }, 0);

        const dailyYield = totalValue * 0.002; // 0.2% daily estimation
        const avgAPR = this.positions.length > 0 ? 
            this.positions.reduce((sum, pos) => sum + parseFloat(pos.apr), 0) / this.positions.length : 0;

        // Update stats cards
        document.querySelector('.stat-card:nth-child(1) .stat-value').textContent = `$${totalValue.toFixed(2)}`;
        document.querySelector('.stat-card:nth-child(2) .stat-value').textContent = `$${dailyYield.toFixed(2)}`;
        document.querySelector('.stat-card:nth-child(3) .stat-value').textContent = `${avgAPR.toFixed(1)}%`;
        document.querySelector('.stat-card:nth-child(4) .stat-value').textContent = this.positions.length;
    }

    // ===== UTILITY FUNCTIONS =====
    showLoadingModal(message) {
        const modal = document.getElementById('loadingModal');
        const messageElement = modal.querySelector('p');
        messageElement.textContent = message;
        modal.classList.add('active');
    }

    hideLoadingModal() {
        document.getElementById('loadingModal').classList.remove('active');
    }

    async simulateTransaction(delay) {
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    closePosition(positionId) {
        if (confirm('Êtes-vous sûr de vouloir fermer cette position?')) {
            this.positions = this.positions.filter(pos => pos.id !== positionId);
            this.updatePositionsTable();
            this.updateDashboardStats();
        }
    }

    loadUserPositions() {
        // Simulate loading user positions from blockchain
        console.log('Loading user positions...');
    }

    startRealTimeUpdates() {
        // Update metrics every 30 seconds
        setInterval(() => {
            this.updateStrategyMetrics();
            this.generateArbitrageOpportunities();
        }, 30000);
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
        // Simulate real-time arbitrage opportunities
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
                        <span class="profit-amount">+${opp.profit}</span>
                        <span class="profit-percentage">${opp.percentage}%</span>
                    </div>
                    <button class="execute-btn" onclick="app.executeFlashLoan('${opp.pair}')">
                        Exécuter
                    </button>
                </div>
            `).join('');
        }
    }

    // ===== NETWORK MANAGEMENT =====
    async switchNetwork(networkName) {
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
                console.log(`Switched to ${networkName}`);
            }
        } catch (error) {
            console.error('Network switch error:', error);
        }
    }

    // ===== EVENT LISTENERS SETUP =====
    setupEventListeners() {
        // Wallet connection
        document.getElementById('connectWallet').addEventListener('click', () => {
            this.connectWallet();
        });

        // Network selection
        document.getElementById('networkSelect').addEventListener('change', (e) => {
            this.switchNetwork(e.target.value);
        });

        // Strategy tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const strategy = e.currentTarget.dataset.strategy;
                this.switchStrategy(strategy);
            });
        });

        // Range selector buttons
        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.updateUniswapMetrics();
            });
        });

        // Input changes for real-time updates
        document.getElementById('ethAmount')?.addEventListener('input', () => {
            this.updateUniswapMetrics();
        });

        document.getElementById('collateralAmount')?.addEventListener('input', () => {
            this.updateAaveMetrics();
        });

        document.getElementById('leverageRange')?.addEventListener('input', () => {
            this.updateAaveMetrics();
        });

        // Strategy deployment buttons
        document.querySelector('#uniswap-strategy .strategy-btn')?.addEventListener('click', () => {
            this.deployUniswapStrategy();
        });

        document.querySelector('#aave-strategy .strategy-btn')?.addEventListener('click', () => {
            this.deployAaveStrategy();
        });

        document.querySelector('#flashloan-strategy .strategy-btn')?.addEventListener('click', () => {
            const flashAmount = document.getElementById('flashAmount').value;
            if (flashAmount && flashAmount > 0) {
                this.executeFlashLoan('manual');
            } else {
                alert('Veuillez entrer un montant valide pour le Flash Loan');
            }
        });

        // Pool selection change
        document.getElementById('poolSelect')?.addEventListener('change', () => {
            this.updateUniswapMetrics();
        });

        // Modal close on outside click
        document.getElementById('loadingModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideLoadingModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideLoadingModal();
            }
        });

        // Window events
        window.addEventListener('load', () => {
            this.checkWalletConnection();
        });

        // Wallet events
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.walletConnected = false;
                    this.currentAccount = null;
                    this.updateWalletUI();
                } else {
                    this.currentAccount = accounts[0];
                    this.updateWalletUI();
                }
            });

            window.ethereum.on('chainChanged', (chainId) => {
                window.location.reload();
            });
        }
    }

    async checkWalletConnection() {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({
                    method: 'eth_accounts'
                });
                
                if (accounts.length > 0) {
                    this.currentAccount = accounts[0];
                    this.walletConnected = true;
                    this.updateWalletUI();
                    this.loadUserPositions();
                }
            } catch (error) {
                console.error('Error checking wallet connection:', error);
            }
        }
    }

    // ===== ANIMATION HELPERS =====
    animateNumber(element, start, end, duration = 1000) {
        const startTime = performance.now();
        const difference = end - start;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = start + (difference * this.easeOutCubic(progress));
            element.textContent = current.toFixed(2);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    // ===== DATA PERSISTENCE =====
    saveToLocalStorage() {
        const data = {
            positions: this.positions,
            currentNetwork: this.currentNetwork,
            lastUpdate: Date.now()
        };
        localStorage.setItem('yieldmax_data', JSON.stringify(data));
    }

    loadFromLocalStorage() {
        try {
            const data = JSON.parse(localStorage.getItem('yieldmax_data'));
            if (data) {
                this.positions = data.positions || [];
                this.currentNetwork = data.currentNetwork || 'ethereum';
                this.updatePositionsTable();
                this.updateDashboardStats();
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }

    // ===== API HELPERS =====
    async fetchPoolData(poolAddress) {
        // Simulate API call to fetch real pool data
        try {
            // In real implementation, this would call Uniswap subgraph or similar
            const mockData = {
                tvl: Math.random() * 10000000,
                volume24h: Math.random() * 1000000,
                feeTier: 0.3,
                token0Price: Math.random() * 3000,
                token1Price: 1
            };
            
            return mockData;
        } catch (error) {
            console.error('Error fetching pool data:', error);
            return null;
        }
    }

    async fetchGasPrice() {
        // Simulate gas price fetch
        return {
            slow: 20,
            standard: 25,
            fast: 35
        };
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
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    // ===== INITIALIZATION =====
    updateUI() {
        this.loadFromLocalStorage();
        this.updateDashboardStats();
        this.generateArbitrageOpportunities();
    }
}

// ===== APP INITIALIZATION =====
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new YieldMaxApp();
    console.log('YieldMax App initialized');
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
        app.showNotification('Copié dans le presse-papier!', 'success');
    }).catch(() => {
        app.showNotification('Erreur lors de la copie', 'error');
    });
}console.log('✅ Classe YieldMaxApp définie');
} catch (error) {
    console.error('❌ Erreur dans app.js:', error);
}

console.log('🏁 FIN app.js');


// ===== ERROR HANDLING =====
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    app?.showNotification('Une erreur est survenue', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    app?.showNotification('Erreur de connexion', 'error');
});

// ===== PERFORMANCE MONITORING =====
if ('performance' in window) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const perfData = performance.timing;
            const loadTime = perfData.loadEventEnd - perfData.navigationStart;
            console.log(`Page load time: ${loadTime}ms`);
        }, 0);
    });
}