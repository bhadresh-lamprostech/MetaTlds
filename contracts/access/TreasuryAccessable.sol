// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {IPlatformConfig} from "../admin/IPlatformConfig.sol";


abstract contract TreasuryAccessable {
    IPlatformConfig public platformConfig;

    constructor(IPlatformConfig _platformConfig) {
        platformConfig = _platformConfig;
    }

    /// require the caller is the platform fee collector
    modifier onlyPlatformFeeCollector() {
        require(
            platformConfig.platformFeeCollector() == msg.sender,
            "Ownable: caller is not the platform fee collector"
        );
        _;
    }
}
