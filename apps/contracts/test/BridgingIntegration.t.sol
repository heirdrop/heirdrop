// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/HeirlockVault.sol";
import "../src/LayerZeroExecutor.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockBridgedERC20 is ERC20 {
  constructor(string memory name, string memory symbol) ERC20(name, symbol) {
    _mint(msg.sender, 1_000_000 * 10**18);
  }
}

contract BridgingIntegrationTest is Test {
  HeirlockVault public vault;
  LayerZeroExecutor public executor;
  MockBridgedERC20 public arbToken;

  address public owner = makeAddr("Owner");
  address payable public beneficiary = payable(makeAddr("Beneficiary"));

  bytes32 internal constant NATIVE_DEPOSIT_ID = keccak256("native-deposit");
  bytes32 internal constant TOKEN_DEPOSIT_ID = keccak256("token-deposit");
  bytes32 internal constant NATIVE_RELEASE_ID = keccak256("native-release");
  bytes32 internal constant TOKEN_RELEASE_ID = keccak256("token-release");

  function setUp() public {
    vm.deal(address(this), 1_000 ether);

    vault = new HeirlockVault(owner, address(0));
    executor = new LayerZeroExecutor(address(vault));
    vault.setExecutor(address(executor));

    arbToken = new MockBridgedERC20("Mock Arbitrum Token", "mARB");
  }

  function test_MockBridgingLayerFlow() public {
    uint256 celoAmount = 12 ether;
    executor.fulfillNativeDeposit{value: celoAmount}(NATIVE_DEPOSIT_ID, owner);

    assertEq(vault.balanceOf(owner, address(0)), celoAmount, "Native balance not credited");

    uint256 arbAmount = 2_500 * 10**18;
    arbToken.approve(address(executor), arbAmount);
    executor.fulfillTokenDeposit(TOKEN_DEPOSIT_ID, owner, address(arbToken), arbAmount);

    assertEq(
      vault.balanceOf(owner, address(arbToken)),
      arbAmount,
      "ERC20 balance not credited"
    );

    uint256 celoRelease = 5 ether;
    executor.executeRemoteRelease(NATIVE_RELEASE_ID, owner, address(0), beneficiary, celoRelease);

    assertEq(beneficiary.balance, celoRelease, "Beneficiary did not receive native assets");
    assertEq(
      vault.balanceOf(owner, address(0)),
      celoAmount - celoRelease,
      "Native balance not debited"
    );

    uint256 arbRelease = 1_000 * 10**18;
    executor.executeRemoteRelease(
      TOKEN_RELEASE_ID,
      owner,
      address(arbToken),
      beneficiary,
      arbRelease
    );

    assertEq(
      arbToken.balanceOf(beneficiary),
      arbRelease,
      "Beneficiary did not receive bridged ERC20"
    );
    assertEq(
      vault.balanceOf(owner, address(arbToken)),
      arbAmount - arbRelease,
      "ERC20 balance not debited"
    );
  }
}
