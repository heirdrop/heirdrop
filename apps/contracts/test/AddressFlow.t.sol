// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Heirlock.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 token for testing
contract MockERC20 is ERC20 {
  constructor(string memory name, string memory symbol) ERC20(name, symbol) {
    _mint(msg.sender, 1000000 * 10**18);
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

// Mock token that returns false on transfer
contract MockFailingERC20 is ERC20 {
  bool public shouldFail;

  constructor(string memory name, string memory symbol) ERC20(name, symbol) {
    _mint(msg.sender, 1000000 * 10**18);
  }

  function setFailure(bool _shouldFail) external {
    shouldFail = _shouldFail;
  }

  function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
    if (shouldFail) return false;
    return super.transferFrom(from, to, amount);
  }
}

contract HeirlockTest is Test {
  Heirlock public heirlock;
  MockERC20 public token1;
  MockERC20 public token2;
  MockERC20 public token3;
  MockFailingERC20 public failingToken;

  address public owner = makeAddr("Owner");
  address public beneficiary1 = makeAddr("Beneficiary1");
  address public beneficiary2 = makeAddr("Beneficiary2");
  address public nonBeneficiary = makeAddr("NonBeneficiary");

  uint256 constant LIVENESS_DURATION = 30 days;
  uint256 constant INITIAL_BALANCE = 1000000 * 10**18;

  function setUp() public {
    address identityVerificationHub = vm.envAddress("IDENTITY_VERIFICATION_HUB");
    string memory scopeSeed = vm.envString("SCOPE_SEED");
    heirlock = new Heirlock(identityVerificationHub, scopeSeed);
    token1 = new MockERC20("Token1", "TK1");
    token2 = new MockERC20("Token2", "TK2");
    token3 = new MockERC20("Token3", "TK3");
    failingToken = new MockFailingERC20("FailToken", "FAIL");

    // Transfer tokens to owner
    token1.transfer(owner, INITIAL_BALANCE);
    token2.transfer(owner, INITIAL_BALANCE);
    token3.transfer(owner, INITIAL_BALANCE);
    failingToken.transfer(owner, INITIAL_BALANCE);
  }

  // ============ CONFIGURE LIVENESS TESTS ============

  function test_ConfigureLiveness() public {
    vm.startPrank(owner);

    vm.expectEmit(true, false, false, true);
    emit Heirlock.LivenessConfigured(owner, LIVENESS_DURATION, block.timestamp);

    heirlock.configureLiveness(LIVENESS_DURATION);

    (uint256 duration, uint256 lastCheckIn) = heirlock.getOwnerLiveliness(owner);
    assertEq(duration, LIVENESS_DURATION);
    assertEq(lastCheckIn, block.timestamp);

    vm.stopPrank();
  }

  function test_ConfigureLiveness_RevertOnZeroDuration() public {
    vm.prank(owner);
    vm.expectRevert(Heirlock.InvalidDuration.selector);
    heirlock.configureLiveness(0);
  }

  function test_ConfigureLiveness_CanUpdateDuration() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    vm.warp(block.timestamp + 10 days);

    uint256 newDuration = 60 days;
    heirlock.configureLiveness(newDuration);

    (uint256 duration, uint256 lastCheckIn) = heirlock.getOwnerLiveliness(owner);
    assertEq(duration, newDuration);
    assertEq(lastCheckIn, block.timestamp);

    vm.stopPrank();
  }

  // ============ CHECK-IN TESTS ============

  function test_CheckIn() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);
    uint256 initialCheckIn = block.timestamp;

    vm.warp(block.timestamp + 10 days);

    vm.expectEmit(true, false, false, true);
    emit Heirlock.CheckIn(owner, block.timestamp);

    heirlock.checkIn();

    (, uint256 lastCheckIn) = heirlock.getOwnerLiveliness(owner);
    assertEq(lastCheckIn, block.timestamp);
    assertGt(lastCheckIn, initialCheckIn);

    vm.stopPrank();
  }

  function test_CheckIn_RevertIfNotConfigured() public {
    vm.prank(owner);
    vm.expectRevert(Heirlock.NotConfigured.selector);
    heirlock.checkIn();
  }

  function test_IsOwnerAlive() public {
    vm.startPrank(owner);
    heirlock.configureLiveness(LIVENESS_DURATION);
    vm.stopPrank();

    // Should be alive immediately after configuration
    assertTrue(heirlock.isOwnerAlive(owner));

    // Should be alive before duration expires
    vm.warp(block.timestamp + LIVENESS_DURATION - 1);
    assertTrue(heirlock.isOwnerAlive(owner));

    // Should be dead after duration expires
    vm.warp(block.timestamp + 2);
    assertFalse(heirlock.isOwnerAlive(owner));
  }

  // ============ CREATE WILL TESTS ============

  function test_CreateWill_Single() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    // Approve tokens
    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    vm.expectEmit(true, true, false, false);
    emit Heirlock.WillCreated(owner, beneficiary1);

    heirlock.createWill(beneficiary1, assets, shares);

    address[] memory beneficiaries = heirlock.getBeneficiaries(owner);
    assertEq(beneficiaries.length, 1);
    assertEq(beneficiaries[0], beneficiary1);

    address[] memory willAssets = heirlock.getWillAssets(owner, beneficiary1);
    assertEq(willAssets.length, 1);
    assertEq(willAssets[0], address(token1));

    Heirlock.Share memory share = heirlock.getAssetShare(owner, beneficiary1, address(token1));
    assertEq(uint8(share.shareType), uint8(Heirlock.ShareType.ABSOLUTE));
    assertEq(share.shareAmount, 100 * 10**18);
    assertFalse(share.claimed);

    vm.stopPrank();
  }

  function test_CreateWill_MultipleBeneficiaries() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);
    token2.approve(address(heirlock), type(uint256).max);

    // Create will for beneficiary1
    address[] memory assets1 = new address[](1);
    assets1[0] = address(token1);

    Heirlock.Share[] memory shares1 = new Heirlock.Share[](1);
    shares1[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 5000, // 50%
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets1, shares1);

    // Create will for beneficiary2
    address[] memory assets2 = new address[](2);
    assets2[0] = address(token1);
    assets2[1] = address(token2);

    Heirlock.Share[] memory shares2 = new Heirlock.Share[](2);
    shares2[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 3000, // 30%
      claimed: false
    });
    shares2[1] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 500 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary2, assets2, shares2);

    address[] memory beneficiaries = heirlock.getBeneficiaries(owner);
    assertEq(beneficiaries.length, 2);

    // Verify BPS tracking
    assertEq(heirlock.getAssetTotalAllocatedBps(owner, address(token1)), 8000);

    vm.stopPrank();
  }

  function test_CreateWill_UpdateExisting() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);
    token2.approve(address(heirlock), type(uint256).max);

    // Create initial will
    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    // Update will with new asset
    address[] memory newAssets = new address[](2);
    newAssets[0] = address(token1);
    newAssets[1] = address(token2);

    Heirlock.Share[] memory newShares = new Heirlock.Share[](2);
    newShares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 5000, // Changed to BPS
      claimed: false
    });
    newShares[1] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 200 * 10**18,
      claimed: false
    });

    vm.expectEmit(true, true, false, false);
    emit Heirlock.WillUpdated(owner, beneficiary1);

    heirlock.createWill(beneficiary1, newAssets, newShares);

    // Should still have only 1 beneficiary
    address[] memory beneficiaries = heirlock.getBeneficiaries(owner);
    assertEq(beneficiaries.length, 1);

    // Should have 2 assets now
    address[] memory willAssets = heirlock.getWillAssets(owner, beneficiary1);
    assertEq(willAssets.length, 2);

    // Verify updated share
    Heirlock.Share memory share1 = heirlock.getAssetShare(owner, beneficiary1, address(token1));
    assertEq(uint8(share1.shareType), uint8(Heirlock.ShareType.BPS));
    assertEq(share1.shareAmount, 5000);

    vm.stopPrank();
  }

  function test_CreateWill_DeleteAssetWithZeroAmount() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);
    token2.approve(address(heirlock), type(uint256).max);

    // Create will with 2 assets
    address[] memory assets = new address[](2);
    assets[0] = address(token1);
    assets[1] = address(token2);

    Heirlock.Share[] memory shares = new Heirlock.Share[](2);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });
    shares[1] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 200 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    // Update will, removing token1 by setting amount to 0
    address[] memory updateAssets = new address[](1);
    updateAssets[0] = address(token1);

    Heirlock.Share[] memory updateShares = new Heirlock.Share[](1);
    updateShares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 0,
      claimed: false
    });

    heirlock.createWill(beneficiary1, updateAssets, updateShares);

    // Should now have only 1 asset
    address[] memory willAssets = heirlock.getWillAssets(owner, beneficiary1);
    assertEq(willAssets.length, 1);
    assertEq(willAssets[0], address(token2));

    vm.stopPrank();
  }

  function test_CreateWill_RevertOnArrayLengthMismatch() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    address[] memory assets = new address[](2);
    Heirlock.Share[] memory shares = new Heirlock.Share[](1);

    vm.expectRevert(Heirlock.ArrayLengthMismatch.selector);
    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();
  }

  function test_CreateWill_RevertOnNoApproval() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    vm.expectRevert(abi.encodeWithSelector(Heirlock.NoApproval.selector, address(token1)));
    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();
  }

  function test_CreateWill_RevertIfNotConfigured() public {
    vm.startPrank(owner);

    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    vm.expectRevert(Heirlock.NotConfigured.selector);
    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();
  }

  function test_CreateWill_RevertOnBpsExceeded() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    // Create will for beneficiary1 with 60% BPS
    address[] memory assets1 = new address[](1);
    assets1[0] = address(token1);

    Heirlock.Share[] memory shares1 = new Heirlock.Share[](1);
    shares1[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 6000,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets1, shares1);

    // Try to create will for beneficiary2 with 50% BPS (total would be 110%)
    Heirlock.Share[] memory shares2 = new Heirlock.Share[](1);
    shares2[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 5000,
      claimed: false
    });

    vm.expectRevert(abi.encodeWithSelector(Heirlock.BpsExceeded.selector, address(token1), 11000));
    heirlock.createWill(beneficiary2, assets1, shares2);

    vm.stopPrank();
  }

  function test_CreateWill_RevertOnInvalidBpsAmount() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 10001, // Invalid BPS
      claimed: false
    });

    vm.expectRevert(Heirlock.InvalidShareAmount.selector);
    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();
  }

  // ============ CLAIM TESTS ============

  function test_Claim_AbsoluteAmount() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    console.log("Owner balance", token1.balanceOf(owner));
    token1.approve(address(heirlock), type(uint256).max);

    uint256 claimAmount = 100 * 10**18;

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: claimAmount,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    // Warp past liveness duration
    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    uint256 beneficiaryBalanceBefore = token1.balanceOf(beneficiary1);

    vm.startPrank(beneficiary1);
    // vm.expectEmit(true, true, true, true);
    // emit Heirlock.AssetClaimed(owner, beneficiary1, address(token1), claimAmount);

    heirlock.claim(owner);
    vm.stopPrank();

    uint256 beneficiaryBalanceAfter = token1.balanceOf(beneficiary1);
    assertEq(beneficiaryBalanceAfter - beneficiaryBalanceBefore, claimAmount);

    // Verify asset is marked as claimed
    Heirlock.Share memory share = heirlock.getAssetShare(owner, beneficiary1, address(token1));
    assertTrue(share.claimed);
  }

  function test_Claim_BpsAmount() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    uint256 ownerBalance = token1.balanceOf(owner);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 5000, // 50%
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    // Warp past liveness duration
    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    uint256 expectedAmount = (ownerBalance * 5000) / 10000;

    vm.prank(beneficiary1);
    heirlock.claim(owner);

    assertEq(token1.balanceOf(beneficiary1), expectedAmount);
  }

  function test_Claim_MultipleAssets() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);
    token2.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](2);
    assets[0] = address(token1);
    assets[1] = address(token2);

    Heirlock.Share[] memory shares = new Heirlock.Share[](2);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });
    shares[1] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 3000, // 30%
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    vm.prank(beneficiary1);
    heirlock.claim(owner);

    assertEq(token1.balanceOf(beneficiary1), 100 * 10**18);
    assertEq(token2.balanceOf(beneficiary1), (INITIAL_BALANCE * 3000) / 10000);
  }

  function test_Claim_MultipleBeneficiaries() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    // Create will for beneficiary1
    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares1 = new Heirlock.Share[](1);
    shares1[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 4000, // 40%
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares1);

    // Create will for beneficiary2
    Heirlock.Share[] memory shares2 = new Heirlock.Share[](1);
    shares2[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 6000, // 60%
      claimed: false
    });

    heirlock.createWill(beneficiary2, assets, shares2);

    vm.stopPrank();

    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    // Beneficiary1 claims
    vm.prank(beneficiary1);
    heirlock.claim(owner);
    assertEq(token1.balanceOf(beneficiary1), (INITIAL_BALANCE * 4000) / 10000);

    // Beneficiary2 claims
    vm.prank(beneficiary2);
    heirlock.claim(owner);
    assertEq(token1.balanceOf(beneficiary2), (INITIAL_BALANCE * 6000) / 10000);
  }

  function test_Claim_PartialFailure() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);
    failingToken.approve(address(heirlock), type(uint256).max);

    // Set failing token to fail
    failingToken.setFailure(true);

    address[] memory assets = new address[](2);
    assets[0] = address(token1);
    assets[1] = address(failingToken);

    Heirlock.Share[] memory shares = new Heirlock.Share[](2);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });
    shares[1] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 200 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    vm.prank(beneficiary1);
    vm.expectEmit(true, true, true, true);
    emit Heirlock.AssetClaimed(owner, beneficiary1, address(token1), 100 * 10**18);
    vm.expectEmit(true, true, true, false);
    emit Heirlock.AssetClaimFailed(owner, beneficiary1, address(failingToken));

    heirlock.claim(owner);

    // token1 should be claimed
    assertEq(token1.balanceOf(beneficiary1), 100 * 10**18);
    Heirlock.Share memory share1 = heirlock.getAssetShare(owner, beneficiary1, address(token1));
    assertTrue(share1.claimed);

    // failingToken should NOT be claimed
    assertEq(failingToken.balanceOf(beneficiary1), 0);
    Heirlock.Share memory share2 = heirlock.getAssetShare(owner, beneficiary1, address(failingToken));
    assertFalse(share2.claimed);

    // Now fix the failing token and try to claim again
    vm.prank(owner);
    failingToken.setFailure(false);

    vm.prank(beneficiary1);
    heirlock.claim(owner);

    // Now failingToken should be claimed
    assertEq(failingToken.balanceOf(beneficiary1), 200 * 10**18);
    share2 = heirlock.getAssetShare(owner, beneficiary1, address(failingToken));
    assertTrue(share2.claimed);
  }

  function test_Claim_RevertIfOwnerStillAlive() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    // Try to claim before liveness duration expires
    vm.prank(beneficiary1);
    vm.expectRevert(Heirlock.OwnerStillAlive.selector);
    heirlock.claim(owner);
  }

  function test_Claim_RevertIfNotBeneficiary() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    vm.prank(nonBeneficiary);
    vm.expectRevert(Heirlock.NotBeneficiary.selector);
    heirlock.claim(owner);
  }

  function test_Claim_CannotClaimTwice() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    // First claim
    vm.prank(beneficiary1);
    heirlock.claim(owner);

    uint256 balanceAfterFirstClaim = token1.balanceOf(beneficiary1);

    // Second claim should not transfer any tokens
    vm.prank(beneficiary1);
    heirlock.claim(owner);

    assertEq(token1.balanceOf(beneficiary1), balanceAfterFirstClaim);
  }

  function test_Claim_CheckInResetsLiveness() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.ABSOLUTE,
      shareAmount: 100 * 10**18,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    // Warp to just before liveness expires
    vm.warp(block.timestamp + LIVENESS_DURATION - 1);

    // Owner checks in
    heirlock.checkIn();

    vm.stopPrank();

    // Warp 1 second (would be expired without check-in)
    vm.warp(block.timestamp + 1);

    // Should still be alive
    assertTrue(heirlock.isOwnerAlive(owner));

    // Claim should fail
    vm.prank(beneficiary1);
    vm.expectRevert(Heirlock.OwnerStillAlive.selector);
    heirlock.claim(owner);
  }

  // ============ EDGE CASES ============

  function test_Claim_ZeroBalance() public {
    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);

    token1.approve(address(heirlock), type(uint256).max);

    // Transfer all tokens away
    token1.transfer(address(0xdead), token1.balanceOf(owner));

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares = new Heirlock.Share[](1);
    shares[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: 5000,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares);

    vm.stopPrank();

    vm.warp(block.timestamp + LIVENESS_DURATION + 1);

    vm.prank(beneficiary1);
    heirlock.claim(owner);

    // Should mark as claimed even with 0 amount
    Heirlock.Share memory share = heirlock.getAssetShare(owner, beneficiary1, address(token1));
    assertTrue(share.claimed);
    assertEq(token1.balanceOf(beneficiary1), 0);
  }

  function testFuzz_CreateWill_BpsTracking(uint256 bps1, uint256 bps2) public {
    vm.assume(bps1 <= 10000);
    vm.assume(bps2 <= 10000);
    vm.assume(bps1 + bps2 <= 10000);

    vm.startPrank(owner);

    heirlock.configureLiveness(LIVENESS_DURATION);
    token1.approve(address(heirlock), type(uint256).max);

    address[] memory assets = new address[](1);
    assets[0] = address(token1);

    Heirlock.Share[] memory shares1 = new Heirlock.Share[](1);
    shares1[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: bps1,
      claimed: false
    });

    heirlock.createWill(beneficiary1, assets, shares1);

    Heirlock.Share[] memory shares2 = new Heirlock.Share[](1);
    shares2[0] = Heirlock.Share({
      shareType: Heirlock.ShareType.BPS,
      shareAmount: bps2,
      claimed: false
    });

    heirlock.createWill(beneficiary2, assets, shares2);

    assertEq(heirlock.getAssetTotalAllocatedBps(owner, address(token1)), bps1 + bps2);

    vm.stopPrank();
  }
}
