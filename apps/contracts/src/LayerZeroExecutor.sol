// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./HeirlockVault.sol";

/**
 * @title LayerZeroExecutor
 * @notice Minimal coordinator that simulates receiving LayerZero messages and instructs
 *         the vault to account for remote deposits or release funds to heirs.
 */
contract LayerZeroExecutor is Ownable {
  using SafeERC20 for IERC20;

  HeirlockVault public vault;

  event RemoteNativeDeposit(bytes32 indexed messageId, address indexed owner, uint256 amount);
  event RemoteTokenDeposit(bytes32 indexed messageId, address indexed owner, address indexed token, uint256 amount);
  event RemoteRelease(bytes32 indexed messageId, address indexed owner, address indexed asset, address to, uint256 amount);
  event VaultUpdated(address indexed newVault);

  error InvalidAddress();

  constructor(address _vault) Ownable(msg.sender) {
    if (_vault == address(0)) revert InvalidAddress();
    vault = HeirlockVault(_vault);
    emit VaultUpdated(_vault);
  }

  function setVault(address _vault) external onlyOwner {
    if (_vault == address(0)) revert InvalidAddress();
    vault = HeirlockVault(_vault);
    emit VaultUpdated(_vault);
  }

  /// @notice Simulate consumption of a LayerZero message that bridges native assets into the vault.
  function fulfillNativeDeposit(bytes32 messageId, address owner) external payable onlyOwner {
    vault.bridgeNative{value: msg.value}(owner);
    emit RemoteNativeDeposit(messageId, owner, msg.value);
  }

  /// @notice Simulate consumption of a LayerZero message that bridges ERC-20 assets into the vault.
  function fulfillTokenDeposit(
    bytes32 messageId,
    address owner,
    address token,
    uint256 amount
  ) external onlyOwner {
    IERC20(token).safeTransferFrom(msg.sender, address(vault), amount);
    vault.bridgeToken(owner, token, amount);
    emit RemoteTokenDeposit(messageId, owner, token, amount);
  }

  /// @notice Executes a release instruction that originated from the Heirlock contract on another chain.
  function executeRemoteRelease(
    bytes32 messageId,
    address owner,
    address asset,
    address payable to,
    uint256 amount
  ) external onlyOwner {
    vault.release(owner, asset, to, amount);
    emit RemoteRelease(messageId, owner, asset, to, amount);
  }
}
