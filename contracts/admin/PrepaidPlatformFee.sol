// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {TldAccessable} from "../access/TldAccessable.sol";
import {IPrepaidPlatformFee} from "./IPrepaidPlatformFee.sol";
import {IPlatformConfig} from "../admin/IPlatformConfig.sol";
import {IPriceOracle} from "../price-oracle/IPriceOracle.sol";
import {ISANN} from "../admin/ISANN.sol";
import {TreasuryAccessable} from "../access/TreasuryAccessable.sol";

contract PrepaidPlatformFee is
    IPrepaidPlatformFee,
    TldAccessable,
    TreasuryAccessable
{
    mapping(uint256 => uint256) public feeCredits; // TLD idenfitier => prepaid fee balance in USD
    IPriceOracle public priceOracle;

    constructor(
        ISANN _sann,
        IPlatformConfig _config,
        IPriceOracle _priceOracle
    ) TldAccessable(_sann) TreasuryAccessable(_config) {
        priceOracle = _priceOracle;
    }

    function deposit(uint256 identifier) external payable {
        require(msg.value > 0, "deposit amount too low");

        uint256 received = msg.value;
        // add extra 1 WEI to compensate precision loss caused by
        // rounding down in converting from USD to Ether
        // and also ensure that the added 1 WEI is not significant compared to the value deposited
        if (received > 1 gwei) {
            received += 1;
        }

        // convert native token to usd
        uint256 newCredit = priceOracle.weiToAttoUSD(received);
        feeCredits[identifier] += newCredit;

        emit PlatformFeeDeposit(identifier, newCredit);
    }

    function deduct(
        uint256 identifier,
        uint256 amount
    ) external onlyTldController {
        uint256 credit = feeCredits[identifier];
        require(credit >= amount, "insufficient fee credit");
        feeCredits[identifier] -= amount;

        emit PlatformFeeDeduct(identifier, amount);
    }

    function withdraw() external onlyPlatformFeeCollector {
        uint256 amount = address(this).balance;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Failed to send Ether");

        emit PlatformFeeWithdraw(amount);
    }
}
