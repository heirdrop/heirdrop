// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract Heirlock {
    
    enum ShareType { ABSOLUTE, BPS }
    
    struct Share {
        ShareType shareType;
        uint256 shareAmount;
    }
    
    struct Will {
        address beneficiary;
        address[] assets;
        Share[] shares;
    }
    
    struct OwnerConfig {
        uint256 livenessCheckDuration;
        uint256 lastCheckIn;
        Will[] wills;
    }
    
    // ============ STATE ============
    
    mapping(address => OwnerConfig) public ownerConfigs;
    
    // ============ EVENTS ============
    
    event LivenessConfigured(address indexed owner, uint256 duration);
    event CheckIn(address indexed owner, uint256 timestamp);
    event WillCreated(address indexed owner, address indexed beneficiary, uint256 willIndex);
    event Claimed(address indexed owner, address indexed beneficiary, address indexed asset, uint256 amount);
    
    // ============ EXTERNAL FUNCTIONS ============
    
    /// @notice Configure liveliness check duration
    function configureLiveness(uint256 _duration) external;
    
    /// @notice Create a new will for a beneficiary
    /// @dev Validates approvals exist for all assets
    function createWill(
        address _beneficiary,
        address[] calldata _assets,
        Share[] calldata _shares
    ) external;
    
    /// @notice Owner signals they're still alive
    function checkIn() external;
    
    /// @notice Beneficiary claims inheritance after owner is presumed dead
    function claim(address _owner) external;
    
    // ============ VIEW FUNCTIONS ============
    
    function getOwnerConfig(address _owner) external view returns (OwnerConfig memory);
    function getWill(address _owner, uint256 _willIndex) external view returns (Will memory);
    function isOwnerAlive(address _owner) external view returns (bool);
    
    // ============ INTERNAL FUNCTIONS ============
    
    function _validateApprovals(address _owner, address[] calldata _assets) internal view;
    function _calculateAmount(address _owner, address _asset, Share memory _share) internal view returns (uint256);
    function _executeClaim(address _owner, Will memory _will) internal;
}
