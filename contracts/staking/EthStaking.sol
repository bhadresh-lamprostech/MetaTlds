// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


// import {TldAccessable} from "../access/TldAccessable.sol";

contract EthStaking {
    mapping(address => uint256) public stakes;
    mapping(address => uint256) public identifiers;
    uint256 public MINIMUM_STAKE = 1 ether;

    string[] public tldList = ['eth', 'blockchain', 'crypto', 'mode', 'sol', 'op', 'arb'];

    event Staked(address indexed user, uint256 amount);
    event UnStake(address indexed user, uint256 amount);

    //  function
    // function updateStakeLimit(uint256 newLimit) onlyPlatformAdmin() external {
    //     MINIMUM_STAKE = newLimit;
    // }

    // Function to stake ETH
    function stake(uint256 identifier, string calldata tld) external payable {
        require(msg.value >= MINIMUM_STAKE, "Insufficient staking amount");
        require(!isTldRegistered(tld), "TLD you're trying to register already exists");
        identifiers[msg.sender] = identifier;
        stakes[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    // Function to check if TLD is already registered
    function isTldRegistered(string calldata tld) internal view returns (bool) {
        for (uint i = 0; i < tldList.length; i++) {
            if (keccak256(abi.encodePacked(tldList[i])) == keccak256(abi.encodePacked(tld))) {
                return true;
            }
        }
        return false;
    }

    

    function getStakeDetails() external view returns (address owner, uint256 identifier, uint256 stakedAmount) {
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