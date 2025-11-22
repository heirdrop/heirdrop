// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Heirlock {
    
    // ============ TYPES ============
    
    enum ShareType { ABSOLUTE, BPS }
    
    struct Share {
        ShareType shareType;
        uint256 shareAmount;
        bool claimed;
    }
    
    struct Will {
        address beneficiary;
        address[] assets;
        mapping(address => Share) assetToShare; // asset address -> Share
        mapping(address => uint256) assetToIndex; // asset address -> index in assets array
    }
    
    struct OwnerConfig {
        uint256 livenessCheckDuration;
        uint256 lastCheckIn;
        mapping(address => Will) beneficiaryToWill; // beneficiary address -> Will
        address[] beneficiaries; // list of all beneficiaries
        mapping(address => uint256) beneficiaryToIndex; // beneficiary -> index in beneficiaries array
        mapping(address => uint256) assetTotalAllocatedBps; // asset address -> total BPS allocated
    }
    
    // ============ STATE ============
    
    mapping(address => OwnerConfig) private ownerConfigs;
    
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
    
    // ============ EVENTS ============
    
    event LivenessConfigured(address indexed owner, uint256 duration, uint256 timestamp);
    event CheckIn(address indexed owner, uint256 timestamp);
    event WillCreated(address indexed owner, address indexed beneficiary);
    event WillUpdated(address indexed owner, address indexed beneficiary);
    event AssetClaimed(address indexed owner, address indexed beneficiary, address indexed asset, uint256 amount);
    event AssetClaimFailed(address indexed owner, address indexed beneficiary, address indexed asset);
    
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
    
    /// @notice Create or update a will for a beneficiary
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
    
    /// @notice Owner signals they're still alive
    function checkIn() external {
        OwnerConfig storage config = ownerConfigs[msg.sender];
        if (config.livenessCheckDuration == 0) revert NotConfigured();
        
        config.lastCheckIn = block.timestamp;
        emit CheckIn(msg.sender, block.timestamp);
    }
    
    /// @notice Beneficiary claims inheritance after owner is presumed dead
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
}