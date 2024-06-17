// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EthStaking {
    mapping(address => uint256) public stakes;
    mapping(address => uint256) public identifiers;
    uint256 public constant MINIMUM_STAKE = 1 ether;

    event Staked(address indexed user, uint256 amount);
    event UnStake(address indexed user, uint256 amount);

    // Function to stake ETH
    function stake(uint256 identifier) external payable {
        require(msg.value >= MINIMUM_STAKE, "Insufficient staking amount");
        identifiers[msg.sender] = identifier;
        stakes[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function getStakeDetails() hasStaked external view returns (address owner, uint256 identifier, uint256 stakedAmount) {
        return (msg.sender, identifiers[msg.sender], stakes[msg.sender]);
    }

    // Function to withdraw staked ETH
    function unStake() external {

        // ******** TO DO: ADD THE REQUIRE CONDITIONS FOR UNSTAKING ***********
        uint256 stakeAmount = stakes[msg.sender];
        require(stakeAmount > 0, "No stake to withdraw");
        stakes[msg.sender] = 0;
        payable(msg.sender).transfer(stakeAmount);
        emit UnStake(msg.sender, stakeAmount);
    }

    // Modifier to check if the user has staked the required amount
    modifier hasStaked() {
        require(stakes[msg.sender] >= MINIMUM_STAKE, "You must stake the required amount of ETH");
        _;
    }
}