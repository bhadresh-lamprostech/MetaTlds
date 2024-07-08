// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IStaking {
    function stake(uint256 identifier, string calldata tld) external payable;
    function checkAvailability(string calldata tld) external view returns (bool);
    function getStakeDetails() external view returns (address owner, uint256 identifier, uint256 stakedAmount);
    function unStake() external;
    function setStakeLimit(uint256 amount) external;
    function hasStaked(address tldOwner) external view returns (bool isStaked);
}
