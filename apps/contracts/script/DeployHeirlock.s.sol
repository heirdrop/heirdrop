// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/Heirlock.sol";

contract DeployHeirlock is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address identityVerificationHub = vm.envAddress("IDENTITY_VERIFICATION_HUB");
        string memory scopeSeed = vm.envString("SCOPE_SEED");

        // Log deployment parameters
        console.log("Deploying Heirlock contract...");
        console.log("Identity Verification Hub:", identityVerificationHub);
        console.log("Scope Seed:", scopeSeed);
        console.log("Deployer address:", vm.addr(deployerPrivateKey));

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Deploy the Heirlock contract
        Heirlock heirlock = new Heirlock(
            identityVerificationHub,
            scopeSeed
        );

        vm.stopBroadcast();

        // Log deployment result
        console.log("\n=== Deployment Successful ===");
        console.log("Heirlock contract deployed at:", address(heirlock));
        console.log("\nSave this address for your frontend!");
    }
}

