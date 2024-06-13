// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {IRegistrarController} from "../controller/IRegistrarController.sol";
import {IPlatformConfig} from "../admin/IPlatformConfig.sol";
import {TldAccessable} from "../access/TldAccessable.sol";
import {PreRegistrationState} from "./PreRegistrationState.sol";
import {ISANN} from "../admin/ISANN.sol";
import {PrepaidPlatformFee} from "../admin/PrepaidPlatformFee.sol";

error BidAmountTooLow(uint minBidAmount);
error DomainNotAvailable(string label);
error AuctionWinnerCannotWithdraw();
error CannotWithdrawZeroAmount();
error AuctionEnded();

contract Auction is TldAccessable {
    // deps
    IRegistrarController public immutable controller;
    IPlatformConfig public platformConfig;
    PreRegistrationState public state;
    PrepaidPlatformFee public prepaidPlatformFee;

    // identifier of TLD
    uint256 public immutable identifier;
    // The total amount that the auction contract owner can withdraw.
    // Withdraw can only happen after auctionHardEndTime and the value will be reset to 0, after withdraw.
    uint256 public ownerCanWithdraw;

    event Bid(uint tokenID, string label, address bidder, uint bid);

    constructor(
        ISANN _sann,
        uint256 _identifier,
        IRegistrarController _controller,
        PreRegistrationState _state,
        IPlatformConfig _platformConfig,
        PrepaidPlatformFee _prepaidPlatformFee
    ) TldAccessable(_sann) {
        identifier = _identifier;
        controller = _controller;
        state = _state;
        platformConfig = _platformConfig;
        prepaidPlatformFee = _prepaidPlatformFee;
    }

    // place a bid on @p label, total bid amount will be aggregated, returns the new bid value.
    function placeBid(
        string calldata label
    ) external payable virtual returns (uint) {
        require(state.inAuction(), "not in auction");

        // reject payments of 0 ETH
        if (msg.value <= 0) {
            revert BidAmountTooLow(1);
        }

        uint256 tokenID = uint256(keccak256(bytes(label)));

        // consume quota
        state.consumeAuctionQuota(msg.sender, tokenID);

        // verify label and initialize auction status if this is the first bid.
        _initAuctionStatus(tokenID, label);
        (, address prevWinner, uint endTime) = state.auctionStatus(tokenID);

        // per-label endtime check
        if (block.timestamp > endTime) {
            revert AuctionEnded();
        }

        // verify amount and update auction status
        uint newBid = state.bidAmount(tokenID, msg.sender) + msg.value;
        uint minBid = nextBidFloorPrice(tokenID, label);
        if (newBid < minBid) {
            revert BidAmountTooLow(minBid);
        }
        uint prevHighestBid = state.bidAmount(tokenID, prevWinner);
        uint delta = newBid - prevHighestBid;

        // cal platform fee and tranfer it to fee collector
        uint256 platformFeeDelta;
        if (delta > 0) {
            // deposit prepaid platform fee
            platformFeeDelta = platformConfig.computeBasicPlatformFee(
                identifier,
                delta
            );
            if (platformFeeDelta > 0) {
                prepaidPlatformFee.deposit{value: platformFeeDelta}(identifier);
            }
        }
        ownerCanWithdraw += (delta - platformFeeDelta);

        // update auction status and top ten bids
        // also extend end time if necessary
        state.updateAuctionStatus(tokenID, label, msg.sender, newBid);

        emit Bid(tokenID, label, msg.sender, newBid);
        return newBid;
    }

    // initialize auction status label and endtime, if not initialized yet.
    // It will also check @p lable validity, revert if invalid.
    function _initAuctionStatus(
        uint256 tokenID,
        string calldata label
    ) private {
        if (!available(label)) {
            revert DomainNotAvailable(label);
        }
        (, , uint endTime) = state.auctionStatus(tokenID);
        // auction of @p label is already initialialzed, just return.
        if (endTime != 0) {
            return;
        }
        state.updateAuctionStatus(tokenID, label, address(0), 0);
    }

    // returns the min bid price for @p tokenID.
    // If there's already a bid on @p TokenID, price = (lastBid * 105%).
    // otherwise, the min bid price will be the minRegistrationDuration registration fee after discount.
    function nextBidFloorPrice(
        uint256 tokenID,
        string calldata name
    ) public view returns (uint) {
        address winner = winnerOf(tokenID);
        if (winner != address(0)) {
            // If any user bids, min bid is set at 105% of the top bid.
            uint currentHighest = state.bidAmount(tokenID, winner);
            return (currentHighest / 100) * 105;
        } else {
            uint minRegistrationDuration = state
                .auctionMinRegistrationDuration();
            uint cost = controller.priceAfterDiscount(
                identifier,
                name,
                msg.sender,
                minRegistrationDuration,
                ""
            );
            return cost;
        }
    }

    /*
     * withdraw methods
     */
    // withdraw fund bidded on @p label, if not the winner.
    function withdraw(string calldata label) public returns (uint) {
        uint256 tokenID = uint256(keccak256(bytes(label)));
        if (isWinner(msg.sender, tokenID)) {
            revert AuctionWinnerCannotWithdraw();
        }
        uint amount = state.bidAmount(tokenID, msg.sender);
        if (amount == 0) {
            revert CannotWithdrawZeroAmount();
        }

        state.clearAuctionFunds(tokenID, msg.sender);

        // send the funds
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Failed to send Ether");
        return amount;
    }

    // contract owner withdraw all winner amount.
    function ownerWithdraw() public onlyTldOwner(identifier) {
        require(state.auctionEnded(), "auction not ended");
        uint amount = ownerCanWithdraw;
        ownerCanWithdraw = 0;
        if (amount == 0) {
            revert CannotWithdrawZeroAmount();
        }
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Failed to send Ether");
    }

    /*
     * views
     */
    function available(string calldata name) public view returns (bool) {
        return controller.available(identifier, name);
    }

    function winnerOf(uint256 tokenID) public view returns (address) {
        return state.winnerOf(tokenID);
    }

    // returns true if @p user is the winner of auction on @p tokenID.
    function isWinner(
        address user,
        uint256 tokenID
    ) public view returns (bool) {
        return winnerOf(tokenID) == user;
    }
}
