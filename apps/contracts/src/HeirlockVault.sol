// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HeirlockVault
 * @notice Custody contract that escrows assets on a given chain and releases them
 *         when instructed by the main Heirlock contract or a LayerZero executor.
 */
contract HeirlockVault is Ownable {
  using SafeERC20 for IERC20;

  address public heirlock;
  address public executor;

  // owner => asset => balance
  mapping(address => mapping(address => uint256)) private balances;

  event HeirlockSet(address indexed heirlock);
  event ExecutorSet(address indexed executor);
  event Deposited(address indexed owner, address indexed asset, uint256 amount, address indexed sender);
  event Released(address indexed owner, address indexed asset, address indexed to, uint256 amount);

  error InvalidAddress();
  error InvalidAmount();
  error NotController();
  error InsufficientBalance();

  modifier onlyController() {
    if (msg.sender != heirlock && msg.sender != executor) {
      revert NotController();
    }
    _;
  }

  constructor(address _heirlock, address _executor) Ownable(msg.sender) {
    if (_heirlock == address(0)) revert InvalidAddress();
    heirlock = _heirlock;
    executor = _executor;
    emit HeirlockSet(_heirlock);
    if (_executor != address(0)) {
      emit ExecutorSet(_executor);
    }
  }

  function setHeirlock(address _heirlock) external onlyOwner {
    if (_heirlock == address(0)) revert InvalidAddress();
    heirlock = _heirlock;
    emit HeirlockSet(_heirlock);
  }

  function setExecutor(address _executor) external onlyOwner {
    if (_executor == address(0)) revert InvalidAddress();
    executor = _executor;
    emit ExecutorSet(_executor);
  }

  function balanceOf(address owner, address asset) external view returns (uint256) {
    return balances[owner][asset];
  }

  function depositNative(address owner) external payable {
    if (owner == address(0)) revert InvalidAddress();
    if (msg.value == 0) revert InvalidAmount();
    _credit(owner, address(0), msg.value);
  }

  function depositToken(address owner, address token, uint256 amount) external {
    if (owner == address(0) || token == address(0)) revert InvalidAddress();
    if (amount == 0) revert InvalidAmount();
    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    _credit(owner, token, amount);
  }

  function bridgeNative(address owner) external payable onlyController {
    if (owner == address(0)) revert InvalidAddress();
    if (msg.value == 0) revert InvalidAmount();
    _credit(owner, address(0), msg.value);
  }

  function bridgeToken(address owner, address token, uint256 amount) external onlyController {
    if (owner == address(0) || token == address(0)) revert InvalidAddress();
    if (amount == 0) revert InvalidAmount();
    _credit(owner, token, amount);
  }

  function release(address owner, address asset, address payable to, uint256 amount) external onlyController {
    if (owner == address(0) || to == address(0)) revert InvalidAddress();
    if (amount == 0) revert InvalidAmount();
    uint256 stored = balances[owner][asset];
    if (stored < amount) revert InsufficientBalance();
    balances[owner][asset] = stored - amount;

    if (asset == address(0)) {
      (bool success, ) = to.call{value: amount}("");
      require(success, "Native transfer failed");
    } else {
      IERC20(asset).safeTransfer(to, amount);
    }

    emit Released(owner, asset, to, amount);
  }

  function _credit(address owner, address asset, uint256 amount) internal {
    balances[owner][asset] += amount;
    emit Deposited(owner, asset, amount, msg.sender);
  }
}
