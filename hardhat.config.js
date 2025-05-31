// =============================================================================
// CONFIGURATION HARDHAT - SIMPLIFIÉE POUR POLYGON
// =============================================================================

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            viaIR: true
        }
    },
    networks: {
        hardhat: {
            // Pas de forking pour éviter les erreurs
        },
        polygon: {
            url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com/",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            gasPrice: 30000000000,
            confirmations: 3,
            chainId: 137
        }
    },
    etherscan: {
        apiKey: {
            polygon: process.env.POLYGONSCAN_API_KEY || "dummy"
        }
    }
};