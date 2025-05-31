// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IYieldMaxUniswapV3Strategy
 * @dev Interface pour la stratégie Uniswap V3
 */
interface IYieldMaxUniswapV3Strategy {
    
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
        uint256 rebalanceThreshold;
        bool autoRebalance;
        bool autoCompound;
    }

    struct PositionStats {
        uint256 currentValue;
        uint256 totalFeesEarned;
        uint256 apr;
        bool inRange;
        uint256 daysActive;
    }

    struct GlobalStats {
        uint256 totalActivePositions;
        uint256 totalValueLocked;
        uint256 totalFeesEarned;
        uint256 averageAPR;
    }

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

    event AutoCompoundExecuted(
        address indexed user, 
        uint256 indexed tokenId, 
        uint256 feesReinvested
    );

    // ===== MAIN FUNCTIONS =====
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
    ) external payable returns (uint256 tokenId);

    function createPositionAuto(
        address token0,
        address token1,
        uint24 fee,
        uint256 rangePercentage,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) external payable returns (uint256 tokenId);

    function increaseLiquidity(
        uint256 tokenId,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    function collectFees(uint256 tokenId) external returns (uint256 amount0, uint256 amount1);

    function closePosition(uint256 tokenId) external;

    function rebalancePosition(
        uint256 tokenId,
        int24 newTickLower,
        int24 newTickUpper
    ) external returns (uint256 newTokenId);

    function autoCompound(uint256 tokenId) external;

    // ===== VIEW FUNCTIONS =====
    function getPositionInfo(address user, uint256 index) external view returns (UserPosition memory);
    
    function getUserPositions(address user) external view returns (UserPosition[] memory);
    
    function getUnclaimedFees(uint256 tokenId) external view returns (uint256 amount0, uint256 amount1);
    
    function needsRebalancing(uint256 tokenId) external view returns (bool);
    
    function calculateAPR(uint256 tokenId) external view returns (uint256 apr);
    
    function estimateRewards(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1
    ) external view returns (uint256 estimatedDailyFees, uint256 estimatedAPR);

    // ===== BATCH OPERATIONS =====
    function batchCollectFees(uint256[] calldata tokenIds) external;
    
    function batchAutoCompound(uint256[] calldata tokenIds) external;

    // ===== ANALYTICS =====
    function getGlobalStats() external view returns (GlobalStats memory);
    
    function getUserStats(address user) external view returns (
        uint256 totalPositions,
        uint256 totalDeposited,
        uint256 totalFeesEarned,
        uint256 totalCurrentValue
    );
}

