// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {GiftCardBase} from "./GiftCardBase.sol";
import {GiftCardVoucher} from "./GiftCardVoucher.sol";
import {GiftCardLedger} from "./GiftCardLedger.sol";
import {TldAccessable} from "../access/TldAccessable.sol";
import {IPlatformConfig} from "../admin/IPlatformConfig.sol";
import {PrepaidPlatformFee} from "../admin/PrepaidPlatformFee.sol";
import {ISANN} from "../admin/ISANN.sol";
import {IPriceOracle} from "../price-oracle/IPriceOracle.sol";

// GIFT card disallow owner withdrawal unless used?
contract GiftCardController is TldAccessable {
    GiftCardBase public base;
    GiftCardVoucher public voucher;
    GiftCardLedger public ledger;
    IPlatformConfig public platformConfig;
    PrepaidPlatformFee public prepaidPlatformFee;
    IPriceOracle public priceOracle;

    event SetPriceOracle(address priceOracle);

    /// giftCard revenue for tlds in wei
    mapping(uint256 => uint256) public tldGiftCardRevenues;

    constructor(
        ISANN _sann,
        GiftCardBase _base,
        GiftCardVoucher _voucher,
        GiftCardLedger _ledger,
        IPriceOracle _priceOracle,
        IPlatformConfig _platformConfig,
        PrepaidPlatformFee _prepaidPlatformFee
    ) TldAccessable(_sann) {
        require(address(_base) != address(0), "Invalid base address");
        require(address(_voucher) != address(0), "Invalid voucher address");
        require(
            address(_priceOracle) != address(0),
            "Invalid price oracle address"
        );
        base = _base;
        voucher = _voucher;
        ledger = _ledger;
        priceOracle = _priceOracle;
        platformConfig = _platformConfig;
        prepaidPlatformFee = _prepaidPlatformFee;

        emit SetPriceOracle(address(_priceOracle));
    }

    function price(
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) public view returns (uint256) {
        uint256 totalUSD = voucher.totalValue(ids, amounts);
        return priceOracle.attoUSDToWei(totalUSD);
    }

    function batchRegister(
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external payable {
        require(voucher.isValidVoucherIds(ids), "Invalid voucher id");
        require(voucher.isSameTld(ids), "Must be same tld");

        uint256 identifier = voucher.getTokenIdTld(ids[0]);

        uint256 cost = price(ids, amounts);
        require(msg.value >= cost, "Insufficient funds");
        base.batchRegister(msg.sender, ids, amounts);

        // income distribution
        address tldController = sann.tldController();
        require(tldController != address(0), "Invalid tld controller");
        // cal platform fee
        uint256 fee = platformConfig.computeBasicPlatformFee(identifier, cost);
        if (fee > 0) {
            // deposit prepaid platform fee in USD
            prepaidPlatformFee.deposit{value: fee}(identifier);
        }

        // add remain value to balance
        if (cost > fee) {
            tldGiftCardRevenues[identifier] += (cost - fee);
        }

        // Refund any extra payment
        if (msg.value > cost) {
            (bool refundSent, ) = msg.sender.call{value: msg.value - cost}("");
            require(refundSent, "Failed to send Ether");
        }
    }

    /**
     * @dev To charge points with giftcards
     * @param identifier The identifier of TLD
     * @param ids The id array of giftcards
     * @param amounts The amount array of giftcards
     */
    function batchRedeem(
        uint256 identifier,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        require(voucher.isSameTld(ids), "Must be same tld");
        require(ids.length > 0, "Empty tokenIds");
        require(
            voucher.getTokenIdTld(ids[0]) == identifier,
            "Identifier dosen't match tokenIds"
        );
        base.batchBurn(msg.sender, ids, amounts);
        uint256 totalValue = voucher.totalValue(ids, amounts);
        ledger.redeem(identifier, msg.sender, totalValue);
    }

    function setPriceOracle(address _priceOracle) public onlyPlatformAdmin {
        require(_priceOracle != address(0), "Invalid price oracle address");
        priceOracle = IPriceOracle(_priceOracle);
        emit SetPriceOracle(_priceOracle);
    }

    function withdraw(uint256 identifier) public onlyTldOwner(identifier) {
        uint256 value = tldGiftCardRevenues[identifier];
        tldGiftCardRevenues[identifier] = 0;
        require(value > 0, "insufficient value");
        (bool sent, ) = msg.sender.call{value: value}("");
        require(sent, "Failed to send Ether");
    }
}
