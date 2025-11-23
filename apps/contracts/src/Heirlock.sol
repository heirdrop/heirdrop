// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Self.xyz imports
import {SelfVerificationRoot} from "@selfxyz/self/contracts/abstract/SelfVerificationRoot.sol";
import {ISelfVerificationRoot} from "@selfxyz/self/contracts/interfaces/ISelfVerificationRoot.sol";

contract Heirlock is SelfVerificationRoot, Ownable {
    
    // ============ TYPES ============
    
    enum ShareType { ABSOLUTE, BPS }
    
    enum BeneficiaryType { ADDRESS_ONLY, IDENTITY_VERIFIED }
    
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
    }
    
    // ============ STATE ============
    
    mapping(address => OwnerConfig) private ownerConfigs;
    
    // Self.xyz integration
    bytes32 public verificationConfigId;
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
    
    // ============ CONSTRUCTOR ============
    
    /**
     * @notice Initialize the Heirlock contract with Self.xyz verification
     * @param _selfVerificationHub Address of the Self.xyz IdentityVerificationHub
     * @param _scopeSeed Scope seed string for Self.xyz (hashed with contract address)
     */
    constructor(
        address _selfVerificationHub, 
        string memory _scopeSeed
    ) 
        SelfVerificationRoot(_selfVerificationHub, _scopeSeed) 
        Ownable(msg.sender) 
    {
    }
    
    // ============ OWNER FUNCTIONS ============
    
    /// @notice Update Self.xyz verification configuration (owner only)
    /// @param _configId Verification configuration ID
    function setVerificationConfigId(bytes32 _configId) external onlyOwner {
        verificationConfigId = _configId;
    }
    
    // ============ EXTERNAL FUNCTIONS ============
    
    /// @notice Configure liveliness check duration
    /// @param _duration Duration in seconds that owner must check in within
    function configureLiveness(uint256 _duration) external {
        if (_duration == 0) revert InvalidDuration();
        
        OwnerConfig storage config = ownerConfigs[msg.sender];
        config.livenessCheckDuration = _duration;
        config.lastCheckIn = block.timestamp;
        
        emit LivenessConfigured(msg.sender, _duration, block.timestamp);
    }
    
    /// @notice Create or update a will for a beneficiary (address-based)
    /// @param _beneficiary Address that will inherit the assets
    /// @param _assets Array of asset addresses to include in will
    /// @param _shares Array of shares corresponding to each asset
    function createWill(
        address _beneficiary,
        address[] calldata _assets,
        Share[] calldata _shares
    ) external {
        if (_beneficiary == address(0)) revert NotBeneficiary();
        if (_assets.length != _shares.length) revert ArrayLengthMismatch();
        
        OwnerConfig storage config = ownerConfigs[msg.sender];
        if (config.livenessCheckDuration == 0) revert NotConfigured();
        
        // Validate approvals for all assets
        _validateApprovals(msg.sender, _assets);
        
        Will storage will = config.beneficiaryToWill[_beneficiary];
        bool isNewBeneficiary = will.beneficiary == address(0);
        
        if (isNewBeneficiary) {
            will.beneficiary = _beneficiary;
            will.beneficiaryType = BeneficiaryType.ADDRESS_ONLY;
            config.beneficiaryToIndex[_beneficiary] = config.beneficiaries.length;
            config.beneficiaries.push(_beneficiary);
            emit WillCreated(msg.sender, _beneficiary);
        } else {
            emit WillUpdated(msg.sender, _beneficiary);
        }
        
        // Process each asset
        for (uint256 i = 0; i < _assets.length; i++) {
            address asset = _assets[i];
            Share memory newShare = _shares[i];
            
            // Validate share amount
            if (newShare.shareType == ShareType.BPS && newShare.shareAmount > 10000) {
                revert InvalidShareAmount();
            }
            
            Share storage existingShare = will.assetToShare[asset];
            bool assetExists = existingShare.shareType == newShare.shareType || 
                              existingShare.shareAmount != 0 || 
                              will.assetToIndex[asset] != 0 || 
                              (will.assets.length > 0 && will.assets[0] == asset);
            
            // Handle BPS tracking
            if (existingShare.shareType == ShareType.BPS) {
                config.assetTotalAllocatedBps[asset] -= existingShare.shareAmount;
            }
            
            // Delete asset if shareAmount is 0
            if (newShare.shareAmount == 0) {
                if (assetExists) {
                    _removeAssetFromWill(will, asset, config);
                }
                continue;
            }
            
            // Update BPS tracking
            if (newShare.shareType == ShareType.BPS) {
                uint256 newTotal = config.assetTotalAllocatedBps[asset] + newShare.shareAmount;
                if (newTotal > 10000) revert BpsExceeded(asset, newTotal);
                config.assetTotalAllocatedBps[asset] = newTotal;
            }
            
            // Add or update asset
            if (!assetExists) {
                will.assetToIndex[asset] = will.assets.length;
                will.assets.push(asset);
            }
            
            will.assetToShare[asset] = Share({
                shareType: newShare.shareType,
                shareAmount: newShare.shareAmount,
                claimed: false
            });
        }
    }
    
    /// @notice Create or update a will for an identity-verified beneficiary
    /// @param _identity The identity information (firstName, lastName, dateOfBirth) of the beneficiary
    /// @param _assets Array of asset addresses to include in will
    /// @param _shares Array of shares corresponding to each asset
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
        
        // Validate approvals for all assets
        _validateApprovals(msg.sender, _assets);
        
        // Generate identity hash
        bytes32 identityHash = keccak256(abi.encodePacked(
            _identity.firstName,
            _identity.lastName,
            _identity.dateOfBirth
        ));
        
        Will storage will = config.identityToWill[identityHash];
        bool isNewBeneficiary = (will.beneficiaryType != BeneficiaryType.IDENTITY_VERIFIED);
        
        if (isNewBeneficiary) {
            will.beneficiary = address(0); // No pre-defined address for identity-verified
            will.beneficiaryType = BeneficiaryType.IDENTITY_VERIFIED;
            will.identity = _identity;
            config.identityHashToIndex[identityHash] = config.identityHashes.length;
            config.identityHashes.push(identityHash);
            emit IdentityWillCreated(msg.sender, identityHash, _identity.firstName, _identity.lastName);
        } else {
            emit IdentityWillUpdated(msg.sender, identityHash);
        }
        
        // Process each asset
        for (uint256 i = 0; i < _assets.length; i++) {
            address asset = _assets[i];
            Share memory newShare = _shares[i];
            
            // Validate share amount
            if (newShare.shareType == ShareType.BPS && newShare.shareAmount > 10000) {
                revert InvalidShareAmount();
            }
            
            Share storage existingShare = will.assetToShare[asset];
            bool assetExists = existingShare.shareType == newShare.shareType || 
                              existingShare.shareAmount != 0 || 
                              will.assetToIndex[asset] != 0 || 
                              (will.assets.length > 0 && will.assets[0] == asset);
            
            // Handle BPS tracking
            if (existingShare.shareType == ShareType.BPS) {
                config.assetTotalAllocatedBps[asset] -= existingShare.shareAmount;
            }
            
            // Delete asset if shareAmount is 0
            if (newShare.shareAmount == 0) {
                if (assetExists) {
                    _removeAssetFromWill(will, asset, config);
                }
                continue;
            }
            
            // Update BPS tracking
            if (newShare.shareType == ShareType.BPS) {
                uint256 newTotal = config.assetTotalAllocatedBps[asset] + newShare.shareAmount;
                if (newTotal > 10000) revert BpsExceeded(asset, newTotal);
                config.assetTotalAllocatedBps[asset] = newTotal;
            }
            
            // Add or update asset
            if (!assetExists) {
                will.assetToIndex[asset] = will.assets.length;
                will.assets.push(asset);
            }
            
            will.assetToShare[asset] = Share({
                shareType: newShare.shareType,
                shareAmount: newShare.shareAmount,
                claimed: false
            });
        }
    }
    
    /// @notice Owner signals they're still alive
    function checkIn() external {
        OwnerConfig storage config = ownerConfigs[msg.sender];
        if (config.livenessCheckDuration == 0) revert NotConfigured();
        
        config.lastCheckIn = block.timestamp;
        emit CheckIn(msg.sender, block.timestamp);
    }
    
    /// @notice Beneficiary claims inheritance after owner is presumed dead (address-based)
    /// @param _owner Address of the owner whose assets to claim
    function claim(address _owner) external {
        OwnerConfig storage config = ownerConfigs[_owner];
        
        // Check owner is presumed dead
        if (config.lastCheckIn + config.livenessCheckDuration >= block.timestamp) {
            revert OwnerStillAlive();
        }
        
        // Check msg.sender is a beneficiary
        Will storage will = config.beneficiaryToWill[msg.sender];
        if (will.beneficiary == address(0)) revert NotBeneficiary();
        
        // Attempt to claim each asset
        address[] memory assets = will.assets;
        for (uint256 i = 0; i < assets.length; i++) {
            address asset = assets[i];
            Share storage share = will.assetToShare[asset];
            
            // Skip if already claimed
            if (share.claimed) continue;
            
            uint256 amount = _calculateAmount(_owner, asset, share);
            if (amount == 0) {
                share.claimed = true;
                continue;
            }
            
            // Attempt transfer with low-level call
            bool success = _safeTransferFrom(asset, _owner, msg.sender, amount);
            
            if (success) {
                share.claimed = true;
                emit AssetClaimed(_owner, msg.sender, asset, amount);
            } else {
                emit AssetClaimFailed(_owner, msg.sender, asset);
            }
        }
    }
    
    /// @notice Initiate identity-verified claim process
    /// @param _owner Address of the owner whose assets to claim
    /// @param _identityHash The expected identity hash (can be obtained via generateIdentityHash)
    /// @param _proof The Self.xyz verification proof
    /// @dev This function initiates the claim and verification happens in customVerificationHook
    function claimWithIdentity(
        address _owner, 
        bytes32 _identityHash,
        bytes calldata _proof
    ) external {
        OwnerConfig storage config = ownerConfigs[_owner];
        
        // Check owner is presumed dead
        if (config.lastCheckIn + config.livenessCheckDuration >= block.timestamp) {
            revert OwnerStillAlive();
        }
        
        // Get will for this identity
        Will storage will = config.identityToWill[_identityHash];
        if (will.beneficiaryType != BeneficiaryType.IDENTITY_VERIFIED) revert NotBeneficiary();
        
        // Check identity hasn't already claimed
        if (will.claimed) revert IdentityAlreadyClaimed();
        
        // Prepare user data: encode owner address for the hook
        bytes memory userData = abi.encode(_owner, _identityHash);
        
        // Call parent's verify function which will trigger customVerificationHook
        bytes32 userIdentifier = bytes32(uint256(uint160(msg.sender)));
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /// @notice Check if owner is still considered alive
    /// @param _owner Address of the owner to check
    /// @return bool True if owner has checked in within their configured duration
    function isOwnerAlive(address _owner) external view returns (bool) {
        OwnerConfig storage config = ownerConfigs[_owner];
        if (config.livenessCheckDuration == 0) return true;
        return config.lastCheckIn + config.livenessCheckDuration >= block.timestamp;
    }
    
    /// @notice Get owner's liveliness configuration
    /// @param _owner Address of the owner
    /// @return duration The configured liveliness check duration
    /// @return lastCheckIn Timestamp of last check-in
    function getOwnerLiveliness(address _owner) external view returns (uint256 duration, uint256 lastCheckIn) {
        OwnerConfig storage config = ownerConfigs[_owner];
        return (config.livenessCheckDuration, config.lastCheckIn);
    }
    
    /// @notice Get list of beneficiaries for an owner
    /// @param _owner Address of the owner
    /// @return beneficiaries Array of beneficiary addresses
    function getBeneficiaries(address _owner) external view returns (address[] memory) {
        return ownerConfigs[_owner].beneficiaries;
    }
    
    /// @notice Get will details for a specific beneficiary
    /// @param _owner Address of the owner
    /// @param _beneficiary Address of the beneficiary
    /// @return assets Array of asset addresses in the will
    function getWillAssets(address _owner, address _beneficiary) external view returns (address[] memory) {
        return ownerConfigs[_owner].beneficiaryToWill[_beneficiary].assets;
    }
    
    /// @notice Get share details for a specific asset in a will
    /// @param _owner Address of the owner
    /// @param _beneficiary Address of the beneficiary
    /// @param _asset Address of the asset
    /// @return share The share configuration for that asset
    function getAssetShare(address _owner, address _beneficiary, address _asset) 
        external 
        view 
        returns (Share memory) 
    {
        return ownerConfigs[_owner].beneficiaryToWill[_beneficiary].assetToShare[_asset];
    }
    
    /// @notice Get total BPS allocated for an asset across all wills
    /// @param _owner Address of the owner
    /// @param _asset Address of the asset
    /// @return totalBps Total basis points allocated
    function getAssetTotalAllocatedBps(address _owner, address _asset) external view returns (uint256) {
        return ownerConfigs[_owner].assetTotalAllocatedBps[_asset];
    }
    
    /// @notice Get list of identity hashes for an owner
    /// @param _owner Address of the owner
    /// @return identityHashes Array of identity hashes
    function getIdentityBeneficiaries(address _owner) external view returns (bytes32[] memory) {
        return ownerConfigs[_owner].identityHashes;
    }
    
    /// @notice Get will details for a specific identity-based beneficiary
    /// @param _owner Address of the owner
    /// @param _identityHash The identity hash
    /// @return assets Array of asset addresses in the will
    function getIdentityWillAssets(address _owner, bytes32 _identityHash) external view returns (address[] memory) {
        return ownerConfigs[_owner].identityToWill[_identityHash].assets;
    }
    
    /// @notice Get identity details for an identity-based beneficiary
    /// @param _owner Address of the owner
    /// @param _identityHash The identity hash
    /// @return identity The beneficiary's identity information
    function getIdentityInfo(address _owner, bytes32 _identityHash) 
        external 
        view 
        returns (BeneficiaryIdentity memory) 
    {
        return ownerConfigs[_owner].identityToWill[_identityHash].identity;
    }
    
    /// @notice Get share details for a specific asset in an identity-based will
    /// @param _owner Address of the owner
    /// @param _identityHash The identity hash
    /// @param _asset Address of the asset
    /// @return share The share configuration for that asset
    function getIdentityAssetShare(address _owner, bytes32 _identityHash, address _asset) 
        external 
        view 
        returns (Share memory) 
    {
        return ownerConfigs[_owner].identityToWill[_identityHash].assetToShare[_asset];
    }
    
    /// @notice Check if an identity-based beneficiary has claimed
    /// @param _owner Address of the owner
    /// @param _identityHash The identity hash
    /// @return claimed True if the identity has claimed
    function hasIdentityClaimed(address _owner, bytes32 _identityHash) external view returns (bool) {
        return ownerConfigs[_owner].identityToWill[_identityHash].claimed;
    }
    
    /// @notice Generate identity hash from identity data
    /// @param _identity The identity information
    /// @return identityHash The keccak256 hash of the identity
    function generateIdentityHash(BeneficiaryIdentity calldata _identity) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            _identity.firstName,
            _identity.lastName,
            _identity.dateOfBirth
        ));
    }
    
    // ============ SELF.XYZ OVERRIDES ============
    
    /**
     * @notice Override to provide configId for verification
     * @dev Called by SelfVerificationRoot during verification process
     */
    function getConfigId(
        bytes32 destinationChainId,
        bytes32 userIdentifier,
        bytes memory userDefinedData
    ) public view override returns (bytes32) {
        return verificationConfigId;
    }
    
    /**
     * @notice Hook called after successful Self.xyz verification
     * @dev Processes the identity claim and transfers assets
     * @param output The verification output containing verified identity data
     * @param userData Encoded data containing owner address and identity hash
     */
    function customVerificationHook(
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output,
        bytes memory userData
    ) internal override {
        // Decode user data
        (address owner, bytes32 expectedIdentityHash) = abi.decode(userData, (address, bytes32));
        
        // Check nullifier hasn't been used
        if (nullifierUsed[output.nullifier]) revert NullifierAlreadyUsed();
        
        // Generate identity hash from verified data
        bytes32 verifiedIdentityHash = keccak256(abi.encodePacked(
            output.name[0],
            output.name[1],
            output.dateOfBirth
        ));
        
        // Verify the identity matches what was expected
        if (verifiedIdentityHash != expectedIdentityHash) revert IdentityMismatch();
        
        OwnerConfig storage config = ownerConfigs[owner];
        Will storage will = config.identityToWill[expectedIdentityHash];
        
        // Verify identity matches the will's stored identity
        if (!_verifyIdentityMatch(will.identity, output)) revert IdentityMismatch();
        
        // Mark nullifier as used and will as claimed
        nullifierUsed[output.nullifier] = true;
        will.claimed = true;
        will.nullifier = output.nullifier;
        
        address claimer = address(uint160(output.userIdentifier));
        
        emit IdentityVerified(owner, expectedIdentityHash, output.nullifier, claimer);
        
        // Attempt to claim each asset
        address[] memory assets = will.assets;
        for (uint256 i = 0; i < assets.length; i++) {
            address asset = assets[i];
            Share storage share = will.assetToShare[asset];
            
            // Skip if already claimed
            if (share.claimed) continue;
            
            uint256 amount = _calculateAmount(owner, asset, share);
            if (amount == 0) {
                share.claimed = true;
                continue;
            }
            
            // Attempt transfer with low-level call
            bool success = _safeTransferFrom(asset, owner, claimer, amount);
            
            if (success) {
                share.claimed = true;
                emit AssetClaimed(owner, claimer, asset, amount);
            } else {
                emit AssetClaimFailed(owner, claimer, asset);
            }
        }
    }
    
    // ============ INTERNAL FUNCTIONS ============
    
    /// @notice Validate that owner has approved this contract for all assets
    /// @param _owner Address of the owner
    /// @param _assets Array of asset addresses to validate
    function _validateApprovals(address _owner, address[] calldata _assets) internal view {
        for (uint256 i = 0; i < _assets.length; i++) {
            IERC20 token = IERC20(_assets[i]);
            uint256 allowance = token.allowance(_owner, address(this));
            if (allowance == 0) revert NoApproval(_assets[i]);
        }
    }
    
    /// @notice Calculate the amount to transfer based on share configuration
    /// @param _owner Address of the owner
    /// @param _asset Address of the asset
    /// @param _share Share configuration
    /// @return amount Amount to transfer
    function _calculateAmount(address _owner, address _asset, Share storage _share) 
        internal 
        view 
        returns (uint256) 
    {
        if (_share.shareType == ShareType.ABSOLUTE) {
            return _share.shareAmount;
        } else {
            // BPS calculation
            IERC20 token = IERC20(_asset);
            uint256 balance = token.balanceOf(_owner);
            return (balance * _share.shareAmount) / 10000;
        }
    }
    
    /// @notice Remove an asset from a will
    /// @param _will The will to modify
    /// @param _asset The asset to remove
    /// @param _config The owner's config for BPS tracking
    function _removeAssetFromWill(
        Will storage _will, 
        address _asset,
        OwnerConfig storage _config
    ) internal {
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
    
    /// @notice Safe transfer from using low-level call
    /// @param _token Address of the token
    /// @param _from Address to transfer from
    /// @param _to Address to transfer to
    /// @param _amount Amount to transfer
    /// @return success True if transfer succeeded
    function _safeTransferFrom(
        address _token,
        address _from,
        address _to,
        uint256 _amount
    ) internal returns (bool success) {
        // transferFrom(address,address,uint256)
        bytes memory data = abi.encodeWithSelector(
            IERC20.transferFrom.selector,
            _from,
            _to,
            _amount
        );
        
        (success, ) = _token.call(data);
        
        // Check return value if call succeeded
        if (success) {
            assembly {
                switch returndatasize()
                case 0 {
                    // Token doesn't return a value, assume success
                    success := 1
                }
                case 32 {
                    // Token returns a bool
                    returndatacopy(0, 0, 32)
                    success := mload(0)
                }
                default {
                    // Unexpected return size
                    success := 0
                }
            }
        }
    }
    
    /// @notice Verify that the disclosed identity matches the expected identity
    /// @param _expected The expected identity from the will
    /// @param _disclosed The disclosed identity from Self.xyz verification
    /// @return matches True if identities match
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