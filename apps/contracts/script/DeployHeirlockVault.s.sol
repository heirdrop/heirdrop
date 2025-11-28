// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/HeirlockVault.sol";
import "../src/LayerZeroExecutor.sol";

contract DeployHeirlockVault is Script {
  function run() external {
    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    address heirlockAddress = vm.envAddress("HEIRLOCK_ADDRESS");

    console.log("Deploying HeirlockVault + LayerZeroExecutor");
    console.log("Heirlock:", heirlockAddress);
    console.log("Deployer:", vm.addr(deployerPrivateKey));

    vm.startBroadcast(deployerPrivateKey);

    HeirlockVault vault = new HeirlockVault(heirlockAddress, address(0));
    LayerZeroExecutor executor = new LayerZeroExecutor(address(vault));
    vault.setExecutor(address(executor));

    vm.stopBroadcast();

    console.log("Vault deployed at:", address(vault));
    console.log("LayerZeroExecutor deployed at:", address(executor));
  }
}
