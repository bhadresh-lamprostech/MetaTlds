// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../common/AggregatorInterface.sol";
import "../access/TldAccessable.sol";

/// IPlatformConfig is the interface to manage the platform configuration.
interface IPlatformConfig {
    event SetDefaultMinPlatformFee(
        uint256 defaultMinPlatformFee
    );

    event SetDefaultRateBps(
        uint256 defaultRateBps
    );

    event SetPlatformFeeCollector(
        address platformFeeCollector
    );

    event SetCustomizedPlatformFee(
        uint256 identifier,
        uint256 minPlatformFee,
        uint256 feeRateBps,
        bool enabled
    );

    /// custom config for each TLD of platform fee.
    struct CustomizedConfig {
        uint256 minPlatformFee; // in wei
        uint256 feeRateBps; //  fee rate in basis points, e.g. 10000 = 100%, 150 = 1.5%
        bool enabled; // to distinguish whether the config is initialized or not
    }

    /// compute the platform fee in wei for @param identifier.
    function computePlatformFee(
        uint256 identifier,
        uint256 cost
    ) external view returns (uint256);

    /// compute the platform fee in wei for @param identifier.
    /// no guarantee for minimum_platform_fee
    function computeBasicPlatformFee(
        uint256 identifier,
        uint256 cost
    ) external view returns (uint256);

    /// @return minimum_platform_fee in ETH wei for @param identifier.
    function getMinPlatformFee(
        uint256 identifier
    ) external view returns (uint256);

    /// @return fee rate in basis points for @param identifier.
    function getPlatformFeeRateBps(
        uint256 identifier
    ) external view returns (uint256);

    /// @return platform_fee_collector_address.
    function platformFeeCollector() external view returns (address);
}
