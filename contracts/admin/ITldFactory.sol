// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ReferralHub} from "../referral/ReferralHub.sol";
import {TldInitData} from "../common/Struct.sol";

interface ITldFactory {
    event NewDomainService(
        address creator,
        uint256 chainId,
        uint256 identifier,
        string tld,
        address controller,
        address base
    );

    event PreRegistrationCreated(
        address stateAddr,
        address auctionAddr,
        address owner,
        uint256 identifier
    );

    event SetDefaultPriceOracle(address defaultPriceOracle);

    function createDomainService(
        string calldata tld,
        address tldOwner,
        TldInitData calldata initData
    ) external returns (uint256 identifier);
}
