// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ITldFactory} from "./ITldFactory.sol";
import {ISANN} from "./ISANN.sol";
import {IPriceOracle} from "../price-oracle/IPriceOracle.sol";
import {IBaseCreator} from "../proxy/IBaseCreator.sol";
import {IRegistrarController} from "../controller/IRegistrarController.sol";
import {GiftCardVoucher} from "../giftcard/GiftCardVoucher.sol";
import {GiftCardLedger} from "../giftcard/GiftCardLedger.sol";
import {TldAccessable} from "../access/TldAccessable.sol";
import {ReferralHub} from "../referral/ReferralHub.sol";
import {TldInitData, PreRegistrationUpdateConfig, TldHook} from "../common/Struct.sol";
import {DefaultDiscountHook} from "../hook/DefaultDiscountHook.sol";
import {DefaultQualificationHook} from "../hook/DefaultQualificationHook.sol";
import {PreRegistrationState} from "../preregistration/PreRegistrationState.sol";
import {IPlatformConfig} from "./IPlatformConfig.sol";
import {IPreRegistrationCreator} from "../proxy/IPreRegistrationCreator.sol";
import {PrepaidPlatformFee} from "../admin/PrepaidPlatformFee.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// TldFactory is a controller to create a new TLD.
contract TldFactory is ITldFactory, TldAccessable, Initializable {
    /// Platform config contract address.
    address public platformConfig;

    /// Name NFT contract (ERC721) factory contract address.
    IBaseCreator public baseCreator;

    /// default price model contract address.
    address public defaultPriceOracle;

    /// Controller of TLD
    IRegistrarController public registrar;

    /// PreRegistration factory contract address.
    /// including PreRegistrationState and Auction
    IPreRegistrationCreator public preRegiCreator;

    /// giftcard
    GiftCardVoucher public giftCardVoucher;
    GiftCardLedger public giftCardLedger;

    /// referralHub
    ReferralHub public referralHub;

    /// prepaid platform fee
    PrepaidPlatformFee public prepaidPlatformFee;

    constructor(ISANN _sann) TldAccessable(_sann) {}

    function initialize(
        IBaseCreator _baseCreator,
        IRegistrarController _controller,
        address _platformConfig,
        address _priceOracle,
        GiftCardVoucher _giftCardVoucher,
        GiftCardLedger _giftCardLedger,
        ReferralHub _referralHub,
        IPreRegistrationCreator _preRegiCreator,
        PrepaidPlatformFee _prepaidPlatformFee
    ) public initializer onlyPlatformAdmin {
        require(_priceOracle != address(0), "invalid price oracle");

        platformConfig = _platformConfig;
        baseCreator = _baseCreator;
        defaultPriceOracle = _priceOracle;
        registrar = _controller;
        preRegiCreator = _preRegiCreator;
        giftCardVoucher = _giftCardVoucher;
        giftCardLedger = _giftCardLedger;
        referralHub = _referralHub;
        prepaidPlatformFee = _prepaidPlatformFee;

        emit SetDefaultPriceOracle(defaultPriceOracle);
    }

    /// Create a new TLD @param tld for @param tldOwner.
    /// premise:
    /// 1. tld is not registered yet, otherwise it will revert by SANN.
    /// 2. tldOwner is not 0x0, otherwise it will revert by SANN.
    /// 3. tldOwner has authorized msg.sender to create a TLD for him/her.
    function createDomainService(
        string calldata tld,
        address tldOwner,
        TldInitData calldata initData
    ) external override onlyPlatformAdmin returns (uint256 identifier) {
        // generate unique identifier for every new tld
        identifier = sann.tldIdentifier(tld, tldOwner);

        address baseAddress = baseCreator.create(
            (address)(sann.registry()),
            identifier,
            tld,
            initData.baseUri
        );

        // set new tld's owner to factory to ensure initialization working properly
        // and we will transfer ownership back to the real owner after initialization
        sann.registerTld(tld, identifier, address(this), baseAddress);

        // set config for new tld
        registrar.setTldConfigs(identifier, initData.config);

        // set price oracle for new tld
        _setPriceModel(identifier, initData.letters, initData.prices);

        // enable pregistration if needed
        address preRegistrationStateAddr;
        if (initData.enablePreRegistration) {
            preRegistrationStateAddr = _enablePreRegistration(
                identifier,
                tldOwner,
                address(prepaidPlatformFee),
                initData.preRegiConfig
            );
        }

        // enable discount hook if needed
        address discountHook;
        if (
            (preRegistrationStateAddr != address(0)) ||
            (initData.preRegiDiscountRateBps.length > 0) ||
            (initData.publicRegistrationStartTime > 0)
        ) {
            discountHook = _enablePriceHook(
                identifier,
                preRegistrationStateAddr,
                initData.preRegiDiscountRateBps,
                initData.publicRegistrationStartTime
            );
        }

        // enable qualification hook if needed
        if (
            (initData.publicRegistrationStartTime > 0) ||
            initData.publicRegistrationPaused ||
            (preRegistrationStateAddr != address(0))
        ) {
            _enableQualificationHook(
                identifier,
                initData.publicRegistrationPaused,
                initData.publicRegistrationStartTime,
                preRegistrationStateAddr
            );
        }

        // enable giftCard if needed
        if (initData.enableGiftCard) {
            _enableGiftCard(identifier, initData.giftCardPrices);
        }

        // enable referral if needed
        if (initData.enableReferral) {
            _enableReferral(
                identifier,
                initData.referralLevels,
                initData.referralComissions
            );
        }

        // transfer ownership to real owner
        sann.setTldOwner(identifier, tldOwner);

        emit NewDomainService(
            tldOwner,
            sann.chainId(),
            identifier,
            tld,
            address(registrar),
            baseAddress
        );
        return identifier;
    }

    function _setPriceModel(
        uint256 _identifier,
        uint8[] calldata letters,
        uint64[] calldata prices
    ) private {
        require(
            letters.length == prices.length,
            "length of letters and prices not matched"
        );
        require(letters.length <= 5, "too many price rules");

        if (letters.length < 5) {
            IPriceOracle(defaultPriceOracle).initTldPriceModel(_identifier);
        }
        for (uint256 i = 0; i < letters.length; i++) {
            IPriceOracle(defaultPriceOracle).setTldPriceModel(
                _identifier,
                letters[i],
                prices[i]
            );
        }
    }

    function _enableQualificationHook(
        uint256 _identifier,
        bool publicRegistrationPaused,
        uint256 publicRegistrationStartTime,
        address preRegistrationState
    ) private {
        bytes32 salt = keccak256(abi.encodePacked(_identifier));

        DefaultQualificationHook newDefaultQualificationHook = new DefaultQualificationHook{
                salt: salt
            }(
                sann,
                _identifier,
                PreRegistrationState(preRegistrationState),
                publicRegistrationStartTime,
                publicRegistrationPaused
            );

        if (preRegistrationState != address(0)) {
            PreRegistrationState(preRegistrationState).addController(
                address(newDefaultQualificationHook)
            );
        }

        // set qualification hook
        registrar.setQualificationHook(
            _identifier,
            address(newDefaultQualificationHook)
        );
    }

    function _enablePreRegistration(
        uint256 _identifier,
        address _tldOwner,
        address _prepaidPlatformFee,
        PreRegistrationUpdateConfig calldata _config
    ) private returns (address) {
        (address preRegiState, address auction) = preRegiCreator.create(
            address(sann),
            _identifier,
            _tldOwner,
            address(registrar),
            platformConfig,
            _prepaidPlatformFee,
            _config
        );
        if (auction != address(0)) {
            PreRegistrationState(preRegiState).addController(auction);
        }
        return preRegiState;
    }

    function _enablePriceHook(
        uint256 _identifier,
        address _preRegistrationState,
        uint16[] calldata _preRegiDiscountRateBps,
        uint256 _publicRegistrationStartTime
    ) private returns (address) {
        // create discount hook
        bytes32 salt = keccak256(abi.encodePacked(_identifier));
        DefaultDiscountHook _hook = new DefaultDiscountHook{salt: salt}(
            sann,
            _identifier,
            PreRegistrationState(_preRegistrationState),
            IPlatformConfig(platformConfig),
            giftCardLedger,
            IPriceOracle(defaultPriceOracle),
            _preRegiDiscountRateBps,
            _publicRegistrationStartTime
        );

        // set discount hook
        registrar.setPriceHook(_identifier, address(_hook));
        registrar.setRenewPriceHook(_identifier, address(_hook));
        // set point hook
        registrar.setPointHook(_identifier, address(_hook));
        registrar.setRenewPointHook(_identifier, address(_hook));

        // add discount hook as tldController of giftCardLedger
        giftCardLedger.addTldGiftCardController(_identifier, address(_hook));

        return address(_hook);
    }

    function _enableGiftCard(
        uint256 _identifier,
        uint256[] calldata prices
    ) private {
        // create vouchers
        for (uint256 i = 0; i < prices.length; i++) {
            giftCardVoucher.addCustomizedVoucher(_identifier, prices[i]);
        }
    }

    function _enableReferral(
        uint256 _identifier,
        uint256[] calldata levels,
        ReferralHub.Comission[] calldata comissions
    ) private {
        require(
            levels.length == comissions.length,
            "length of levels and comissions not matched"
        );

        // set comission chart
        for (uint256 i = 0; i < levels.length; i++) {
            referralHub.setComissionChart(
                _identifier,
                levels[i],
                comissions[i].minimumReferralCount,
                comissions[i].referrerRate,
                comissions[i].refereeRate
            );
        }

        // set reward hook
        registrar.setRewardHook(_identifier, address(referralHub));
    }

    function setDefaultPriceOracle(
        address _defaultPriceOracle
    ) external onlyPlatformAdmin {
        require(_defaultPriceOracle != address(0), "invalid price oracle");
        defaultPriceOracle = _defaultPriceOracle;
        emit SetDefaultPriceOracle(defaultPriceOracle);
    }
}
