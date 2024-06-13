// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBaseCreator {
    function create(
        address registry,
        uint256 identifier,
        string calldata tld,
        string calldata baseUri
    ) external returns (address);
}
