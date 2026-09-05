// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20Minimal {
    function transfer(address, uint256) external returns (bool);
}

interface IERC721Minimal {
    function safeTransferFrom(address, address, uint256) external;
}

/// @notice One task, a fixed native-token allowance, and a permanent owner recovery path.
/// No delegatecall, approvals, arbitrary signatures, or mutable permissions.
contract TaskVault {
    address public immutable owner;
    address public immutable agent;
    uint256 public immutable budget;
    uint256 public immutable expiresAt;
    uint256 public spent;
    bool public closed;
    bool private entered;
    mapping(address => mapping(bytes4 => bool)) public permitted;
    error Unauthorized();
    error Inactive();
    error OutsidePermission();
    error OverBudget();
    error TransferFailed();
    error Reentrancy();
    event Executed(address indexed target, bytes4 selector, uint256 value);
    event Closed(address indexed owner);
    event Recovered(address indexed asset, uint256 amountOrId);
    modifier lock() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address owner_,
        address agent_,
        uint256 budget_,
        uint256 expires_,
        address[] memory targets,
        bytes4[] memory selectors
    ) payable {
        require(
            owner_ != address(0) && agent_ != address(0) && budget_ > 0 && expires_ > block.timestamp
                && targets.length == selectors.length && targets.length > 0
        );
        owner = owner_;
        agent = agent_;
        budget = budget_;
        expiresAt = expires_;
        for (uint256 i; i < targets.length; i++) {
            bytes4 s = selectors[i];
            // Never give a task a persistent token allowance or delegation capability.
            require(
                targets[i] != address(0) && s != 0x095ea7b3 && s != 0xa22cb465 && s != 0xd505accf && s != 0x23b872dd
                    && s != 0xa9059cbb
            );
            permitted[targets[i]][s] = true;
        }
    }
    receive() external payable {}

    function execute(address target, uint256 value, bytes calldata data) external lock returns (bytes memory result) {
        if (msg.sender != agent) revert Unauthorized();
        if (closed || block.timestamp >= expiresAt) revert Inactive();
        if (data.length < 4 || !permitted[target][bytes4(data[:4])] || target == address(this)) revert OutsidePermission();
        if (value > budget - spent) revert OverBudget();
        spent += value;
        (bool ok, bytes memory out) = target.call{value: value}(data);
        if (!ok) assembly { revert(add(out, 32), mload(out)) }
        emit Executed(target, bytes4(data[:4]), value);
        return out;
    }

    function close() external lock {
        if (msg.sender != owner && msg.sender != agent && block.timestamp < expiresAt) revert Unauthorized();
        closed = true;
        emit Closed(owner);
    }

    // Closing never depends on an asset transfer succeeding. Recovery is independently retryable.
    function recoverNative() external lock {
        _recoverable();
        uint256 amount = address(this).balance;
        (bool ok,) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Recovered(address(0), amount);
    }

    function recoverERC20(address token) external lock {
        _recoverable();
        (bool readOk, bytes memory data) =
            token.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
        require(readOk && data.length >= 32);
        uint256 amount = abi.decode(data, (uint256));
        (bool ok, bytes memory out) = token.call(abi.encodeCall(IERC20Minimal.transfer, (owner, amount)));
        if (!ok || (out.length > 0 && !abi.decode(out, (bool)))) revert TransferFailed();
        emit Recovered(token, amount);
    }

    function recoverERC721(address token, uint256 tokenId) external lock {
        _recoverable();
        IERC721Minimal(token).safeTransferFrom(address(this), owner, tokenId);
        emit Recovered(token, tokenId);
    }

    function _recoverable() private view {
        if (!closed) revert Inactive();
        if (msg.sender != owner && msg.sender != agent) revert Unauthorized();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
