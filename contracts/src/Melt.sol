// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Melt — transferable, expiring rights to a bounded service.
contract Melt {
    address public immutable operator;

    struct Lot {
        uint256 total;
        uint256 remaining;
        uint256 expiresAt;
        uint256 price;
    }

    struct Listing {
        address seller;
        uint256 lotId;
        uint256 units;
        uint256 price;
    }

    struct Job {
        address owner;
        uint256 lotId;
        uint8 status;
    }
    uint256 public lotCount;
    uint256 public listingCount;
    mapping(uint256 => Lot) public lots;
    mapping(uint256 => Listing) public listings;
    mapping(address => mapping(uint256 => uint256)) public balance;
    mapping(address => uint256) public proceeds;
    mapping(bytes32 => Job) public jobs;
    event Issued(uint256 indexed lotId, uint256 units, uint256 expiresAt);
    event Purchased(address indexed buyer, uint256 indexed lotId, uint256 units);
    event Listed(uint256 indexed listingId, address indexed seller, uint256 units);
    event Resold(uint256 indexed listingId, address indexed buyer, uint256 units);
    event JobChanged(bytes32 indexed jobId, uint8 status);
    modifier onlyOperator() {
        require(msg.sender == operator, "operator only");
        _;
    }

    constructor() {
        operator = msg.sender;
    }

    function issue(uint256 units, uint256 expiry, uint256 price) external onlyOperator {
        require(units > 0 && units <= 1000 && expiry > block.timestamp && price > 0, "invalid offer");
        lots[++lotCount] = Lot(units, units, expiry, price);
        emit Issued(lotCount, units, expiry);
    }

    function buy(uint256 id, uint256 units) external payable {
        Lot storage lot = lots[id];
        require(block.timestamp < lot.expiresAt, "expired");
        require(units > 0 && units <= lot.remaining, "capacity unavailable");
        require(msg.value == units * lot.price, "wrong payment");
        lot.remaining -= units;
        balance[msg.sender][id] += units;
        proceeds[operator] += msg.value;
        emit Purchased(msg.sender, id, units);
    }

    function list(uint256 id, uint256 units, uint256 price) external {
        require(block.timestamp < lots[id].expiresAt, "expired");
        require(units > 0 && balance[msg.sender][id] >= units && price > 0, "invalid listing");
        balance[msg.sender][id] -= units;
        listings[++listingCount] = Listing(msg.sender, id, units, price);
        emit Listed(listingCount, msg.sender, units);
    }

    function cancel(uint256 id) external {
        Listing storage item = listings[id];
        require(item.seller == msg.sender && item.units > 0, "not your listing");
        balance[msg.sender][item.lotId] += item.units;
        item.units = 0;
    }

    function take(uint256 id, uint256 units) external payable {
        Listing storage item = listings[id];
        require(block.timestamp < lots[item.lotId].expiresAt, "expired");
        require(units > 0 && units <= item.units && msg.sender != item.seller, "invalid purchase");
        require(msg.value == units * item.price, "wrong payment");
        item.units -= units;
        balance[msg.sender][item.lotId] += units;
        proceeds[item.seller] += msg.value;
        emit Resold(id, msg.sender, units);
    }

    function startJob(address owner, uint256 id, bytes32 jobId) external onlyOperator {
        require(jobs[jobId].status == 0, "job already used");
        require(block.timestamp < lots[id].expiresAt, "expired");
        require(balance[owner][id] > 0, "no capacity owned");
        balance[owner][id]--;
        jobs[jobId] = Job(owner, id, 1);
        emit JobChanged(jobId, 1);
    }

    function finishJob(bytes32 jobId, bool success) external onlyOperator {
        Job storage job = jobs[jobId];
        require(job.status == 1, "job not running");
        job.status = success ? 2 : 3;
        if (!success) balance[job.owner][job.lotId]++;
        emit JobChanged(jobId, job.status);
    }

    function withdraw() external {
        uint256 amount = proceeds[msg.sender];
        require(amount > 0, "nothing to withdraw");
        proceeds[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
