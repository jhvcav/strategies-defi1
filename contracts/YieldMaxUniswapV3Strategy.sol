// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// Uniswap V3 Interfaces
interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function burn(uint256 tokenId) external payable;

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
}

interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    function tickSpacing() external view returns (int24);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/**
 * @title YieldMaxUniswapV3Strategy
 * @dev Smart contract pour gérer automatiquement les positions LP Uniswap V3
 */
contract YieldMaxUniswapV3Strategy is ReentrancyGuard, Ownable, IERC721Receiver {
    using SafeERC20 for IERC20;

    // ===== CONSTANTS =====
    address public constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619; // Polygon WETH
    address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174; // Polygon USDC
    
    INonfungiblePositionManager public immutable positionManager;
    ISwapRouter public immutable swapRouter;
    
    uint24 public constant DEFAULT_FEE = 3000; // 0.3%
    uint256 public constant MAX_SLIPPAGE = 500; // 5%
    uint256 public constant BASIS_POINTS = 10000;

    // ===== STRUCTS =====
    struct UserPosition {
        uint256 tokenId;
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 amount0Deposited;
        uint256 amount1Deposited;
        uint256 feesCollected0;
        uint256 feesCollected1;
        uint256 lastCollectionTime;
        bool active;
    }

    struct StrategyConfig {
        int24 tickSpacing;
        uint256 minAmount0;
        uint256 minAmount1;
        uint256 rebalanceThreshold; // En basis points
        bool autoRebalance;
        bool autoCompound;
    }

    // ===== STATE VARIABLES =====
    mapping(address => UserPosition[]) public userPositions;
    mapping(uint256 => address) public tokenIdToUser;
    mapping(address => StrategyConfig) public strategyConfigs;
    
    uint256 public totalPositions;
    uint256 public totalFeesCollected;
    uint256 public performanceFee = 1000; // 10%
    address public feeRecipient;

    // ===== EVENTS =====
    event PositionCreated(
        address indexed user,
        uint256 indexed tokenId,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        int24 tickLower,
        int24 tickUpper
    );

    event PositionClosed(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount0,
        uint256 amount1,
        uint256 fees0,
        uint256 fees1
    );

    event FeesCollected(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount0,
        uint256 amount1
    );

    event PositionRebalanced(
        address indexed user,
        uint256 oldTokenId,
        uint256 newTokenId,
        int24 newTickLower,
        int24 newTickUpper
    );

    event LiquidityIncreased(
        address indexed user,
        uint256 indexed tokenId,
        uint256 amount0,
        uint256 amount1,
        uint128 liquidityAdded
    );

    // ===== CONSTRUCTOR =====
    constructor(
        address _positionManager,
        address _swapRouter,
        address _feeRecipient
    ) {
        positionManager = INonfungiblePositionManager(_positionManager);
        swapRouter = ISwapRouter(_swapRouter);
        feeRecipient = _feeRecipient;
    }

    // ===== MAIN FUNCTIONS =====

    /**
     * @dev Créer une nouvelle position LP avec range personnalisé
     */
    function createPosition(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
    ) external payable nonReentrant returns (uint256 tokenId) {
        require(amount0Desired > 0 || amount1Desired > 0, "Invalid amounts");
        require(tickLower < tickUpper, "Invalid tick range");

        // Transfer tokens from user
        if (token0 != WETH && amount0Desired > 0) {
            IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0Desired);
            IERC20(token0).safeApprove(address(positionManager), amount0Desired);
        }
        
        if (token1 != WETH && amount1Desired > 0) {
            IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1Desired);
            IERC20(token1).safeApprove(address(positionManager), amount1Desired);
        }

        // Create mint parameters
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            recipient: address(this),
            deadline: block.timestamp + 300
        });

        // Mint position
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
        
        if (token0 == WETH || token1 == WETH) {
            (tokenId, liquidity, amount0, amount1) = positionManager.mint{value: msg.value}(params);
        } else {
            (tokenId, liquidity, amount0, amount1) = positionManager.mint(params);
        }

        // Store user position
        UserPosition memory newPosition = UserPosition({
            tokenId: tokenId,
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            amount0Deposited: amount0,
            amount1Deposited: amount1,
            feesCollected0: 0,
            feesCollected1: 0,
            lastCollectionTime: block.timestamp,
            active: true
        });

        userPositions[msg.sender].push(newPosition);
        tokenIdToUser[tokenId] = msg.sender;
        totalPositions++;

        // Refund excess tokens
        _refundExcess(token0, token1, amount0Desired, amount1Desired, amount0, amount1);

        emit PositionCreated(
            msg.sender,
            tokenId,
            token0,
            token1,
            amount0,
            amount1,
            tickLower,
            tickUpper
        );
    }

    /**
     * @dev Créer position avec range automatique basé sur volatilité
     */
    function createPositionAuto(
        address token0,
        address token1,
        uint24 fee,
        uint256 rangePercentage, // 500 = 5%
        uint256 amount0Desired,
        uint256 amount1Desired
    ) external payable returns (uint256 tokenId) {
        require(rangePercentage >= 100 && rangePercentage <= 5000, "Invalid range");

        // Get current price and calculate ticks
        address poolAddress = _getPoolAddress(token0, token1, fee);
        IUniswapV3Pool pool = IUniswapV3Pool(poolAddress);
        
        (, int24 currentTick,,,,,) = pool.slot0();
        int24 tickSpacing = pool.tickSpacing();
        
        // Calculate tick range based on percentage
        int24 tickRange = int24(int256(rangePercentage * 100)); // Approximation
        int24 tickLower = ((currentTick - tickRange) / tickSpacing) * tickSpacing;
        int24 tickUpper = ((currentTick + tickRange) / tickSpacing) * tickSpacing;

        // Calculate minimum amounts (95% slippage protection)
        uint256 amount0Min = (amount0Desired * 9500) / BASIS_POINTS;
        uint256 amount1Min = (amount1Desired * 9500) / BASIS_POINTS;

        return this.createPosition{value: msg.value}(
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min
        );
    }

    /**
     * @dev Augmenter la liquidité d'une position existante
     */
    function increaseLiquidity(
        uint256 tokenId,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) external payable nonReentrant returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        require(tokenIdToUser[tokenId] == msg.sender, "Not position owner");
        
        UserPosition storage position = _getUserPosition(msg.sender, tokenId);
        require(position.active, "Position not active");

        // Transfer tokens
        if (position.token0 != WETH && amount0Desired > 0) {
            IERC20(position.token0).safeTransferFrom(msg.sender, address(this), amount0Desired);
            IERC20(position.token0).safeApprove(address(positionManager), amount0Desired);
        }
        
        if (position.token1 != WETH && amount1Desired > 0) {
            IERC20(position.token1).safeTransferFrom(msg.sender, address(this), amount1Desired);
            IERC20(position.token1).safeApprove(address(positionManager), amount1Desired);
        }

        INonfungiblePositionManager.IncreaseLiquidityParams memory params = 
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: (amount0Desired * 9500) / BASIS_POINTS,
                amount1Min: (amount1Desired * 9500) / BASIS_POINTS,
                deadline: block.timestamp + 300
            });

        if (position.token0 == WETH || position.token1 == WETH) {
            (liquidity, amount0, amount1) = positionManager.increaseLiquidity{value: msg.value}(params);
        } else {
            (liquidity, amount0, amount1) = positionManager.increaseLiquidity(params);
        }

        // Update position data
        position.liquidity += liquidity;
        position.amount0Deposited += amount0;
        position.amount1Deposited += amount1;

        // Refund excess
        _refundExcess(position.token0, position.token1, amount0Desired, amount1Desired, amount0, amount1);

        emit LiquidityIncreased(msg.sender, tokenId, amount0, amount1, liquidity);
    }

    /**
     * @dev Collecter les fees d'une position
     */
    function collectFees(uint256 tokenId) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(tokenIdToUser[tokenId] == msg.sender, "Not position owner");
        
        UserPosition storage position = _getUserPosition(msg.sender, tokenId);
        require(position.active, "Position not active");

        INonfungiblePositionManager.CollectParams memory params = 
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (amount0, amount1) = positionManager.collect(params);

        if (amount0 > 0 || amount1 > 0) {
            // Take performance fee
            uint256 fee0 = (amount0 * performanceFee) / BASIS_POINTS;
            uint256 fee1 = (amount1 * performanceFee) / BASIS_POINTS;

            // Transfer fees to fee recipient
            if (fee0 > 0) {
                if (position.token0 == WETH) {
                    payable(feeRecipient).transfer(fee0);
                } else {
                    IERC20(position.token0).safeTransfer(feeRecipient, fee0);
                }
            }
            
            if (fee1 > 0) {
                if (position.token1 == WETH) {
                    payable(feeRecipient).transfer(fee1);
                } else {
                    IERC20(position.token1).safeTransfer(feeRecipient, fee1);
                }
            }

            // Transfer remaining to user
            uint256 userAmount0 = amount0 - fee0;
            uint256 userAmount1 = amount1 - fee1;

            if (userAmount0 > 0) {
                if (position.token0 == WETH) {
                    payable(msg.sender).transfer(userAmount0);
                } else {
                    IERC20(position.token0).safeTransfer(msg.sender, userAmount0);
                }
            }
            
            if (userAmount1 > 0) {
                if (position.token1 == WETH) {
                    payable(msg.sender).transfer(userAmount1);
                } else {
                    IERC20(position.token1).safeTransfer(msg.sender, userAmount1);
                }
            }

            // Update position data
            position.feesCollected0 += userAmount0;
            position.feesCollected1 += userAmount1;
            position.lastCollectionTime = block.timestamp;
            totalFeesCollected += userAmount0 + userAmount1;

            emit FeesCollected(msg.sender, tokenId, userAmount0, userAmount1);
        }
    }

    /**
     * @dev Fermer complètement une position
     */
    function closePosition(uint256 tokenId) external nonReentrant {
        require(tokenIdToUser[tokenId] == msg.sender, "Not position owner");
        
        UserPosition storage position = _getUserPosition(msg.sender, tokenId);
        require(position.active, "Position not active");

        // Collect any remaining fees
        this.collectFees(tokenId);

        // Remove all liquidity
        INonfungiblePositionManager.DecreaseLiquidityParams memory decreaseParams = 
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: position.liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 300
            });

        (uint256 amount0, uint256 amount1) = positionManager.decreaseLiquidity(decreaseParams);

        // Collect the withdrawn liquidity
        INonfungiblePositionManager.CollectParams memory collectParams = 
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        positionManager.collect(collectParams);

        // Burn the NFT
        positionManager.burn(tokenId);

        // Update state
        position.active = false;
        delete tokenIdToUser[tokenId];
        totalPositions--;

        emit PositionClosed(
            msg.sender,
            tokenId,
            amount0,
            amount1,
            position.feesCollected0,
            position.feesCollected1
        );
    }

// ===== REBALANCING FUNCTIONS =====

    /**
     * @dev Rebalancer automatiquement une position si elle sort du range
     */
    function rebalancePosition(
        uint256 tokenId,
        int24 newTickLower,
        int24 newTickUpper
    ) external nonReentrant returns (uint256 newTokenId) {
        require(tokenIdToUser[tokenId] == msg.sender, "Not position owner");
        
        UserPosition storage position = _getUserPosition(msg.sender, tokenId);
        require(position.active, "Position not active");

        // Vérifier si la position a besoin d'être rebalancée
        require(_needsRebalancing(tokenId), "Position doesn't need rebalancing");

        // Collecter les fees avant rebalancing
        this.collectFees(tokenId);

        // Fermer l'ancienne position
        INonfungiblePositionManager.DecreaseLiquidityParams memory decreaseParams = 
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: position.liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 300
            });

        (uint256 amount0, uint256 amount1) = positionManager.decreaseLiquidity(decreaseParams);

        // Collecter les tokens
        INonfungiblePositionManager.CollectParams memory collectParams = 
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        positionManager.collect(collectParams);
        positionManager.burn(tokenId);

        // Créer nouvelle position avec le nouveau range
        INonfungiblePositionManager.MintParams memory mintParams = INonfungiblePositionManager.MintParams({
            token0: position.token0,
            token1: position.token1,
            fee: position.fee,
            tickLower: newTickLower,
            tickUpper: newTickUpper,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: (amount0 * 9500) / BASIS_POINTS,
            amount1Min: (amount1 * 9500) / BASIS_POINTS,
            recipient: address(this),
            deadline: block.timestamp + 300
        });

        uint128 newLiquidity;
        uint256 newAmount0;
        uint256 newAmount1;
        
        (newTokenId, newLiquidity, newAmount0, newAmount1) = positionManager.mint(mintParams);

        // Mettre à jour la position
        position.tokenId = newTokenId;
        position.tickLower = newTickLower;
        position.tickUpper = newTickUpper;
        position.liquidity = newLiquidity;
        
        // Mettre à jour le mapping
        delete tokenIdToUser[tokenId];
        tokenIdToUser[newTokenId] = msg.sender;

        emit PositionRebalanced(msg.sender, tokenId, newTokenId, newTickLower, newTickUpper);
    }

    /**
     * @dev Auto-compound: réinvestir les fees dans la position
     */
    function autoCompound(uint256 tokenId) external nonReentrant {
        require(tokenIdToUser[tokenId] == msg.sender, "Not position owner");
        
        UserPosition storage position = _getUserPosition(msg.sender, tokenId);
        require(position.active, "Position not active");

        // Collecter les fees vers le contrat
        INonfungiblePositionManager.CollectParams memory params = 
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (uint256 amount0, uint256 amount1) = positionManager.collect(params);

        if (amount0 > 0 || amount1 > 0) {
            // Prendre les fees de performance
            uint256 fee0 = (amount0 * performanceFee) / BASIS_POINTS;
            uint256 fee1 = (amount1 * performanceFee) / BASIS_POINTS;

            // Envoyer les fees au destinataire
            if (fee0 > 0) {
                if (position.token0 == WETH) {
                    payable(feeRecipient).transfer(fee0);
                } else {
                    IERC20(position.token0).safeTransfer(feeRecipient, fee0);
                }
            }
            
            if (fee1 > 0) {
                if (position.token1 == WETH) {
                    payable(feeRecipient).transfer(fee1);
                } else {
                    IERC20(position.token1).safeTransfer(feeRecipient, fee1);
                }
            }

            // Réinvestir le reste dans la position
            uint256 remainingAmount0 = amount0 - fee0;
            uint256 remainingAmount1 = amount1 - fee1;

            if (remainingAmount0 > 0 || remainingAmount1 > 0) {
                // Approuver les tokens
                if (position.token0 != WETH && remainingAmount0 > 0) {
                    IERC20(position.token0).safeApprove(address(positionManager), remainingAmount0);
                }
                
                if (position.token1 != WETH && remainingAmount1 > 0) {
                    IERC20(position.token1).safeApprove(address(positionManager), remainingAmount1);
                }

                // Augmenter la liquidité
                INonfungiblePositionManager.IncreaseLiquidityParams memory increaseParams = 
                    INonfungiblePositionManager.IncreaseLiquidityParams({
                        tokenId: tokenId,
                        amount0Desired: remainingAmount0,
                        amount1Desired: remainingAmount1,
                        amount0Min: 0,
                        amount1Min: 0,
                        deadline: block.timestamp + 300
                    });

                (uint128 liquidityAdded,,) = positionManager.increaseLiquidity(increaseParams);
                position.liquidity += liquidityAdded;
            }
        }
    }

    // ===== VIEW FUNCTIONS =====

    /**
     * @dev Obtenir les informations d'une position
     */
    function getPositionInfo(address user, uint256 index) 
        external 
        view 
        returns (UserPosition memory) 
    {
        require(index < userPositions[user].length, "Invalid index");
        return userPositions[user][index];
    }

    /**
     * @dev Obtenir toutes les positions d'un utilisateur
     */
    function getUserPositions(address user) 
        external 
        view 
        returns (UserPosition[] memory) 
    {
        return userPositions[user];
    }

    /**
     * @dev Calculer les fees actuels non collectés
     */
    function getUnclaimedFees(uint256 tokenId) 
        external 
        view 
        returns (uint256 amount0, uint256 amount1) 
    {
        (,,,,,,,,,, uint128 tokensOwed0, uint128 tokensOwed1) = positionManager.positions(tokenId);
        return (uint256(tokensOwed0), uint256(tokensOwed1));
    }

    /**
     * @dev Vérifier si une position a besoin d'être rebalancée
     */
    function needsRebalancing(uint256 tokenId) external view returns (bool) {
        return _needsRebalancing(tokenId);
    }

    /**
     * @dev Calculer l'APR estimé d'une position
     */
    function calculateAPR(uint256 tokenId) external view returns (uint256 apr) {
        UserPosition memory position = _getUserPositionByTokenId(tokenId);
        if (!position.active) return 0;

        uint256 timeElapsed = block.timestamp - position.lastCollectionTime;
        if (timeElapsed == 0) return 0;

        uint256 totalFees = position.feesCollected0 + position.feesCollected1;
        uint256 totalDeposited = position.amount0Deposited + position.amount1Deposited;
        
        if (totalDeposited == 0) return 0;

        // APR = (fees / deposited) * (seconds in year / time elapsed) * 100
        apr = (totalFees * 365 days * BASIS_POINTS) / (totalDeposited * timeElapsed);
    }

    /**
     * @dev Estimer les rewards pour une nouvelle position
     */
    function estimateRewards(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1  
    ) external view returns (uint256 estimatedDailyFees, uint256 estimatedAPR) {
        
        // Estimation basique: 0.1% des dépôts par jour
        uint256 totalDeposit = amount0 + amount1;
        estimatedDailyFees = (totalDeposit * 10) / BASIS_POINTS;
        estimatedAPR = (estimatedDailyFees * 365 * BASIS_POINTS) / totalDeposit;
    }

    // ===== HELPER FUNCTIONS =====

    function _getUserPosition(address user, uint256 tokenId) 
        internal 
        view 
        returns (UserPosition storage) 
    {
        UserPosition[] storage positions = userPositions[user];
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].tokenId == tokenId && positions[i].active) {
                return positions[i];
            }
        }
        revert("Position not found");
    }

    function _getUserPositionByTokenId(uint256 tokenId) 
        internal 
        view 
        returns (UserPosition memory) 
    {
        address user = tokenIdToUser[tokenId];
        require(user != address(0), "Token ID not found");
        return _getUserPosition(user, tokenId);
    }

    function _needsRebalancing(uint256 tokenId) internal view returns (bool) {
        address poolAddress = _getPoolAddress(
            _getUserPositionByTokenId(tokenId).token0,
            _getUserPositionByTokenId(tokenId).token1,
            _getUserPositionByTokenId(tokenId).fee
        );
        
        IUniswapV3Pool pool = IUniswapV3Pool(poolAddress);
        (, int24 currentTick,,,,,) = pool.slot0();
        
        UserPosition memory position = _getUserPositionByTokenId(tokenId);
        
        // Position needs rebalancing if current tick is outside the range
        return currentTick < position.tickLower || currentTick > position.tickUpper;
    }

    function _getPoolAddress(address token0, address token1, uint24 fee) 
        internal 
        pure 
        returns (address) 
    {
        // Simplified - in real implementation, use Uniswap V3 Factory
        return address(0); // Placeholder
    }

    function _refundExcess(
        address token0,
        address token1,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Used,
        uint256 amount1Used
    ) internal {
        if (amount0Desired > amount0Used) {
            uint256 refund0 = amount0Desired - amount0Used;
            if (token0 == WETH) {
                payable(msg.sender).transfer(refund0);
            } else {
                IERC20(token0).safeTransfer(msg.sender, refund0);
            }
        }
        
        if (amount1Desired > amount1Used) {
            uint256 refund1 = amount1Desired - amount1Used;
            if (token1 == WETH) {
                payable(msg.sender).transfer(refund1);
            } else {
                IERC20(token1).safeTransfer(msg.sender, refund1);
            }
        }
    }

    // ===== ADMIN FUNCTIONS =====

    /**
     * @dev Modifier les fees de performance (only owner)
     */
    function setPerformanceFee(uint256 _performanceFee) external onlyOwner {
        require(_performanceFee <= 2000, "Fee too high"); // Max 20%
        performanceFee = _performanceFee;
    }

    /**
     * @dev Modifier le destinataire des fees (only owner)
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid address");
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Fonction d'urgence pour récupérer des tokens bloqués
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    /**
     * @dev Pause/unpause le contrat en cas d'urgence
     */
    bool public paused = false;
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    // ===== AUTOMATION FUNCTIONS =====

    /**
     * @dev Fonction appelée par Chainlink Automation pour auto-compound
     */
    function checkUpkeep(bytes calldata) 
        external 
        view 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        // Vérifier s'il y a des positions qui ont besoin d'auto-compound
        for (uint256 i = 1; i <= totalPositions; i++) {
            address user = tokenIdToUser[i];
            if (user != address(0)) {
                (uint256 fees0, uint256 fees1) = this.getUnclaimedFees(i);
                if (fees0 > 0 || fees1 > 0) {
                    upkeepNeeded = true;
                    performData = abi.encode(i);
                    break;
                }
            }
        }
    }

    /**
     * @dev Exécuter l'auto-compound via Chainlink Automation
     */
    function performUpkeep(bytes calldata performData) external {
        uint256 tokenId = abi.decode(performData, (uint256));
        
        // Vérifier que la position a des fees à collecter
        (uint256 fees0, uint256 fees1) = this.getUnclaimedFees(tokenId);
        require(fees0 > 0 || fees1 > 0, "No fees to compound");
        
        // Auto-compound la position
        this.autoCompound(tokenId);
    }

    // ===== BATCH OPERATIONS =====

    /**
     * @dev Collecter les fees de plusieurs positions en une transaction
     */
    function batchCollectFees(uint256[] calldata tokenIds) external nonReentrant {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (tokenIdToUser[tokenIds[i]] == msg.sender) {
                this.collectFees(tokenIds[i]);
            }
        }
    }

    /**
     * @dev Auto-compound plusieurs positions en une transaction
     */
    function batchAutoCompound(uint256[] calldata tokenIds) external nonReentrant {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (tokenIdToUser[tokenIds[i]] == msg.sender) {
                this.autoCompound(tokenIds[i]);
            }
        }
    }

    // ===== ANALYTICS FUNCTIONS =====

    /**
     * @dev Obtenir les statistiques globales du contrat
     */
    function getGlobalStats() 
        external 
        view 
        returns (
            uint256 totalActivePositions,
            uint256 totalValueLocked,
            uint256 totalFeesEarned,
            uint256 averageAPR
        ) 
    {
        totalActivePositions = totalPositions;
        totalFeesEarned = totalFeesCollected;
        
        // Calculs simplifiés pour l'exemple
        totalValueLocked = totalActivePositions * 1000; // Placeholder
        averageAPR = totalFeesEarned > 0 ? 5000 : 0; // 50% placeholder
    }

    /**
     * @dev Obtenir le rendement d'un utilisateur
     */
    function getUserStats(address user) 
    external 
    view 
    returns (
        uint256 userTotalPositions,
        uint256 totalDeposited,
        uint256 totalFeesEarned,
        uint256 totalCurrentValue
    ) {
    UserPosition[] memory positions = userPositions[user];
    
    for (uint256 i = 0; i < positions.length; i++) {
        if (positions[i].active) {
            userTotalPositions++;  // ← UTILISER la variable locale
            totalDeposited += positions[i].amount0Deposited + positions[i].amount1Deposited;
            totalFeesEarned += positions[i].feesCollected0 + positions[i].feesCollected1;
        }
    }
    
    totalCurrentValue = totalDeposited + totalFeesEarned;
}

    // ===== SLIPPAGE PROTECTION =====

    /**
     * @dev Calculer le slippage minimum pour une opération
     */
    function calculateMinAmounts(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 slippageToleranceNumerator,
        uint256 slippageToleranceDenominator
    ) external pure returns (uint256 amount0Min, uint256 amount1Min) {
        amount0Min = (amount0Desired * slippageToleranceNumerator) / slippageToleranceDenominator;
        amount1Min = (amount1Desired * slippageToleranceNumerator) / slippageToleranceDenominator;
    }

    // ===== REQUIRED OVERRIDES =====

    /**
     * @dev Handler pour recevoir les NFTs Uniswap V3
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * @dev Fonction pour recevoir ETH
     */
    receive() external payable {}

    /**
     * @dev Fallback function
     */
    fallback() external payable {}

    // ===== EVENTS ADDITIONNELS =====
    event AutoCompoundExecuted(address indexed user, uint256 indexed tokenId, uint256 feesReinvested);
    event StrategyConfigUpdated(address indexed user, StrategyConfig config);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event ContractPaused(bool paused);
    event PerformanceFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
}