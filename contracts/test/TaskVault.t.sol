// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "../src/TaskVault.sol";
import "../src/StudioCollectible.sol";

interface VaultVm {
    function prank(address) external;
    function deal(address, uint256) external;
    function warp(uint256) external;
    function expectRevert() external;
}

contract RecoveryToken {
    mapping(address => uint256) public balanceOf;
    bool public fail;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFail(bool value) external {
        fail = value;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (fail) return false;
        require(balanceOf[msg.sender] >= amount);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract TaskVaultTest {
    VaultVm constant vm = VaultVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    TaskVault vault;
    StudioCollectible note;
    address owner = address(0xA11CE);
    address agent = address(0xB0B);

    function setUp() public {
        note = new StudioCollectible();
        address[] memory targets = new address[](1);
        targets[0] = address(note);
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = note.mint.selector;
        vault = new TaskVault(owner, agent, 0.0002 ether, block.timestamp + 900, targets, selectors);
        vm.deal(address(vault), 1 ether);
    }

    function mintOne() internal {
        vm.prank(agent);
        vault.execute(address(note), 0.0001 ether, abi.encodeCall(note.mint, ()));
    }

    function testMintCloseAndReturn() public {
        mintOne();
        require(note.ownerOf(1) == address(vault));
        vm.prank(agent);
        vault.close();
        vm.prank(agent);
        vault.recoverERC721(address(note), 1);
        vm.prank(agent);
        vault.recoverNative();
        require(note.ownerOf(1) == owner && owner.balance == 1 ether - 0.0001 ether && address(vault).balance == 0);
    }

    function testAgentCannotSpendAfterClose() public {
        vm.prank(owner);
        vault.close();
        vm.expectRevert();
        mintOne();
    }

    function testCumulativeCapEvenWithExtraDeposit() public {
        mintOne();
        mintOne();
        vm.expectRevert();
        mintOne();
        require(vault.spent() == 0.0002 ether);
    }

    function testOwnerRecoverySurvivesExpiryAndNewDeposit() public {
        vm.warp(block.timestamp + 901);
        vault.close();
        vm.deal(address(vault), 2 ether);
        vm.prank(owner);
        vault.recoverNative();
        require(owner.balance == 2 ether);
    }

    function testUnauthorizedCaller() public {
        vm.expectRevert();
        vault.execute(address(note), 0.0001 ether, abi.encodeCall(note.mint, ()));
    }

    function testRejectWrongFunctionAndContract() public {
        vm.expectRevert();
        vm.prank(agent);
        vault.execute(address(note), 0, hex"095ea7b3");
        vm.expectRevert();
        vm.prank(agent);
        vault.execute(owner, 0, abi.encodeCall(note.mint, ()));
    }

    function testRecoveryRequiresClosure() public {
        vm.expectRevert();
        vm.prank(owner);
        vault.recoverNative();
    }

    function testRevertedCallDoesNotConsumeAllowance() public {
        vm.expectRevert();
        vm.prank(agent);
        vault.execute(address(note), 1, abi.encodeCall(note.mint, ()));
        require(vault.spent() == 0);
    }

    function testFuzzAllowanceCannotBeExceeded(uint96 extra) public {
        vm.deal(address(vault), uint256(extra) + 1 ether);
        mintOne();
        mintOne();
        vm.expectRevert();
        mintOne();
        require(vault.spent() <= vault.budget());
    }

    function testERC20RecoveryAndLateDeposit() public {
        RecoveryToken token = new RecoveryToken();
        token.mint(address(vault), 100);
        vm.prank(owner);
        vault.close();
        vm.prank(agent);
        vault.recoverERC20(address(token));
        require(token.balanceOf(owner) == 100);
        token.mint(address(vault), 20);
        vm.prank(owner);
        vault.recoverERC20(address(token));
        require(token.balanceOf(owner) == 120);
    }

    function testAssetTransferFailureCannotKeepExecutionOpen() public {
        RecoveryToken token = new RecoveryToken();
        token.mint(address(vault), 100);
        token.setFail(true);
        vm.prank(owner);
        vault.close();
        vm.expectRevert();
        vm.prank(agent);
        vault.recoverERC20(address(token));
        require(vault.closed());
        vm.expectRevert();
        mintOne();
        token.setFail(false);
        vm.prank(owner);
        vault.recoverERC20(address(token));
        require(token.balanceOf(owner) == 100);
    }

    function testStrangerCannotRecoverOrRedirect() public {
        vm.prank(owner);
        vault.close();
        vm.expectRevert();
        vault.recoverNative();
        require(address(vault).balance == 1 ether);
    }
}
