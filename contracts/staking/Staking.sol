// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Staking is Ownable {
    mapping(address => uint256) public stakes;
    mapping(address => uint256) public identifiers;
    uint256 public MINIMUM_STAKE;
    string[] public tldRegistered;

    event Staked(address indexed user, uint256 amount);
    event UnStake(address indexed user, uint256 amount);

    constructor(uint256 _minimumStake) {
        MINIMUM_STAKE = _minimumStake;
    }

    function stake(uint256 identifier, string calldata tld) external payable {
        require(msg.value >= MINIMUM_STAKE, "Insufficient staking amount");
        require(checkAvailability(tld), "TLD you're trying to register already exists");
        identifiers[msg.sender] = identifier;
        stakes[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function checkAvailability(string calldata tld) public view returns (bool) {
        bool isRegistered = false;
        for (uint i = 0; i < tldRegistered.length; i++) {
            if (keccak256(abi.encodePacked(tldRegistered[i])) == keccak256(abi.encodePacked(tld))) {
                isRegistered = true;
                break;
            }
        }
        return !isRegistered;
    }

    function getStakeDetails() external view returns (address owner, uint256 identifier, uint256 stakedAmount) {
        return (msg.sender, identifiers[msg.sender], stakes[msg.sender]);
    }

    function unStake() external {
        uint256 stakeAmount = stakes[msg.sender];
        require(stakeAmount > 0, "No stake to withdraw");
        stakes[msg.sender] = 0;
        payable(msg.sender).transfer(stakeAmount);
        emit UnStake(msg.sender, stakeAmount);
    }

    function setStakeLimit(uint256 amount) external onlyOwner{
        MINIMUM_STAKE = amount;
    }

    function hasStaked(address tldOwner) external view returns(bool isStaked){
        require(stakes[tldOwner] >= MINIMUM_STAKE, "You must stake the required amount of ETH");
        isStaked = true;
    }
}
