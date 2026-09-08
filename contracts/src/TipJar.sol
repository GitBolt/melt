// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Local/testnet payable kiosk. Not a production payment contract.
contract TipJar {
    event Tipped(address indexed from, uint256 amount);

    function tip() external payable {
        require(msg.value > 0, "Send a tip");
        emit Tipped(msg.sender, msg.value);
    }
}
