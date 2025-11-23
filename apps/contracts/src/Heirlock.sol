// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Self.xyz imports
import {SelfVerificationRoot} from "@selfxyz/self/contracts/abstract/SelfVerificationRoot.sol";
import {ISelfVerificationRoot} from "@selfxyz/self/contracts/interfaces/ISelfVerificationRoot.sol";

contract Heirlock is SelfVerificationRoot, Ownable {

  // ============ TYPES ============

  enum ShareType { NONE, ABSOLUTE, BPS }

  enum BeneficiaryType { NONE, ADDRESS_ONLY, IDENTITY_VERIFIED }

  struct Share {
    ShareType shareType;
    uint256 shareAmount;
    bool claimed;
  }

  struct BeneficiaryIdentity {
    string firstName;
    string lastName;
    string dateOfBirth; // Format: "DD-MM-YY"
  }

  struct Will {
    address beneficiary; // Can be zero address for identity-verified beneficiaries
    BeneficiaryType beneficiaryType;
    BeneficiaryIdentity identity; // Only used if beneficiaryType == IDENTITY_VERIFIED
    address[] assets;
    mapping(address => Share) assetToShare; // asset address -> Share
    mapping(address => uint256) assetToIndex; // asset address -> index in assets array
    bool claimed; // Tracks if identity-verified beneficiary has claimed
    uint256 nullifier; // Stores nullifier after identity claim
  }

  struct OwnerConfig {
    uint256 livenessCheckDuration;
    uint256 lastCheckIn;
    mapping(address => Will) beneficiaryToWill; // beneficiary address -> Will (for ADDRESS_ONLY type)
    mapping(bytes32 => Will) identityToWill; // keccak256(firstName, lastName, dob) -> Will (for IDENTITY_VERIFIED type)
    address[] beneficiaries; // list of all address-based beneficiaries
    bytes32[] identityHashes; // list of all identity-based beneficiaries
    mapping(address => uint256) beneficiaryToIndex; // beneficiary -> index in beneficiaries array
    mapping(bytes32 => uint256) identityHashToIndex; // identity hash -> index in identityHashes array
    mapping(address => uint256) assetTotalAllocatedBps; // asset address -> total BPS allocated
    mapping(address => uint256) assetBalanceSnapshot; // asset address -> balance snapshot at first claim
    mapping(address => bool) assetSnapshotTaken; // asset address -> whether snapshot has been taken
  }

  // ============ STATE ============

  mapping(address => OwnerConfig) private ownerConfigs;

  // Self.xyz integration
  mapping(uint256 => bool) public nullifierUsed; // Prevents double claims with same identity

  // ============ ERRORS ============

  error InvalidDuration();
  error ArrayLengthMismatch();
  error NoApproval(address asset);
  error BpsExceeded(address asset, uint256 total);
  error NotConfigured();
  error OwnerStillAlive();
  error NotBeneficiary();
  error InvalidShareAmount();
  error TransferFailed(address asset);
  error InvalidBeneficiaryType();
  error IdentityAlreadyClaimed();
  error NullifierAlreadyUsed();
  error IdentityMismatch();
  error InvalidIdentityData();
  error SelfHubNotConfigured();

  // ============ EVENTS ============

  event LivenessConfigured(address indexed owner, uint256 duration, uint256 timestamp);
  event CheckIn(address indexed owner, uint256 timestamp);
  event WillCreated(address indexed owner, address indexed beneficiary);
  event IdentityWillCreated(address indexed owner, bytes32 indexed identityHash, string firstName, string lastName);
  event WillUpdated(address indexed owner, address indexed beneficiary);
  event IdentityWillUpdated(address indexed owner, bytes32 indexed identityHash);
  event AssetClaimed(address indexed owner, address indexed beneficiary, address indexed asset, uint256 amount);
  event AssetClaimFailed(address indexed owner, address indexed beneficiary, address indexed asset);
  event IdentityVerified(address indexed owner, bytes32 indexed identityHash, uint256 nullifier, address claimer);
  event BalanceSnapshotTaken(address indexed owner, address indexed asset, uint256 balance);

  // ============ CONSTRUCTOR ============

  constructor(
    address _selfVerificationHub, 
    string memory _scopeSeed
  ) 
  SelfVerificationRoot(_selfVerificationHub, _scopeSeed) 
  Ownable(msg.sender) 
  {}

  // ============ EXTERNAL FUNCTIONS ============

  function configureLiveness(uint256 _duration) external {
    if (_duration == 0) revert InvalidDuration();

    OwnerConfig storage config = ownerConfigs[msg.sender];
    config.livenessCheckDuration = _duration;
    config.lastCheckIn = block.timestamp;

    emit LivenessConfigured(msg.sender, _duration, block.timestamp);
  }

  function createWill(
    address _beneficiary,
    address[] calldata _assets,
    Share[] calldata _shares
  ) external {
    if (_beneficiary == address(0)) revert NotBeneficiary();
    if (_assets.length != _shares.length) revert ArrayLengthMismatch();

    OwnerConfig storage config = ownerConfigs[msg.sender];
    if (config.livenessCheckDuration == 0) revert NotConfigured();

    _validateApprovals(msg.sender, _assets);

    Will storage will = config.beneficiaryToWill[_beneficiary];
    bool isNewBeneficiary = will.beneficiaryType == BeneficiaryType.NONE;

    if (isNewBeneficiary) {
      will.beneficiary = _beneficiary;
      will.beneficiaryType = BeneficiaryType.ADDRESS_ONLY;
      config.beneficiaryToIndex[_beneficiary] = config.beneficiaries.length;
      config.beneficiaries.push(_beneficiary);
      emit WillCreated(msg.sender, _beneficiary);
    } else {
      emit WillUpdated(msg.sender, _beneficiary);
    }

    _processAssets(will, config, _assets, _shares);
  }

  function createIdentityWill(
    BeneficiaryIdentity calldata _identity,
    address[] calldata _assets,
    Share[] calldata _shares
  ) external {
    if (_assets.length != _shares.length) revert ArrayLengthMismatch();
    if (bytes(_identity.firstName).length == 0 || 
        bytes(_identity.lastName).length == 0 || 
        bytes(_identity.dateOfBirth).length == 0) {
      revert InvalidIdentityData();
    }

    OwnerConfig storage config = ownerConfigs[msg.sender];
    if (config.livenessCheckDuration == 0) revert NotConfigured();

    _validateApprovals(msg.sender, _assets);

    bytes32 identityHash = keccak256(abi.encodePacked(
      _identity.firstName,
      _identity.lastName,
      _identity.dateOfBirth
    ));

    Will storage will = config.identityToWill[identityHash];
    bool isNewBeneficiary = (will.beneficiaryType != BeneficiaryType.IDENTITY_VERIFIED);

    if (isNewBeneficiary) {
      will.beneficiary = address(0);
      will.beneficiaryType = BeneficiaryType.IDENTITY_VERIFIED;
      will.identity = _identity;
      config.identityHashToIndex[identityHash] = config.identityHashes.length;
      config.identityHashes.push(identityHash);
      emit IdentityWillCreated(msg.sender, identityHash, _identity.firstName, _identity.lastName);
    } else {
      emit IdentityWillUpdated(msg.sender, identityHash);
    }

    _processAssets(will, config, _assets, _shares);
  }

  function checkIn() external {
    OwnerConfig storage config = ownerConfigs[msg.sender];
    if (config.livenessCheckDuration == 0) revert NotConfigured();

    config.lastCheckIn = block.timestamp;
    emit CheckIn(msg.sender, block.timestamp);
  }

  function claim(address _owner) external {
    OwnerConfig storage config = ownerConfigs[_owner];

    if (config.lastCheckIn + config.livenessCheckDuration >= block.timestamp) {
      revert OwnerStillAlive();
    }

    Will storage will = config.beneficiaryToWill[msg.sender];
    if (will.beneficiaryType == BeneficiaryType.NONE) revert NotBeneficiary();

    _executeClaim(_owner, will, config, msg.sender);
  }

  function claimWithIdentity(
    address _owner, 
    bytes32 _identityHash,
    bytes calldata _proof
  ) external {
    OwnerConfig storage config = ownerConfigs[_owner];

    if (config.lastCheckIn + config.livenessCheckDuration >= block.timestamp) {
      revert OwnerStillAlive();
    }

    Will storage will = config.identityToWill[_identityHash];
    if (will.beneficiaryType != BeneficiaryType.IDENTITY_VERIFIED) revert NotBeneficiary();

    if (will.claimed) revert IdentityAlreadyClaimed();

    bytes memory userData = abi.encode(_owner, _identityHash);
    bytes32 userIdentifier = bytes32(uint256(uint160(msg.sender)));
  }

  // ============ VIEW FUNCTIONS ============

  function isOwnerAlive(address _owner) external view returns (bool) {
    OwnerConfig storage config = ownerConfigs[_owner];
    if (config.livenessCheckDuration == 0) return true;
    return config.lastCheckIn + config.livenessCheckDuration >= block.timestamp;
  }

  function getOwnerLiveliness(address _owner) external view returns (uint256 duration, uint256 lastCheckIn) {
    OwnerConfig storage config = ownerConfigs[_owner];
    return (config.livenessCheckDuration, config.lastCheckIn);
  }

  function getBeneficiaries(address _owner) external view returns (address[] memory) {
    return ownerConfigs[_owner].beneficiaries;
  }

  function getWillAssets(address _owner, address _beneficiary) external view returns (address[] memory) {
    return ownerConfigs[_owner].beneficiaryToWill[_beneficiary].assets;
  }

  function getAssetShare(address _owner, address _beneficiary, address _asset) 
  external 
  view 
  returns (Share memory) 
  {
    return ownerConfigs[_owner].beneficiaryToWill[_beneficiary].assetToShare[_asset];
  }

  function getAssetTotalAllocatedBps(address _owner, address _asset) external view returns (uint256) {
    return ownerConfigs[_owner].assetTotalAllocatedBps[_asset];
  }

  function getIdentityBeneficiaries(address _owner) external view returns (bytes32[] memory) {
    return ownerConfigs[_owner].identityHashes;
  }

  function getIdentityWillAssets(address _owner, bytes32 _identityHash) external view returns (address[] memory) {
    return ownerConfigs[_owner].identityToWill[_identityHash].assets;
  }

  function getIdentityInfo(address _owner, bytes32 _identityHash) 
  external 
  view 
  returns (BeneficiaryIdentity memory) 
  {
    return ownerConfigs[_owner].identityToWill[_identityHash].identity;
  }

  function getIdentityAssetShare(address _owner, bytes32 _identityHash, address _asset) 
  external 
  view 
  returns (Share memory) 
  {
    return ownerConfigs[_owner].identityToWill[_identityHash].assetToShare[_asset];
  }

  function hasIdentityClaimed(address _owner, bytes32 _identityHash) external view returns (bool) {
    return ownerConfigs[_owner].identityToWill[_identityHash].claimed;
  }

  function generateIdentityHash(BeneficiaryIdentity calldata _identity) external pure returns (bytes32) {
    return keccak256(abi.encodePacked(
      _identity.firstName,
      _identity.lastName,
      _identity.dateOfBirth
    ));
  }

  function getAssetBalanceSnapshot(address _owner, address _asset) external view returns (uint256, bool) {
    OwnerConfig storage config = ownerConfigs[_owner];
    return (config.assetBalanceSnapshot[_asset], config.assetSnapshotTaken[_asset]);
  }

  // ============ SELF.XYZ OVERRIDES ============

  function getConfigId(
    bytes32 destinationChainId,
    bytes32 userIdentifier,
    bytes memory userDefinedData
  ) public pure override returns (bytes32) {
    return keccak256(abi.encode(destinationChainId, userIdentifier, userDefinedData));
  }

  function customVerificationHook(
    ISelfVerificationRoot.GenericDiscloseOutputV2 memory output,
    bytes memory userData
  ) internal override {
    (address owner, bytes32 expectedIdentityHash) = abi.decode(userData, (address, bytes32));

    if (nullifierUsed[output.nullifier]) revert NullifierAlreadyUsed();

    bytes32 verifiedIdentityHash = keccak256(abi.encodePacked(
      output.name[0],
      output.name[1],
      output.dateOfBirth
    ));

    if (verifiedIdentityHash != expectedIdentityHash) revert IdentityMismatch();

    OwnerConfig storage config = ownerConfigs[owner];
    Will storage will = config.identityToWill[expectedIdentityHash];

    if (!_verifyIdentityMatch(will.identity, output)) revert IdentityMismatch();

    nullifierUsed[output.nullifier] = true;
    will.claimed = true;
    will.nullifier = output.nullifier;

    address claimer = address(uint160(output.userIdentifier));

    emit IdentityVerified(owner, expectedIdentityHash, output.nullifier, claimer);

    _executeClaim(owner, will, config, claimer);
  }

  // ============ INTERNAL FUNCTIONS ============

  function _processAssets(
    Will storage _will,
    OwnerConfig storage _config,
    address[] calldata _assets,
    Share[] calldata _shares
  ) internal {
    for (uint256 i = 0; i < _assets.length; i++) {
      address asset = _assets[i];
      Share memory newShare = _shares[i];

      if (newShare.shareType == ShareType.BPS && newShare.shareAmount > 10000) {
        revert InvalidShareAmount();
      }

      Share storage existingShare = _will.assetToShare[asset];
      bool assetExists = existingShare.shareType != ShareType.NONE;

      if (assetExists && existingShare.shareType == ShareType.BPS && existingShare.shareAmount > 0) {
        _config.assetTotalAllocatedBps[asset] -= existingShare.shareAmount;
      }

      if (newShare.shareAmount == 0) {
        if (assetExists) {
          _removeAssetFromWill(_will, asset, _config);
        }
        continue;
      }

      if (newShare.shareType == ShareType.BPS) {
        uint256 newTotal = _config.assetTotalAllocatedBps[asset] + newShare.shareAmount;
        if (newTotal > 10000) revert BpsExceeded(asset, newTotal);
        _config.assetTotalAllocatedBps[asset] = newTotal;
      }

      if (!assetExists) {
        _will.assetToIndex[asset] = _will.assets.length;
        _will.assets.push(asset);
      }

      _will.assetToShare[asset] = Share({
        shareType: newShare.shareType,
        shareAmount: newShare.shareAmount,
        claimed: false
      });
    }
  }

  function _executeClaim(
    address _owner,
    Will storage _will,
    OwnerConfig storage _config,
    address _claimer
  ) internal {
    address[] memory assets = _will.assets;

    for (uint256 i = 0; i < assets.length; i++) {
      address asset = assets[i];
      Share storage share = _will.assetToShare[asset];

      if (share.claimed) continue;

      // Take snapshot on first claim for this asset
      if (!_config.assetSnapshotTaken[asset]) {
        IERC20 token = IERC20(asset);
        uint256 balance = token.balanceOf(_owner);
        _config.assetBalanceSnapshot[asset] = balance;
        _config.assetSnapshotTaken[asset] = true;
        emit BalanceSnapshotTaken(_owner, asset, balance);
      }

      uint256 amount = _calculateAmount(_owner, asset, share, _config);
      if (amount == 0) {
        share.claimed = true;
        continue;
      }

      // Get current balance and transfer what's available
      IERC20 token = IERC20(asset);
      uint256 currentBalance = token.balanceOf(_owner);
      uint256 transferAmount = amount > currentBalance ? currentBalance : amount;

      if (transferAmount == 0) {
        share.claimed = true;
        continue;
      }

      bool success = _safeTransferFrom(asset, _owner, _claimer, transferAmount);

      if (success) {
        share.claimed = true;
        emit AssetClaimed(_owner, _claimer, asset, transferAmount);
      } else {
        emit AssetClaimFailed(_owner, _claimer, asset);
      }
    }
  }

  function _validateApprovals(address _owner, address[] calldata _assets) internal view {
    for (uint256 i = 0; i < _assets.length; i++) {
      IERC20 token = IERC20(_assets[i]);
      uint256 allowance = token.allowance(_owner, address(this));
      if (allowance == 0) revert NoApproval(_assets[i]);
    }
  }

  function _calculateAmount(
    address _owner, 
    address _asset, 
    Share storage _share,
    OwnerConfig storage _config
  ) 
  internal 
  view 
  returns (uint256) 
  {
    if (_share.shareType == ShareType.ABSOLUTE) {
      return _share.shareAmount;
    } else if (_share.shareType == ShareType.BPS) {
      // Use snapshot balance if taken, otherwise use current balance
      uint256 baseBalance = _config.assetSnapshotTaken[_asset] 
        ? _config.assetBalanceSnapshot[_asset]
        : IERC20(_asset).balanceOf(_owner);
      return (baseBalance * _share.shareAmount) / 10000;
    }
    return 0;
  }

  function _removeAssetFromWill(
    Will storage _will, 
    address _asset,
    OwnerConfig storage _config
  ) internal {
    Share storage share = _will.assetToShare[_asset];
    if (share.shareType == ShareType.BPS && share.shareAmount > 0) {
      _config.assetTotalAllocatedBps[_asset] -= share.shareAmount;
    }

    uint256 index = _will.assetToIndex[_asset];
    uint256 lastIndex = _will.assets.length - 1;

    if (index != lastIndex) {
      address lastAsset = _will.assets[lastIndex];
      _will.assets[index] = lastAsset;
      _will.assetToIndex[lastAsset] = index;
    }

    _will.assets.pop();
    delete _will.assetToIndex[_asset];
    delete _will.assetToShare[_asset];
  }

  function _safeTransferFrom(
    address _token,
    address _from,
    address _to,
    uint256 _amount
  ) internal returns (bool success) {
    bytes memory data = abi.encodeWithSelector(
      IERC20.transferFrom.selector,
      _from,
      _to,
      _amount
    );

    (success, ) = _token.call(data);

    if (success) {
      assembly {
        switch returndatasize()
        case 0 {
          success := 1
        }
        case 32 {
          returndatacopy(0, 0, 32)
          success := mload(0)
        }
        default {
          success := 0
        }
      }
    }
  }

  function _verifyIdentityMatch(
    BeneficiaryIdentity storage _expected,
    ISelfVerificationRoot.GenericDiscloseOutputV2 memory _disclosed
  ) internal view returns (bool) {
    return (
      keccak256(bytes(_expected.firstName)) == keccak256(bytes(_disclosed.name[0])) &&
      keccak256(bytes(_expected.lastName)) == keccak256(bytes(_disclosed.name[1])) &&
      keccak256(bytes(_expected.dateOfBirth)) == keccak256(bytes(_disclosed.dateOfBirth))
    );
  }
}
