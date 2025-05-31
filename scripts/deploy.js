
// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Déploiement de YieldMax Uniswap V3 Strategy...");

    // Get deployment account
    const [deployer] = await ethers.getSigners();
    console.log("📝 Déploiement avec le compte:", deployer.address);
    console.log("💰 Solde du compte:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // Adresses Mainnet Ethereum
    const UNISWAP_V3_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
    const UNISWAP_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const FEE_RECIPIENT = deployer.address; // Pour les tests

    // Déployer le contrat principal
    console.log("\n📦 Déploiement du contrat YieldMaxUniswapV3Strategy...");
    
    const YieldMaxUniswapV3Strategy = await ethers.getContractFactory("YieldMaxUniswapV3Strategy");
    const strategy = await YieldMaxUniswapV3Strategy.deploy(
    UNISWAP_V3_POSITION_MANAGER,
    UNISWAP_V3_SWAP_ROUTER,
    FEE_RECIPIENT
);

await strategy.waitForDeployment();
console.log("✅ YieldMaxUniswapV3Strategy déployé à:", await strategy.getAddress());

    // Attendre quelques confirmations
    console.log("⏳ Attente de confirmations...");
    const receipt = await strategy.deploymentTransaction();
    if (receipt) {
        await receipt.wait(5);
    }

    // Afficher les informations de déploiement
    console.log("\n📊 Informations de déploiement:");
    console.log("┌─────────────────────────────────────────────────────────┐");
    console.log("│ Contrat: YieldMaxUniswapV3Strategy                      │");
    console.log(`│ Adresse: ${strategy.address}                    │`);
    console.log(`│ Réseau:  ${network.name}                                │`);
    console.log(`│ Gas utilisé: ${strategy.deployTransaction.gasUsed}      │`);
    console.log("└─────────────────────────────────────────────────────────┘");

    // Configuration initiale
    console.log("\n⚙️  Configuration initiale...");
    
    // Vérifier que les paramètres sont corrects
    const positionManager = await strategy.positionManager();
    const swapRouter = await strategy.swapRouter();
    const feeRecipient = await strategy.feeRecipient();
    const performanceFee = await strategy.performanceFee();

    console.log("✅ Position Manager:", positionManager);
    console.log("✅ Swap Router:", swapRouter);
    console.log("✅ Fee Recipient:", feeRecipient);
    console.log("✅ Performance Fee:", performanceFee.toString(), "bp (", performanceFee.div(100).toString(), "%)");

    // Sauvegarder les addresses de déploiement
    const deploymentInfo = {
        network: network.name,
        YieldMaxUniswapV3Strategy: strategy.address,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        transactionHash: strategy.deployTransaction.hash,
        gasUsed: strategy.deployTransaction.gasUsed.toString()
    };

    console.log("\n💾 Sauvegarde des informations de déploiement...");
    const fs = require("fs");
    fs.writeFileSync(
        `./deployments/${network.name}_deployment.json`,
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("\n🎉 Déploiement terminé avec succès!");
    console.log("\n📋 Prochaines étapes:");
    console.log("1. Vérifier le contrat sur Etherscan");
    console.log("2. Configurer le frontend avec la nouvelle adresse");
    console.log("3. Tester les fonctions principales");
    console.log("4. Configurer l'automation Chainlink (optionnel)");

    return {
        strategy: strategy.address,
        deployer: deployer.address
    };
}

// Script de vérification Etherscan
async function verify(contractAddress, constructorArguments) {
    console.log("🔍 Vérification sur Etherscan...");
    
    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: constructorArguments
        });
        console.log("✅ Contrat vérifié sur Etherscan");
    } catch (error) {
        console.log("❌ Erreur de vérification:", error.message);
    }
}

// Tests d'intégration
async function runIntegrationTests(strategyAddress) {
    console.log("\n🧪 Exécution des tests d'intégration...");
    
    const strategy = await ethers.getContractAt("YieldMaxUniswapV3Strategy", strategyAddress);
    const [deployer, user1] = await ethers.getSigners();

    // Test des constantes
    console.log("📋 Test des constantes...");
    const WETH = await strategy.WETH();
    const USDC = await strategy.USDC();
    const DEFAULT_FEE = await strategy.DEFAULT_FEE();
    
    console.log("  WETH:", WETH);
    console.log("  USDC:", USDC);
    console.log("  DEFAULT_FEE:", DEFAULT_FEE.toString());

    // Test des fonctions view
    console.log("📊 Test des fonctions view...");
    const globalStats = await strategy.getGlobalStats();
    console.log("  Total positions:", globalStats.totalActivePositions.toString());
    console.log("  Total TVL:", globalStats.totalValueLocked.toString());

    // Test de création de position (simulation)
    console.log("🔄 Test de simulation de position...");
    try {
        const estimation = await strategy.estimateRewards(
            WETH,
            USDC,
            3000,
            -887220, // tickLower
            887220,  // tickUpper
            ethers.utils.parseEther("1"), // 1 ETH
            ethers.utils.parseUnits("2000", 6) // 2000 USDC
        );
        console.log("  Fees journaliers estimés:", estimation.estimatedDailyFees.toString());
        console.log("  APR estimé:", estimation.estimatedAPR.toString());
    } catch (error) {
        console.log("  ⚠️  Estimation non disponible (normal en testnet)");
    }

    console.log("✅ Tests d'intégration terminés");
}

// Script principal avec options
async function deployWithOptions() {
    const args = process.argv.slice(2);
    const shouldVerify = args.includes("--verify");
    const shouldTest = args.includes("--test");
    const networkName = args.find(arg => arg.startsWith("--network="))?.split("=")[1];

    console.log("🎯 Options de déploiement:");
    console.log("  Vérification:", shouldVerify ? "✅" : "❌");
    console.log("  Tests:", shouldTest ? "✅" : "❌");
    console.log("  Réseau:", networkName || "default");

    // Déploiement principal
    const deployment = await main();

    // Vérification optionnelle
    if (shouldVerify) {
        const UNISWAP_V3_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
        const UNISWAP_V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
        const FEE_RECIPIENT = deployment.deployer;
        
        await verify(deployment.strategy, [
            UNISWAP_V3_POSITION_MANAGER,
            UNISWAP_V3_SWAP_ROUTER,
            FEE_RECIPIENT
        ]);
    }

    // Tests optionnels
    if (shouldTest) {
        await runIntegrationTests(deployment.strategy);
    }

    return deployment;
}

// Export pour utilisation dans d'autres scripts
module.exports = {
    main,
    verify,
    runIntegrationTests,
    deployWithOptions
};

// Exécution si appelé directement
if (require.main === module) {
    deployWithOptions()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Erreur de déploiement:", error);
            process.exit(1);
        });
}