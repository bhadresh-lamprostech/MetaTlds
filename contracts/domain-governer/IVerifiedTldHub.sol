// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVerifiedTldHub {

    function updateTldInfo(string calldata tld, uint256 identifier, uint256 chainId, address registry, string calldata defaultRpc) external;

    function removeTldInfo(uint256 chainId, string memory tld) external;

    function getChainTlds(uint256 chainId) external view returns (string[] memory);

    function updateChainInfo(uint256 chainId, string calldata defaultRpc, address registry, address sann) external;

    function updateDefaultRpc(uint256 chainId, string calldata defaultRpc) external;

}
