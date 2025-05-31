// =============================================================================
// SCRIPT DE TEST UNITAIRE
// =============================================================================

// test/YieldMaxUniswapV3Strategy.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("YieldMaxUniswapV3Strategy", function () {
    let strategy;
    let owner, user1, user2, feeRecipient;
    let mockPositionManager, mockSwapRouter;

    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const USDC = "0xA0b86a33E6441E6CbB80f0ACF6e37B2A5d85e6F";

    beforeEach(async function () {
        [owner, user1, user2, feeRecipient] = await ethers.getSigners();

        // Deploy mocks pour les tests
        const MockPositionManager = await ethers.getContractFactory("MockNonfungiblePositionManager");
        mockPositionManager = await MockPositionManager.deploy();

        const MockSwapRouter = await ethers.getContractFactory("MockSwapRouter");
        mockSwapRouter = await MockSwapRouter.deploy();

        // Deploy strategy
        const YieldMaxUniswapV3Strategy = await ethers.getContractFactory("YieldMaxUniswapV3Strategy");
        strategy = await YieldMaxUniswapV3Strategy.deploy(
            mockPositionManager.address,
            mockSwapRouter.address,
            feeRecipient.address
        );
    });

    describe("Déploiement", function () {
        it("Devrait se déployer avec les bonnes adresses", async function () {
            expect(await strategy.positionManager()).to.equal(mockPositionManager.address);
            expect(await strategy.swapRouter()).to.equal(mockSwapRouter.address);
            expect(await strategy.feeRecipient()).to.equal(feeRecipient.address);
        });

        it("Devrait avoir les bonnes constantes", async function () {
            expect(await strategy.WETH()).to.equal(WETH);
            expect(await strategy.USDC()).to.equal(USDC);
            expect(await strategy.DEFAULT_FEE()).to.equal(3000);
            expect(await strategy.performanceFee()).to.equal(1000); // 10%
        });

        it("Devrait initialiser l'owner correctement", async function () {
            expect(await strategy.owner()).to.equal(owner.address);
        });
    });

    describe("Configuration", function () {
        it("Devrait permettre de changer les fees de performance", async function () {
            await strategy.setPerformanceFee(1500); // 15%
            expect(await strategy.performanceFee()).to.equal(1500);
        });

        it("Ne devrait pas permettre des fees trop élevées", async function () {
            await expect(strategy.setPerformanceFee(2500)) // 25%
                .to.be.revertedWith("Fee too high");
        });

        it("Devrait permettre de changer le destinataire des fees", async function () {
            await strategy.setFeeRecipient(user1.address);
            expect(await strategy.feeRecipient()).to.equal(user1.address);
        });

        it("Ne devrait pas accepter l'adresse zéro comme destinataire", async function () {
            await expect(strategy.setFeeRecipient(ethers.constants.AddressZero))
                .to.be.revertedWith("Invalid address");
        });
    });

    describe("Gestion des positions", function () {
        it("Devrait retourner un tableau vide pour un nouvel utilisateur", async function () {
            const positions = await strategy.getUserPositions(user1.address);
            expect(positions.length).to.equal(0);
        });

        it("Devrait calculer correctement les montants minimums", async function () {
            const amount0Desired = ethers.utils.parseEther("1");
            const amount1Desired = ethers.utils.parseUnits("2000", 6);
            
            const [amount0Min, amount1Min] = await strategy.calculateMinAmounts(
                amount0Desired,
                amount1Desired,
                9500, // 95%
                10000
            );

            expect(amount0Min).to.equal(amount0Desired.mul(9500).div(10000));
            expect(amount1Min).to.equal(amount1Desired.mul(9500).div(10000));
        });
    });

    describe("Fonctions view", function () {
        it("Devrait retourner les statistiques globales", async function () {
            const stats = await strategy.getGlobalStats();
            expect(stats.totalActivePositions).to.equal(0);
            expect(stats.totalValueLocked).to.equal(0);
            expect(stats.totalFeesEarned).to.equal(0);
        });

        it("Devrait retourner les statistiques utilisateur", async function () {
            const [totalPositions, totalDeposited, totalFeesEarned, totalCurrentValue] = 
                await strategy.getUserStats(user1.address);
            
            expect(totalPositions).to.equal(0);
            expect(totalDeposited).to.equal(0);
            expect(totalFeesEarned).to.equal(0);
            expect(totalCurrentValue).to.equal(0);
        });
    });

    describe("Sécurité", function () {
        it("Seul l'owner peut modifier les paramètres", async function () {
            await expect(strategy.connect(user1).setPerformanceFee(1200))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Devrait supporter la pause d'urgence", async function () {
            await strategy.setPaused(true);
            expect(await strategy.paused()).to.be.true;
            
            await strategy.setPaused(false);
            expect(await strategy.paused()).to.be.false;
        });

        it("Devrait permettre le retrait d'urgence", async function () {
            // Send some ETH to contract first
            await owner.sendTransaction({
                to: strategy.address,
                value: ethers.utils.parseEther("1")
            });

            const balanceBefore = await owner.getBalance();
            await strategy.emergencyWithdraw(ethers.constants.AddressZero, ethers.utils.parseEther("1"));
            const balanceAfter = await owner.getBalance();

            expect(balanceAfter.gt(balanceBefore)).to.be.true;
        });
    });

    describe("ERC721 Support", function () {
        it("Devrait supporter la réception d'ERC721", async function () {
            const response = await strategy.onERC721Received(
                user1.address,
                user2.address,
                1,
                "0x"
            );
            
            expect(response).to.equal("0x150b7a02"); // ERC721_RECEIVED selector
        });
    });

    describe("Fonctions payable", function () {
        it("Devrait accepter l'ETH via receive", async function () {
            await expect(
                owner.sendTransaction({
                    to: strategy.address,
                    value: ethers.utils.parseEther("1")
                })
            ).to.not.be.reverted;
        });

        it("Devrait accepter l'ETH via fallback", async function () {
            await expect(
                owner.sendTransaction({
                    to: strategy.address,
                    value: ethers.utils.parseEther("1"),
                    data: "0x1234"
                })
            ).to.not.be.reverted;
        });
    });
});