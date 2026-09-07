// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "../src/Melt.sol";

interface Vm {
    function prank(address) external;
    function deal(address, uint256) external;
    function warp(uint256) external;
    function expectRevert() external;
}

contract MeltTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Melt melt;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        melt = new Melt();
        melt.issue(20, block.timestamp + 3600, 1 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function testBuyConsumeResellAndRejectFormerOwner() public {
        vm.prank(alice);
        melt.buy{value: 10 ether}(1, 10);
        for (uint256 i; i < 3; i++) {
            melt.startJob(alice, 1, bytes32(i + 1));
            melt.finishJob(bytes32(i + 1), true);
        }
        vm.prank(alice);
        melt.list(1, 7, 0.5 ether);
        vm.prank(bob);
        melt.take{value: 3.5 ether}(1, 7);
        require(melt.balance(alice, 1) == 0 && melt.balance(bob, 1) == 7);
        vm.expectRevert();
        melt.startJob(alice, 1, bytes32(uint256(8)));
        melt.startJob(bob, 1, bytes32(uint256(9)));
        melt.finishJob(bytes32(uint256(9)), true);
        require(melt.balance(bob, 1) == 6 && melt.proceeds(alice) == 3.5 ether);
    }

    function testExpiry() public {
        vm.prank(alice);
        melt.buy{value: 1 ether}(1, 1);
        vm.warp(block.timestamp + 3601);
        vm.expectRevert();
        melt.startJob(alice, 1, bytes32(uint256(1)));
        vm.expectRevert();
        vm.prank(bob);
        melt.buy{value: 1 ether}(1, 1);
    }

    function testRefundAndReplay() public {
        vm.prank(alice);
        melt.buy{value: 1 ether}(1, 1);
        melt.startJob(alice, 1, bytes32(uint256(1)));
        melt.finishJob(bytes32(uint256(1)), false);
        require(melt.balance(alice, 1) == 1);
        vm.expectRevert();
        melt.startJob(alice, 1, bytes32(uint256(1)));
    }

    function testEscrowAndCancel() public {
        vm.prank(alice);
        melt.buy{value: 2 ether}(1, 2);
        vm.prank(alice);
        melt.list(1, 2, 1 ether);
        vm.expectRevert();
        melt.startJob(alice, 1, bytes32(uint256(1)));
        vm.prank(alice);
        melt.cancel(1);
        require(melt.balance(alice, 1) == 2);
    }

    function testUnauthorizedWorker() public {
        vm.expectRevert();
        vm.prank(bob);
        melt.startJob(alice, 1, bytes32(uint256(1)));
    }

    function testWithdrawResaleProceeds() public {
        vm.prank(alice);
        melt.buy{value: 2 ether}(1, 2);
        vm.prank(alice);
        melt.list(1, 2, 0.5 ether);
        vm.prank(bob);
        melt.take{value: 1 ether}(1, 2);
        uint256 beforeBalance = alice.balance;
        vm.prank(alice);
        melt.withdraw();
        require(alice.balance == beforeBalance + 1 ether && melt.proceeds(alice) == 0);
        vm.expectRevert();
        vm.prank(alice);
        melt.withdraw();
    }

    function testRejectUnderpaymentAndExpiredResale() public {
        vm.expectRevert();
        vm.prank(alice);
        melt.buy{value: 1 ether}(1, 2);
        vm.prank(alice);
        melt.buy{value: 2 ether}(1, 2);
        vm.prank(alice);
        melt.list(1, 2, 0.5 ether);
        vm.warp(block.timestamp + 3601);
        vm.expectRevert();
        vm.prank(bob);
        melt.take{value: 1 ether}(1, 2);
    }

    function testFuzzPartialTransferConservesCapacity(uint8 input) public {
        uint256 units = uint256(input) % 20 + 1;
        vm.prank(alice);
        melt.buy{value: units * 1 ether}(1, units);
        vm.prank(alice);
        melt.list(1, units, 0.5 ether);
        uint256 taken = units / 2 + 1;
        vm.prank(bob);
        melt.take{value: taken * 0.5 ether}(1, taken);
        (,, uint256 listed,) = melt.listings(1);
        (, uint256 unsold,,) = melt.lots(1);
        require(melt.balance(alice, 1) + melt.balance(bob, 1) + listed + unsold == 20);
    }
}
