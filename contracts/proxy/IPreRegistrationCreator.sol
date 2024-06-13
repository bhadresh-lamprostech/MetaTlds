// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {PreRegistrationUpdateConfig} from "../common/Struct.sol";

interface IPreRegistrationCreator {
    event PreRegistrationStateCreated(
        address addr,
        address owner,
        uint256 identifier
    );
    event AuctionCreated(address addr, address owner, uint256 identifier);

    function create(
        address sann,
        uint256 identifier,
        address tldOwner,
        address controller,
        address platformConfig,
        address prepaidPlatformFee,
        PreRegistrationUpdateConfig calldata config
    ) external returns (address, address);

    function createAuction(
        address sann,
        uint256 identifier,
        address tldOwner,
        address controller,
        address platformConfig,
        address preRegiState,
        address prepaidPlatformFee
    ) external returns (address);
}
