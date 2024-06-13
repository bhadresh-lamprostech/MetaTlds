// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {IPlatformConfig} from "../admin/IPlatformConfig.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";


abstract contract TreasuryAccessableUpgradeable is Initializable {
    IPlatformConfig public platformConfig;

    function __TreasuryAccessable_init(IPlatformConfig _platformConfig) internal onlyInitializing {
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
