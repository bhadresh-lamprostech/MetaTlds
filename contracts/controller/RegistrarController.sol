// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {RegInfo} from "../common/Struct.sol";
import {StringUtils} from "../common/StringUtils.sol";
import {Base} from "../base/Base.sol";
import {IPriceOracle} from "../price-oracle/IPriceOracle.sol";
import {IRegistrarController} from "./IRegistrarController.sol";
import {IPlatformConfig} from "../admin/IPlatformConfig.sol";
import {IPrepaidPlatformFee} from "../admin/IPrepaidPlatformFee.sol";
import {ISANN} from "../admin/SANN.sol";
import {Resolver} from "../resolvers/Resolver.sol";
import {INameResolver} from "../resolvers/profiles/INameResolver.sol";
import {IQualificationHook} from "../hook/IQualificationHook.sol";
import {IPriceHook} from "../hook/IPriceHook.sol";
import {IPointHook} from "../hook/IPointHook.sol";
import {IRewardHook} from "../hook/IRewardHook.sol";
import {IRenewPriceHook} from "../hook/IRenewPriceHook.sol";
import {IRenewPointHook} from "../hook/IRenewPointHook.sol";
import {IRenewRewardHook} from "../hook/IRenewRewardHook.sol";
import {TldConfig, TldHook} from "../common/Struct.sol";
import {TldAccessableUpgradeable} from "../access/TldAccessableUpgradeable.sol";
import {TreasuryAccessableUpgradeable} from "../access/TreasuryAccessableUpgradeable.sol";
import {IReverseRegistrar} from "../registrar/IReverseRegistrar.sol";
error DurationTooShort(uint256 identifier, uint256 duration);
error NameNotAvailable(uint256 identifier, string name);
error InsufficientValue();
error NotQualifiedRegister();
error SimulatePrice(uint256 realPrice);

contract RegistrarController is
    IRegistrarController,
    UUPSUpgradeable,
    Initializable,
    TldAccessableUpgradeable,
    TreasuryAccessableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using StringUtils for string;

    mapping(uint256 => TldConfig) public tldConfigs;
    mapping(uint256 => TldHook) public tldHooks;

    /// price oracle contract that can be customized by TLD owner.
    mapping(uint256 => IPriceOracle) public tldPriceOracles;

    /// prepaid platform fee contract that can be used to pay platform fee for users.
    IPrepaidPlatformFee public prepaidPlatformFee;

    /// revenue for tlds in wei
    mapping(uint256 => uint256) public tldRevenues;

    /// platform fee balance
    uint256 public platformFeeBalance;

    /// default price oracle
    IPriceOracle public defaultPriceOracle;

    /// reverse registrar contract
    IReverseRegistrar public reverseRegistrar;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        ISANN _sann,
        IPlatformConfig _platformConfig,
        IPrepaidPlatformFee _prepaidPlatformFee,
        IPriceOracle _priceOracle,
        IReverseRegistrar _reverseRegistrar
    ) external initializer {
        prepaidPlatformFee = _prepaidPlatformFee;
        defaultPriceOracle = _priceOracle;
        reverseRegistrar = _reverseRegistrar;
        __TldAccessable_init(_sann);
        __TreasuryAccessable_init(_platformConfig);
        __ReentrancyGuard_init();
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyPlatformAdmin {}

    function setTldConfigs(
        uint256 identifier,
        TldConfig calldata _config
    ) public onlyTldOwner(identifier) {
        setMaxDomainLength(identifier, _config.maxDomainLength);
        setMinDomainLength(identifier, _config.minDomainLength);
        setMintCap(identifier, _config.mintCap);
        setMinRegistrationDuration(identifier, _config.minRegistrationDuration);
        setMinRenewDuration(identifier, _config.minRenewDuration);
    }

    function setTldHooks(
        uint256 identifier,
        address _qualificationHook,
        address _priceHook,
        address _rewardHook,
        address _renewPriceHook,
        address _renewRewardHook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.qualificationHook = IQualificationHook(_qualificationHook);
        hook.priceHook = IPriceHook(_priceHook);
        hook.rewardHook = IRewardHook(_rewardHook);
        hook.renewPriceHook = IRenewPriceHook(_renewPriceHook);
        hook.renewRewardHook = IRenewRewardHook(_renewRewardHook);

        emit SetQualificationHook(identifier, _qualificationHook);
        emit SetPriceHook(identifier, _priceHook);
        emit SetRewardHook(identifier, _rewardHook);
        emit SetRenewPriceHook(identifier, _renewPriceHook);
        emit SetRenewRewardHook(identifier, _renewRewardHook);
    }

    function setTldPriceOracle(
        uint256 identifier,
        address priceOracle
    ) public onlyTldOwner(identifier) {
        tldPriceOracles[identifier] = IPriceOracle(priceOracle);
        emit SetTldPriceOracle(identifier, priceOracle);
    }

    function setMinDomainLength(
        uint256 identifier,
        uint256 _minDomainLength
    ) public onlyTldOwner(identifier) {
        TldConfig storage config = tldConfigs[identifier];
        require(
            _minDomainLength > 0 && _minDomainLength <= config.maxDomainLength,
            "minDomainLength must be less or equal to maxDomainLength"
        );
        config.minDomainLength = _minDomainLength;

        emit SetMinDomainLength(identifier, _minDomainLength);
    }

    function setMaxDomainLength(
        uint256 identifier,
        uint256 _maxDomainLength
    ) public onlyTldOwner(identifier) {
        TldConfig storage config = tldConfigs[identifier];
        require(
            _maxDomainLength >= config.minDomainLength,
            "maxDomainLength must be greater or equal to minDomainLength"
        );
        config.maxDomainLength = _maxDomainLength;

        emit SetMaxDomainLength(identifier, _maxDomainLength);
    }

    function setMintCap(
        uint256 identifier,
        uint256 _mintCap
    ) public onlyTldOwner(identifier) {
        TldConfig storage config = tldConfigs[identifier];
        if (_mintCap > 0) {
            config.mintCap = _mintCap;
        } else {
            // mintCap == 0 means no limitation
            config.mintCap = type(uint256).max;
        }

        emit SetMintCap(identifier, _mintCap);
    }

    function setMinRegistrationDuration(
        uint256 identifier,
        uint256 _minRegistrationDuration
    ) public onlyTldOwner(identifier) {
        TldConfig storage config = tldConfigs[identifier];
        config.minRegistrationDuration = _minRegistrationDuration;

        emit SetMinRegistrationDuration(identifier, _minRegistrationDuration);
    }

    function setMinRenewDuration(
        uint256 identifier,
        uint256 _minRenewDuration
    ) public onlyTldOwner(identifier) {
        TldConfig storage config = tldConfigs[identifier];
        config.minRenewDuration = _minRenewDuration;

        emit SetMinRenewDuration(identifier, _minRenewDuration);
    }

    function setQualificationHook(
        uint256 identifier,
        address _hook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.qualificationHook = IQualificationHook(_hook);
        emit SetQualificationHook(identifier, _hook);
    }

    function setPriceHook(
        uint256 identifier,
        address _hook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.priceHook = IPriceHook(_hook);
        emit SetPriceHook(identifier, _hook);
    }

    function setPointHook(
        uint256 identifier,
        address _hook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.pointHook = IPointHook(_hook);
        emit SetPointHook(identifier, _hook);
    }

    function setRewardHook(
        uint256 identifier,
        address _hook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.rewardHook = IRewardHook(_hook);
        emit SetRewardHook(identifier, _hook);
    }

    function setRenewPriceHook(
        uint256 identifier,
        address _hook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.renewPriceHook = IRenewPriceHook(_hook);
        emit SetRenewPriceHook(identifier, _hook);
    }

    function setRenewPointHook(
        uint256 identifier,
        address _hook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.renewPointHook = IRenewPointHook(_hook);
        emit SetRenewPointHook(identifier, _hook);
    }

    function setRenewRewardHook(
        uint256 identifier,
        address _hook
    ) public onlyTldOwner(identifier) {
        TldHook storage hook = tldHooks[identifier];
        hook.renewRewardHook = IRenewRewardHook(_hook);
        emit SetRenewRewardHook(identifier, _hook);
    }

    // to receive refund from RewardHook
    receive() external payable {}

    /**
     * @notice Recover ERC20 tokens sent to the contract by mistake.
     * @dev The contract is Ownable and only the platform admin can call the recover function.
     * @param _to The address to send the tokens to.
     * @param _token The address of the ERC20 token to recover
     * @param _amount The amount of tokens to recover.
     */
    function recoverFunds(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyPlatformAdmin {
        IERC20(_token).transfer(_to, _amount);
    }

    function withdraw(uint256 identifier) public onlyTldOwner(identifier) {
        uint256 balance = tldRevenues[identifier];
        tldRevenues[identifier] = 0;
        require(balance > 0, "insufficient revenue");
        (bool sent, ) = msg.sender.call{value: balance}("");
        require(sent, "Failed to send Ether");
    }

    function withdrawPlatformFee() public onlyPlatformFeeCollector {
        uint256 amount = platformFeeBalance;
        platformFeeBalance = 0;
        require(amount > 0, "insufficient fee");
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Failed to send Ether");
    }

    function getPriceOracle(
        uint256 identifier
    ) public view returns (IPriceOracle) {
        IPriceOracle customizedPriceOracle = tldPriceOracles[identifier];
        if (address(customizedPriceOracle) == address(0)) {
            return defaultPriceOracle;
        } else {
            return customizedPriceOracle;
        }
    }

    /**
     * @dev return the price of a domain
     * @param identifier The identifier of TLD
     * @param name domain name ex: eddie
     * @param duration registration duration in seconds
     * @return price price of the domain in native token in USD
     */
    function rentPriceInUSD(
        uint256 identifier,
        string calldata name,
        uint256 duration
    ) public view returns (IPriceOracle.Price memory price) {
        IPriceOracle priceOracle = getPriceOracle(identifier);
        price = priceOracle.price(name, block.timestamp, duration, identifier);
    }

    // @dev return the price of a domain in wei
    function rentPrice(
        uint256 identifier,
        string calldata name,
        uint256 duration
    ) public view override returns (IPriceOracle.Price memory price) {
        IPriceOracle priceOracle = getPriceOracle(identifier);
        price = priceOracle.priceInWei(
            name,
            block.timestamp,
            duration,
            identifier
        );
    }

    function bulkRentPrice(
        uint256 identifier,
        string[] calldata names,
        uint256 duration
    ) public view returns (uint256 total) {
        for (uint256 i = 0; i < names.length; i++) {
            IPriceOracle.Price memory price = rentPrice(
                identifier,
                names[i],
                duration
            );
            total += (price.base + price.premium);
        }
    }

    function bulkRegisterSimulate(
        uint256 identifier,
        string[] calldata names,
        address owner,
        uint256 duration,
        address resolver,
        bool setTldName,
        bytes[] calldata extraData
    ) external payable returns (uint256) {
        require(msg.sender == address(0));
        RegInfo memory regInfo = RegInfo(
            owner, // use owner instead of msg.sender to meet qualifications
            owner,
            duration,
            resolver,
            setTldName
        );
        (uint256 totalRevenue, uint256 totalPlatformFee) = _bulkRegister(
            identifier,
            names,
            regInfo,
            extraData
        );

        uint256 total = _distributeFunds(
            identifier,
            totalRevenue,
            totalPlatformFee
        );

        // always revert the simulation
        revert SimulatePrice(total);
    }

    function bulkRenewSimulate(
        uint256 identifier,
        string[] calldata names,
        uint256 duration,
        address initiatedBy,
        bytes[] calldata extraData
    ) external payable returns (uint256) {
        require(msg.sender == address(0));
        uint256 totalPlatformFee;
        uint256 totalRevenue;
        for (uint256 i = 0; i < names.length; i++) {
            uint256 revenue;
            uint256 platformFee;
            if (extraData.length == names.length) {
                (revenue, platformFee) = _renew(
                    identifier,
                    names[i],
                    duration,
                    initiatedBy,
                    extraData[i]
                );
            } else {
                (revenue, platformFee) = _renew(
                    identifier,
                    names[i],
                    duration,
                    initiatedBy,
                    extraData[0]
                );
            }
            totalRevenue += revenue;
            totalPlatformFee += platformFee;
        }

        uint256 total = _distributeFunds(
            identifier,
            totalRevenue,
            totalPlatformFee
        );

        // always revert the simulation
        revert SimulatePrice(total);
    }

    /**
     * @dev return the price of a domain after discount in WEI
     * @param identifier The identifier of TLD
     * @param _name domain name ex: eddie
     * @param _buyer the address to do the registration
     * @param _duration registration duration in seconds
     * @return cost actual paid in USD to register the name
     */
    function priceAfterDiscount(
        uint256 identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        bytes calldata _extraData
    ) external view override returns (uint256 cost) {
        {
            IPriceOracle.Price memory price = rentPriceInUSD(
                identifier,
                _name,
                _duration
            );
            cost = price.base + price.premium;
        }

        TldHook storage hook = tldHooks[identifier];
        // discount hook allows TLD owner to discount the price.
        if (address(hook.priceHook) != address(0)) {
            // update cost
            cost = hook.priceHook.calcNewPrice(
                identifier,
                _name,
                _buyer,
                _duration,
                cost,
                _extraData
            );
        }
        IPriceOracle priceOracle = getPriceOracle(identifier);
        return priceOracle.attoUSDToWei(cost);
    }

    // bulk register names.
    function bulkRegister(
        uint256 identifier,
        string[] calldata names,
        address owner,
        uint256 duration,
        address resolver,
        bool setTldName,
        bytes[] calldata extraData
    ) external payable returns (uint256) {
        RegInfo memory regInfo = RegInfo(
            msg.sender,
            owner,
            duration,
            resolver,
            setTldName
        );
        (uint256 totalRevenue, uint256 totalPlatformFee) = _bulkRegister(
            identifier,
            names,
            regInfo,
            extraData
        );

        uint256 total = _distributeFunds(
            identifier,
            totalRevenue,
            totalPlatformFee
        );

        return total;
    }

    function _bulkRegister(
        uint256 identifier,
        string[] calldata names,
        RegInfo memory regInfo,
        bytes[] calldata extraData
    ) internal returns (uint256 totalRevenue, uint256 totalPlatformFee) {
        for (uint256 i = 0; i < names.length; i++) {
            uint256 revenue;
            uint256 platformFee;
            if (extraData.length == names.length) {
                (revenue, platformFee) = _registerWithConfig(
                    identifier,
                    names[i],
                    regInfo,
                    extraData[i]
                );
            } else {
                (revenue, platformFee) = _registerWithConfig(
                    identifier,
                    names[i],
                    regInfo,
                    extraData[0]
                );
            }

            totalRevenue += revenue;
            totalPlatformFee += platformFee;
        }
    }

    function bulkRenew(
        uint256 identifier,
        string[] calldata names,
        uint256 duration,
        bytes[] calldata extraData
    ) external payable returns (uint256) {
        uint256 totalPlatformFee;
        uint256 totalRevenue;
        for (uint256 i = 0; i < names.length; i++) {
            uint256 revenue;
            uint256 platformFee;
            if (extraData.length == names.length) {
                (revenue, platformFee) = _renew(
                    identifier,
                    names[i],
                    duration,
                    msg.sender,
                    extraData[i]
                );
            } else {
                (revenue, platformFee) = _renew(
                    identifier,
                    names[i],
                    duration,
                    msg.sender,
                    extraData[0]
                );
            }
            totalRevenue += revenue;
            totalPlatformFee += platformFee;
        }

        uint256 total = _distributeFunds(
            identifier,
            totalRevenue,
            totalPlatformFee
        );

        return total;
    }

    function _distributeFunds(
        uint256 identifier,
        uint256 totalRevenue,
        uint256 totalPlatformFee
    ) internal returns (uint256) {
        IPriceOracle priceOracle = getPriceOracle(identifier);

        // check value
        // and refund any extra payment
        uint256 total = priceOracle.attoUSDToWei(
            totalRevenue + totalPlatformFee
        );
        require(msg.value >= total, "Insufficient funds");

        uint256 unspent = msg.value - total;
        if (unspent > 0) {
            (bool refundSent, ) = msg.sender.call{value: unspent}("");
            require(refundSent, "Failed to send Ether");
        }

        uint256 platformFeeInWei;
        if (totalPlatformFee > 0) {
            // update platform fee balance
            platformFeeInWei = priceOracle.attoUSDToWei(totalPlatformFee);
            platformFeeBalance += platformFeeInWei;
        }

        // update revenue in WEI
        // if no fee, then all the cost will be the revenue
        uint256 revenueInWei = total;
        if (totalPlatformFee > 0) {
            revenueInWei = priceOracle.attoUSDToWei(totalRevenue);
        }
        tldRevenues[identifier] += revenueInWei;

        return total;
    }

    /// renew @param name for @param duration.
    function _renew(
        uint256 identifier,
        string calldata name,
        uint256 duration,
        address initiatedBy,
        bytes calldata extraData
    ) internal nonReentrant returns (uint256 revenue, uint256 platformFee) {
        {
            TldConfig storage config = tldConfigs[identifier];
            if (duration < config.minRenewDuration) {
                revert DurationTooShort(identifier, duration);
            }
        }

        // compute name price using price oracle and platform fee.
        uint256 cost;
        {
            IPriceOracle.Price memory price = rentPriceInUSD(
                identifier,
                name,
                duration
            );
            cost = price.base + price.premium;
        }

        TldHook storage hook = tldHooks[identifier];
        // price hook allows TLD owner to update the price.
        if (address(hook.renewPriceHook) != address(0)) {
            // update cost
            cost = _newRenewPrice(
                hook.renewPriceHook,
                identifier,
                name,
                initiatedBy,
                duration,
                cost,
                extraData
            );
        }

        // calc platform fee with new cost
        platformFee = platformConfig.computeBasicPlatformFee(identifier, cost);
        if (platformFee >= cost) {
            // when price is lower than minimal platform fee, no revenue.
            revenue = 0;
        } else {
            revenue = cost - platformFee;
        }

        // point hook allows to deduct points againt a ceertain amount of cost
        if (address(hook.renewPointHook) != address(0)) {
            (cost, platformFee) = _deductRenew(
                hook.renewPointHook,
                identifier,
                name,
                initiatedBy,
                duration,
                cost,
                platformFee,
                extraData
            );
            // update revenue
            if (cost >= platformFee) {
                revenue = cost - platformFee;
            } else {
                revenue = 0;
            }
        }

        // rewards hook
        if (address(hook.renewRewardHook) != address(0)) {
            _rewardRenew(
                hook.renewRewardHook,
                identifier,
                name,
                initiatedBy,
                duration,
                cost,
                revenue,
                platformFee,
                extraData
            );
        }

        // renew name
        _renewNode(identifier, name, duration, cost);

        return (revenue, platformFee);
    }

    /// register @param name.tld with @param regInfo.
    /// extraData will be passed hooks.
    /// @return revenue amount that the TLD owner receives,
    /// @return platformFee the amount that platform will get.
    /// Adding them together will be the total cost of the registration.
    function _registerWithConfig(
        uint256 identifier,
        string calldata name,
        RegInfo memory regInfo,
        bytes calldata extraData
    ) internal nonReentrant returns (uint256 revenue, uint256 platformFee) {
        {
            if (!available(identifier, name)) {
                revert NameNotAvailable(identifier, name);
            }

            TldConfig storage config = tldConfigs[identifier];
            if (regInfo.duration < config.minRegistrationDuration) {
                revert DurationTooShort(identifier, regInfo.duration);
            }
        }

        TldHook storage hook = tldHooks[identifier];
        // qualification hook allows the TLD owner to
        // add extra requirements for registration.
        if (address(hook.qualificationHook) != address(0)) {
            _qualify(
                hook.qualificationHook,
                identifier,
                name,
                regInfo.buyer,
                regInfo.duration,
                extraData
            );
        }

        // compute name price using price oracle and platform fee.
        uint256 cost;
        {
            IPriceOracle.Price memory price = rentPriceInUSD(
                identifier,
                name,
                regInfo.duration
            );
            cost = price.base + price.premium;
        }

        // price hook allows TLD owner to update the price.
        if (address(hook.priceHook) != address(0)) {
            // update cost
            cost = _newPrice(
                hook.priceHook,
                identifier,
                name,
                regInfo.buyer,
                regInfo.duration,
                cost,
                extraData
            );
        }

        // calc platform fee with new cost
        platformFee = platformConfig.computePlatformFee(identifier, cost);
        if (platformFee >= cost) {
            // when price is lower than minimal platform fee, no revenue.
            revenue = 0;
        } else {
            revenue = cost - platformFee;
        }

        // point hook allows to deduct points againt a ceertain amount of cost
        if (address(hook.pointHook) != address(0)) {
            // update cost and platformFee
            (cost, platformFee) = _deduct(
                hook.pointHook,
                identifier,
                name,
                regInfo.buyer,
                regInfo.duration,
                cost,
                platformFee,
                extraData
            );
            // update revenue
            if (cost >= platformFee) {
                revenue = cost - platformFee;
            } else {
                revenue = 0;
            }
        }

        // rewards hook
        if (address(hook.rewardHook) != address(0)) {
            _reward(
                hook.rewardHook,
                identifier,
                name,
                regInfo.buyer,
                regInfo.duration,
                cost,
                revenue,
                platformFee,
                extraData
            );
        }

        // register node
        _registerNode(
            identifier,
            name,
            regInfo.owner,
            regInfo.duration,
            regInfo.resolver,
            cost
        );

        // set tld name
        if (regInfo.setTldName && regInfo.buyer == regInfo.owner) {
            _setTldName(identifier, name, regInfo.resolver, regInfo.owner);
        }

        return (revenue, platformFee);
    }

    function _qualify(
        IQualificationHook qualificationHook,
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        bytes calldata extraData
    ) private {
        bool qualified = qualificationHook.qualify(
            identifier,
            name,
            owner,
            duration,
            extraData
        );
        if (!qualified) {
            revert NotQualifiedRegister();
        }
    }

    function _newPrice(
        IPriceHook priceHook,
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        uint256 cost,
        bytes calldata extraData
    ) private returns (uint256) {
        cost = priceHook.newPrice(
            identifier,
            name,
            owner,
            duration,
            cost,
            extraData
        );

        return cost;
    }

    function _deduct(
        IPointHook pointHook,
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        uint256 cost,
        uint256 platformFee,
        bytes calldata extraData
    ) private returns (uint256, uint256) {
        (uint256 discount, uint256 deductible) = pointHook.deduct(
            identifier,
            name,
            owner,
            duration,
            cost,
            platformFee,
            extraData
        );
        require(cost >= discount);
        cost -= discount;

        if (deductible > platformFee) {
            deductible = platformFee;
            platformFee = 0;
        } else {
            platformFee -= deductible;
        }
        if (deductible > 0) {
            prepaidPlatformFee.deduct(identifier, deductible);
        }

        return (cost, platformFee);
    }

    function _reward(
        IRewardHook rewardHook,
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        uint256 cost,
        uint256 revenue,
        uint256 platformFee,
        bytes calldata extraData
    ) private {
        // transfer revenue to reward hook to cover rewards
        IPriceOracle priceOracle = getPriceOracle(identifier);
        uint256 revenueWei = priceOracle.attoUSDToWei(revenue);
        require(revenueWei <= msg.value);

        rewardHook.reward{value: revenueWei}(
            identifier,
            name,
            owner,
            duration,
            cost,
            revenue,
            platformFee,
            extraData
        );
    }

    function _newRenewPrice(
        IRenewPriceHook priceHook,
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        uint256 cost,
        bytes calldata extraData
    ) private returns (uint256) {
        cost = priceHook.newRenewPrice(
            identifier,
            name,
            owner,
            duration,
            cost,
            extraData
        );

        return cost;
    }

    function _deductRenew(
        IRenewPointHook pointHook,
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        uint256 cost,
        uint256 platformFee,
        bytes calldata extraData
    ) private returns (uint256, uint256) {
        (uint256 discount, uint256 deductible) = pointHook.deductRenew(
            identifier,
            name,
            owner,
            duration,
            cost,
            platformFee,
            extraData
        );
        require(cost >= discount);
        cost -= discount;

        if (deductible > platformFee) {
            deductible = platformFee;
            platformFee = 0;
        } else {
            platformFee -= deductible;
        }
        if (deductible > 0) {
            prepaidPlatformFee.deduct(identifier, deductible);
        }

        return (cost, platformFee);
    }

    function _rewardRenew(
        IRenewRewardHook rewardHook,
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        uint256 cost,
        uint256 revenue,
        uint256 platformFee,
        bytes calldata extraData
    ) private {
        // transfer revenue to reward hook to cover rewards
        IPriceOracle priceOracle = getPriceOracle(identifier);
        uint256 revenueWei = priceOracle.attoUSDToWei(revenue);
        require(revenueWei <= msg.value);

        rewardHook.rewardRenew{value: revenueWei}(
            identifier,
            name,
            owner,
            duration,
            cost,
            revenue,
            platformFee,
            extraData
        );
    }

    function _registerNode(
        uint256 identifier,
        string calldata name,
        address owner,
        uint256 duration,
        address resolver,
        uint256 cost
    ) private {
        uint256 expires;
        bytes32 label = keccak256(bytes(name));
        uint256 tokenId = uint256(label);

        Base base = Base(sann.tldBase(identifier));
        expires = base.register(tokenId, address(this), duration);

        emit NameRegistered(identifier, name, label, owner, cost, expires);

        bytes32 nodehash = keccak256(abi.encodePacked(base.baseNode(), label));
        base.sidRegistry().setResolver(nodehash, resolver);
        if (owner != address(0)) {
            Resolver(resolver).setAddr(nodehash, owner);
        }
        base.reclaim(tokenId, owner);
        base.transferFrom(address(this), owner, tokenId);
    }

    function _renewNode(
        uint256 identifier,
        string calldata name,
        uint256 duration,
        uint256 cost
    ) private {
        Base base = Base(sann.tldBase(identifier));
        bytes32 label = keccak256(bytes(name));
        uint256 expires = base.renew(uint256(label), duration);

        emit NameRenewed(identifier, name, label, cost, expires);
    }

    function available(
        uint256 identifier,
        string calldata name
    ) public view override returns (bool) {
        Base base = Base(sann.tldBase(identifier));
        bytes32 label = keccak256(bytes(name));
        return _valid(identifier, name) && base.available(uint256(label));
    }

    function _setTldName(
        uint256 identifier,
        string calldata name,
        address resolver,
        address owner
    ) internal {
        string memory subfix = sann.tld(identifier);
        bytes32 node = reverseRegistrar.node(msg.sender);
        string memory exsitedName = INameResolver(resolver).name(node);
        // sets the chain name if it has not been set before
        if (bytes(exsitedName).length == 0) {
            reverseRegistrar.setNameForAddr(
                msg.sender,
                owner,
                resolver,
                string.concat(string.concat(name, "."), subfix)
            );
        }
        reverseRegistrar.setTldNameForAddr(
            msg.sender,
            owner,
            resolver,
            identifier,
            string.concat(string.concat(name, "."), subfix)
        );
    }

    function _valid(
        uint256 identifier,
        string calldata name
    ) private view returns (bool) {
        TldConfig storage config = tldConfigs[identifier];
        Base base = Base(sann.tldBase(identifier));
        if (name.strlen() < config.minDomainLength) {
            return false;
        }
        if (name.strlen() > config.maxDomainLength) {
            return false;
        }
        if (!name.notContainsZeroWidth()) {
            return false;
        }
        if (config.mintCap <= base.supplyAmount()) {
            return false;
        }
        return true;
    }
}
