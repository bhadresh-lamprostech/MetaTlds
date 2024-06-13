// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {IPriceOracle} from "../price-oracle/IPriceOracle.sol";
import {TldConfig, TldHook} from "../common/Struct.sol";

interface IRegistrarController {
    event SetQualificationHook(uint256 identifier, address hook);
    event SetPriceHook(uint256 identifier, address hook);
    event SetPointHook(uint256 identifier, address hook);
    event SetRewardHook(uint256 identifier, address hook);
    event SetRenewPriceHook(uint256 identifier, address hook);
    event SetRenewPointHook(uint256 identifier, address hook);
    event SetRenewRewardHook(uint256 identifier, address hook);

    event SetTldBase(uint256 identifier, address base);
    event SetTldPriceOracle(uint256 identifier, address priceOracle);

    event SetMinDomainLength(uint256 identifier, uint256 minDomainLength);
    event SetMaxDomainLength(uint256 identifier, uint256 maxDomainLength);
    event SetHasMintCap(uint256 identifier, bool hasMintCap);
    event SetMintCap(uint256 identifier, uint256 mintCap);
    event SetMinRegistrationDuration(
        uint256 identifier,
        uint256 minRegistrationDuration
    );

    event SetMinRenewDuration(uint256 identifier, uint256 minRenewDuration);
    event NameRegistered(
        uint256 identifier,
        string name,
        bytes32 indexed label,
        address indexed owner,
        uint256 baseCost,
        uint256 expires
    );

    event NameRenewed(
        uint256 identifier,
        string name,
        bytes32 indexed label,
        uint256 cost,
        uint256 expires
    );

    function available(
        uint256 identfier,
        string calldata name
    ) external view returns (bool);

    function rentPrice(
        uint256 identifier,
        string calldata name,
        uint256 duration
    ) external view returns (IPriceOracle.Price memory);

    function priceAfterDiscount(
        uint256 identifier,
        string calldata name,
        address buyer,
        uint256 duration,
        bytes calldata extraData
    ) external view returns (uint256);

    function bulkRegister(
        uint256 identifier,
        string[] calldata names,
        address owner,
        uint256 duration,
        address resolver,
        bool setTldName,
        bytes[] calldata extraData
    ) external payable returns (uint256);

    function bulkRenew(
        uint256 identifier,
        string[] calldata names,
        uint256 duration,
        bytes[] calldata extraData
    ) external payable returns (uint256);

    function setTldConfigs(
        uint256 identifier,
        TldConfig calldata _config
    ) external;

    function setTldHooks(
        uint256 identifier,
        address _qualificationHook,
        address _discountHook,
        address _rewardHook,
        address _renewPriceHook,
        address _renewRewardHook
    ) external;

    function setTldPriceOracle(
        uint256 identifier,
        address _priceOracle
    ) external;

    function setMinDomainLength(
        uint256 identifier,
        uint256 _minDomainLength
    ) external;

    function setMaxDomainLength(
        uint256 identifier,
        uint256 _maxDomainLength
    ) external;

    function setMintCap(uint256 identifier, uint256 _mintCap) external;

    function setMinRegistrationDuration(
        uint256 identifier,
        uint256 _minRegistrationDuration
    ) external;

    function setMinRenewDuration(
        uint256 identifier,
        uint256 _minRenewDuration
    ) external;

    function setQualificationHook(uint256 identifier, address _hook) external;

    function setPriceHook(uint256 identifier, address _hook) external;

    function setPointHook(uint256 identifier, address _hook) external;

    function setRewardHook(uint256 identifier, address _hook) external;

    function setRenewPriceHook(uint256 identifier, address _hook) external;

    function setRenewPointHook(uint256 identifier, address _hook) external;

    function setRenewRewardHook(uint256 identifier, address _hook) external;
}
