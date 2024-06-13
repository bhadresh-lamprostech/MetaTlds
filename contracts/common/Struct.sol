// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {IQualificationHook} from "../hook/IQualificationHook.sol";
import {IPriceHook} from "../hook/IPriceHook.sol";
import {IPointHook} from "../hook/IPointHook.sol";
import {IRewardHook} from "../hook/IRewardHook.sol";
import {IRenewPriceHook} from "../hook/IRenewPriceHook.sol";
import {IRenewPointHook} from "../hook/IRenewPointHook.sol";
import {IRenewRewardHook} from "../hook/IRenewRewardHook.sol";
import {ReferralHub} from "../referral/ReferralHub.sol";

struct RegInfo {
    address buyer;
    address owner;
    uint duration;
    address resolver;
    bool setTldName;
}

struct PreRegistrationUpdateConfig {
    bool enableAuction;
    uint auctionStartTime;
    uint auctionInitialEndTime;
    uint auctionExtendDuration;
    uint auctionRetentionDuration;
    uint auctionMinRegistrationDuration;
    bool enableFcfs;
    uint fcfsStartTime;
    uint fcfsEndTime;
}

struct TldConfig {
    uint256 minDomainLength;
    uint256 maxDomainLength;
    uint256 minRegistrationDuration;
    uint256 minRenewDuration;
    uint256 mintCap;
}

struct TldHook {
    IQualificationHook qualificationHook;
    IPriceHook priceHook;
    IPointHook pointHook;
    IRewardHook rewardHook;
    IRenewPriceHook renewPriceHook;
    IRenewPointHook renewPointHook;
    IRenewRewardHook renewRewardHook;
}

struct TldInitData {
    TldConfig config; // for tld config
    uint8[] letters; // for price oracle
    uint64[] prices; // for price oracle
    bool enableGiftCard; // for giftcard
    uint256[] giftCardPrices; // for giftcard
    bool enableReferral; // for referral
    uint256[] referralLevels; // for referral
    ReferralHub.Comission[] referralComissions; // for referral
    bool enablePreRegistration; // for preRegistration
    PreRegistrationUpdateConfig preRegiConfig; // for preRegistration
    uint16[] preRegiDiscountRateBps; // for preRegistration
    uint256 publicRegistrationStartTime; // for public registration
    bool publicRegistrationPaused; // for public registration
    string baseUri;
}

struct HookExtraData {
    bytes QualificationHookExtraData;
    bytes PriceHookExtraData;
    bytes PointHookExtraData;
    bytes RewardHookExtraData;
}
