// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Local/testnet fixture with real payments and ERC721 ownership. Not a production NFT collection.
contract StudioCollectible {
    string public name = "Melt field notes";
    string public symbol = "NOTE";
    uint256 public constant price = 0.0001 ether;
    uint256 public totalSupply;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function mint() external payable returns (uint256 id) {
        require(msg.value == price, "Exact mint price required");
        id = ++totalSupply;
        ownerOf[id] = msg.sender;
        balanceOf[msg.sender]++;
        emit Transfer(address(0), msg.sender, id);
        if (msg.sender.code.length > 0) {
            (bool ok, bytes memory out) = msg.sender
                .call(
                    abi.encodeWithSignature(
                        "onERC721Received(address,address,uint256,bytes)", msg.sender, address(0), id, bytes("")
                    )
                );
            require(ok && abi.decode(out, (bytes4)) == 0x150b7a02);
        }
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        require(ownerOf[id] == from && msg.sender == from && to != address(0));
        ownerOf[id] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        emit Transfer(from, to, id);
        if (to.code.length > 0) {
            (bool ok, bytes memory out) = to.call(
                abi.encodeWithSignature(
                    "onERC721Received(address,address,uint256,bytes)", msg.sender, from, id, bytes("")
                )
            );
            require(ok && abi.decode(out, (bytes4)) == 0x150b7a02);
        }
    }
}
