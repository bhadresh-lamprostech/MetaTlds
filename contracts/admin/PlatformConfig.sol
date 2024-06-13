// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../common/AggregatorInterface.sol";
import "../access/TldAccessable.sol";
import "./IPlatformConfig.sol";
import "../admin/ISANN.sol";

contract PlatformConfig is IPlatformConfig, TldAccessable {
    uint256 public constant MAX_FEE_RATE_BPS = 10000; // 100%
    /// map identifier to CustomizedConfig.
    mapping(uint256 => CustomizedConfig) public customizedConfigs;
    /// the address for receiving platform fee.
    address public platformFeeCollector;
    /// the default minimum platform fee in USD .
    uint256 public defaultMinPlatformFee;
    /// the default fee rate in basis points.
    uint256 public defaultRateBps;

    constructor(ISANN _sann) TldAccessable(_sann) {}

    function initialize(
        uint256 _minPlatformFee,
        uint256 _rate,
        address _platformFeeCollector
    ) external onlyPlatformAdmin {
        defaultMinPlatformFee = _minPlatformFee;
        emit SetDefaultMinPlatformFee(defaultMinPlatformFee);

        require(_rate <= MAX_FEE_RATE_BPS, "invalid defaultRateBps");
        defaultRateBps = _rate;
        emit SetDefaultRateBps(defaultRateBps);

        platformFeeCollector = _platformFeeCollector;
        emit SetPlatformFeeCollector(platformFeeCollector);
    }

    /// set the default minimum platform fee in wei.
    function setDefaultMinPlatformFee(
        uint256 _minPlatformFee
    ) external onlyPlatformAdmin {
        defaultMinPlatformFee = _minPlatformFee;
        emit SetDefaultMinPlatformFee(defaultMinPlatformFee);
    }

    /// set default fee rate in basis points.
    function setDefaultRateBps(uint256 _rate) external onlyPlatformAdmin {
        require(_rate <= MAX_FEE_RATE_BPS, "invalid defaultRateBps");
        defaultRateBps = _rate;
        emit SetDefaultRateBps(defaultRateBps);
    }

    /// set the platform fee collector address.
    function setPlatformFeeCollector(
        address _platformFeeCollector
    ) external onlyPlatformAdmin {
        platformFeeCollector = _platformFeeCollector;
        emit SetPlatformFeeCollector(platformFeeCollector);
    }

    /// set the customized config for @param _identifier.
    function setCustomizedPlatformFee(
        uint256 _identifier,
        uint256 _minPlatformFee,
        uint256 _rate,
        bool _enabled
    ) external onlyPlatformAdmin {
        customizedConfigs[_identifier].minPlatformFee = _minPlatformFee;
        customizedConfigs[_identifier].feeRateBps = _rate;
        customizedConfigs[_identifier].enabled = _enabled;
        emit SetCustomizedPlatformFee(
            _identifier,
            _minPlatformFee,
            _rate,
            _enabled
        );
    }

    /// compute the platform fee in wei for @param identifier.
    function computePlatformFee(
        uint256 identifier,
        uint256 cost
    ) public view returns (uint256) {
        uint256 rate = getPlatformFeeRateBps(identifier);
        uint256 minPlatformFee = getMinPlatformFee(identifier);
        uint256 platformFee = (cost * rate) / MAX_FEE_RATE_BPS;
        return platformFee < minPlatformFee ? minPlatformFee : platformFee;
    }

    function computeBasicPlatformFee(
        uint256 identifier,
        uint256 cost
    ) public view returns (uint256) {
        uint256 rate = getPlatformFeeRateBps(identifier);
        uint256 platformFee = (cost * rate) / MAX_FEE_RATE_BPS;
        return platformFee;
    }

    /// @return minimum_platform_fee in USD for @param identifier.
    function getMinPlatformFee(
        uint256 identifier
    ) public view returns (uint256) {
        uint256 minFee = defaultMinPlatformFee;
        if (customizedConfigs[identifier].enabled) {
            minFee = customizedConfigs[identifier].minPlatformFee;
        }
        return minFee;
    }

    /// @return fee rate in basis points for @param identifier.
    function getPlatformFeeRateBps(
        uint256 identifier
    ) public view returns (uint256) {
        uint256 rate = defaultRateBps;
        if (customizedConfigs[identifier].enabled) {
            rate = customizedConfigs[identifier].feeRateBps;
        }
        return rate;
    }
}
