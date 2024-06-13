// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TldAccessable} from "../access/TldAccessable.sol";
import {ISANN} from "../admin/ISANN.sol";
import {PreRegistrationUpdateConfig} from "../common/Struct.sol";

error AuctionStarted();
error FcfsStarted();
error NotEnoughQuota();
error PreRegistrationNotStarted();

contract PreRegistrationState is TldAccessable {
    // TokenAuctionStatus stores the state of an auction.
    struct TokenAuctionStatus {
        // the label string.
        string label;
        // the current highest bidder.
        address winner;
        // current endTime.
        uint endTime;
        // the number of amount bidded by users, when withdraw
        // the value will be reset to 0.
        mapping(address => uint) userFunds;
    }

    // UserStatus stores user's available quota and enumerable bids.
    struct UserStatus {
        // user address to the available quota the user has for bidding on new domains.
        uint8 quota;
        // list tokenIDs that he has bidded.
        uint256[] bids;
        // map user to the tokenIDs that he has bidded.
        mapping(uint256 => bool) bided;
        // true if user ever had quota
        bool hadQuota;
        // consumed quotas in phase2
        uint8 consumedQuotaInFcfs;
    }

    // pair of amount and tokenID.
    struct TopBid {
        uint256 tokenID;
        uint256 bid;
    }

    // pair of amount and label.
    struct TopBidView {
        string label;
        uint256 bid;
    }

    struct UserBidsView {
        string label;
        uint256 tokenID;
        address winner;
        uint256 highestBid;
        uint256 userBid;
    }

    mapping(address => bool) public controllers;
    event ControllerAdded(address indexed controller);
    event ControllerRemoved(address indexed controller);

    // config changed events
    event SetAuctionEnabled(uint256 identifier, bool enabled);
    event SetAuctionConfig(
        uint256 identifier,
        bool enabled,
        uint256 auctionStartTime,
        uint256 auctionEndTime,
        uint256 auctionExtendDuration,
        uint256 auctionRetentionDuration,
        uint256 auctionMinRegistrationDuration
    );
    event SetFcfsEnabled(uint256 identifier, bool enabled);
    event SetFcfsConfig(
        uint256 identifier,
        bool enabled,
        uint256 fcfsStartTime,
        uint256 fcfsEndTime
    );

    // identifier of TLD
    uint256 public immutable identifier;

    ////// state
    // map user address to his auction status.
    mapping(address => UserStatus) public userStatus;
    //// map token ID to its auction status
    mapping(uint256 => TokenAuctionStatus) public auctionStatus;
    // Top ten bidded domains.
    TopBid[10] public topBids;

    // configs
    // for phase1 - auction
    bool public auctionEnabled;
    uint public auctionStartTime;
    uint public auctionInitialEndTime;
    uint public auctionHardEndTime;
    uint public auctionExtendDuration; // in seconds
    uint public auctionRetentionDuration; // name retention period after auction, in seconds
    uint public auctionMinRegistrationDuration;
    // for phase2 - FCFS registration
    bool public fcfsEnabled;
    uint public fcfsStartTime;
    uint public fcfsEndTime;

    constructor(
        ISANN _sann,
        uint256 _identifier,
        PreRegistrationUpdateConfig memory _config
    ) TldAccessable(_sann) {
        identifier = _identifier;

        _setAuctionConfigs(
            _config.enableAuction,
            _config.auctionStartTime,
            _config.auctionInitialEndTime,
            _config.auctionExtendDuration,
            _config.auctionRetentionDuration,
            _config.auctionMinRegistrationDuration
        );

        _setFcfsConfigs(
            _config.enableFcfs,
            _config.fcfsStartTime,
            _config.fcfsEndTime
        );
    }

    function updateAuctionStatus(
        uint256 tokenID,
        string calldata label,
        address newWinner,
        uint256 newBid
    ) public onlyController {
        TokenAuctionStatus storage status = auctionStatus[tokenID];

        // not initialization
        if (status.endTime != 0) {
            status.winner = newWinner;
            status.userFunds[newWinner] = newBid;

            // extend end time if necessary, but do not exceed auctionHardEndTime.
            if (status.endTime - block.timestamp <= auctionExtendDuration) {
                status.endTime = block.timestamp + auctionExtendDuration;
                if (status.endTime > auctionHardEndTime) {
                    status.endTime = auctionHardEndTime; // probably not necessary but not bad to keep.
                }
            }

            // update top ten bids
            _updateTopBids(tokenID, newBid);
        } else {
            status.label = label;
            status.endTime = auctionInitialEndTime;
        }
    }

    function clearAuctionFunds(
        uint256 tokenID,
        address user
    ) public onlyController {
        TokenAuctionStatus storage status = auctionStatus[tokenID];
        status.userFunds[user] = 0;
    }

    function _updateTopBids(uint256 tokenID, uint256 newBid) private {
        // rank0 to rank9 will be used.
        uint8 rank = 10;
        // deduplication check
        bool update = false;
        uint8 endIndex = 9;
        for (; rank > 0; rank--) {
            // optimization: most bids won't make it to top 10.
            if (newBid < topBids[rank - 1].bid) {
                break;
            }
            if (!update && topBids[rank - 1].tokenID == tokenID) {
                update = true;
                endIndex = rank - 1;
            }
        }

        if (rank < 10) {
            for (uint8 j = endIndex; j > rank; j--) {
                topBids[j] = topBids[j - 1];
            }
            topBids[rank].tokenID = tokenID;
            topBids[rank].bid = newBid;
        }
    }

    //a token's top bid
    function topBid(uint256 tokenID) public view returns (uint256) {
        return auctionStatus[tokenID].userFunds[auctionStatus[tokenID].winner];
    }

    function userBidsView(
        address user
    ) public view returns (UserBidsView[] memory rv) {
        rv = new UserBidsView[](userStatus[user].bids.length);
        for (uint i = 0; i < userStatus[user].bids.length; i++) {
            uint256 tokenID = userStatus[user].bids[i];
            rv[i] = (
                UserBidsView(
                    auctionStatus[tokenID].label,
                    tokenID,
                    auctionStatus[tokenID].winner,
                    topBid(tokenID),
                    auctionStatus[tokenID].userFunds[user]
                )
            );
        }
    }

    function topBidsView() public view returns (TopBidView[10] memory rv) {
        for (uint i = 0; i < topBids.length; i++) {
            rv[i] = (
                TopBidView(
                    auctionStatus[topBids[i].tokenID].label,
                    topBids[i].bid
                )
            );
        }
    }

    function bidAmount(
        uint256 tokenID,
        address user
    ) public view returns (uint) {
        return auctionStatus[tokenID].userFunds[user];
    }

    function winnerOf(uint256 tokenID) public view returns (address) {
        return auctionStatus[tokenID].winner;
    }

    // returns true if @p user is the winner of auction on @p tokenID.
    function isWinner(
        address user,
        uint256 tokenID
    ) public view returns (bool) {
        return auctionStatus[tokenID].winner == user;
    }

    // returns the number of quota that the @p user can use in phase 2.
    function phase2Quota(address user) public view returns (uint8) {
        UserStatus storage us = userStatus[user];
        uint8 quota = us.quota;
        for (uint8 i = 0; i < us.bids.length; i++) {
            if (!isWinner(user, us.bids[i])) {
                quota++;
            }
        }
        quota -= us.consumedQuotaInFcfs;
        return quota;
    }

    function setUserQuota(
        address user,
        uint8 quota
    ) public onlyTldOwner(identifier) onlyBeforePreRegistrationStart {
        UserStatus storage us = userStatus[user];
        us.quota = quota;
        if (quota > 0) {
            us.hadQuota = true;
        }
    }

    function setUserQuotas(
        address[] calldata users,
        uint8[] calldata quotas
    ) public onlyTldOwner(identifier) onlyBeforePreRegistrationStart {
        require(users.length == quotas.length);
        for (uint i = 0; i < users.length; i++) {
            setUserQuota(users[i], quotas[i]);
        }
    }

    // Each bid to a new tokenID will consume a quota.
    // When the quota drops to 0, users can’t bid for a new name.
    function consumeAuctionQuota(
        address user,
        uint256 tokenID
    ) public onlyController {
        // if auction is not ended, keep recording bid info
        // if auction is ended, just decreasing the quota
        UserStatus storage us = userStatus[user];
        // user has bidded on this tokenID before, no more quota required.
        if (userStatus[user].bided[tokenID]) {
            return;
        }
        if (userStatus[user].quota < 1) {
            revert NotEnoughQuota();
        }
        us.bided[tokenID] = true;
        us.bids.push(tokenID);
        us.quota -= 1;
    }

    function consumeFcfsQuota(address user) public onlyController {
        UserStatus storage us = userStatus[user];
        if (phase2Quota(user) < 1) {
            revert NotEnoughQuota();
        }
        us.consumedQuotaInFcfs += 1;
    }

    function inAuction() public view returns (bool) {
        return (auctionEnabled &&
            (block.timestamp >= auctionStartTime) &&
            (block.timestamp <= auctionHardEndTime));
    }

    function inRetentionPeriod() public view returns (bool) {
        return
            (block.timestamp > auctionHardEndTime) &&
            (block.timestamp <=
                (auctionHardEndTime + auctionRetentionDuration));
    }

    function inFcfs() public view returns (bool) {
        return (fcfsEnabled &&
            (block.timestamp >= fcfsStartTime) &&
            (block.timestamp <= fcfsEndTime));
    }

    function inPreRegistration() public view returns (bool) {
        if (!auctionEnabled && !fcfsEnabled) {
            return false;
        }
        uint256 preRegiStartTime = preRegistrationStartTime();
        uint256 preRegiEndTime = preRegistrationEndTime();
        return ((block.timestamp >= preRegiStartTime) &&
            (block.timestamp <= preRegiEndTime));
    }

    function auctionEnded() public view returns (bool) {
        return (block.timestamp > auctionHardEndTime);
    }

    function auctionUserWithdrawEnded() public view returns (bool) {
        return (block.timestamp > (auctionHardEndTime + 14 days));
    }

    function preRegistrationStartTime() public view returns (uint256) {
        if (!auctionEnabled && !fcfsEnabled) {
            return 0;
        }
        return auctionEnabled ? auctionStartTime : fcfsStartTime;
    }

    function preRegistrationEndTime() public view returns (uint256) {
        if (!auctionEnabled && !fcfsEnabled) {
            return 0;
        }
        return fcfsEnabled ? fcfsEndTime : auctionHardEndTime;
    }

    /*
     * methods to update configs
     */
    function setAuctionConfigs(
        bool _enabled,
        uint _auctionStartTime,
        uint _auctionEndTime,
        uint _auctionExtendDuration,
        uint _auctionRetentionDuration,
        uint _auctionMinRegistrationDuration
    ) public onlyTldOwner(identifier) onlyBeforeAuctionStart {
        _setAuctionConfigs(
            _enabled,
            _auctionStartTime,
            _auctionEndTime,
            _auctionExtendDuration,
            _auctionRetentionDuration,
            _auctionMinRegistrationDuration
        );
    }

    function _setAuctionConfigs(
        bool _enabled,
        uint _auctionStartTime,
        uint _auctionEndTime,
        uint _auctionExtendDuration,
        uint _auctionRetentionDuration,
        uint _auctionMinRegistrationDuration
    ) internal {
        if (_enabled) {
            require(
                block.timestamp < _auctionStartTime,
                "invalid auctionStartTime"
            );
            require(
                block.timestamp < _auctionEndTime,
                "invalid auctionEndTime"
            );
            require(
                _auctionStartTime < _auctionEndTime,
                "invalid auctionStartTime"
            );
        }

        auctionEnabled = _enabled;
        auctionStartTime = _auctionStartTime;
        auctionInitialEndTime = _auctionEndTime;
        // todo: hard code for now change back to 1 day later
        auctionHardEndTime = auctionInitialEndTime + 1 days;
        auctionExtendDuration = _auctionExtendDuration;
        auctionRetentionDuration = _auctionRetentionDuration;
        auctionMinRegistrationDuration = _auctionMinRegistrationDuration;
        emit SetAuctionConfig(
            identifier,
            _enabled,
            _auctionStartTime,
            _auctionEndTime,
            _auctionExtendDuration,
            _auctionRetentionDuration,
            _auctionMinRegistrationDuration
        );
    }

    function setFcfsConfigs(
        bool _enabled,
        uint _fcfsStartTime,
        uint _fcfsEndTime
    ) public onlyTldOwner(identifier) onlyBeforeFcfsStart {
        _setFcfsConfigs(_enabled, _fcfsStartTime, _fcfsEndTime);
    }

    function _setFcfsConfigs(
        bool _enabled,
        uint _fcfsStartTime,
        uint _fcfsEndTime
    ) internal {
        if (_enabled) {
            require(
                _fcfsStartTime > auctionHardEndTime,
                "invalid fcfsStartTime"
            );
            require(_fcfsStartTime < _fcfsEndTime, "invalid fcfsStartTime");
        }

        fcfsEnabled = _enabled;
        fcfsStartTime = _fcfsStartTime;
        fcfsEndTime = _fcfsEndTime;
        emit SetFcfsConfig(identifier, _enabled, _fcfsStartTime, _fcfsEndTime);
    }

    function enableAuction(
        bool enabled
    ) public onlyTldOwner(identifier) onlyBeforeAuctionStart {
        auctionEnabled = enabled;
        emit SetAuctionEnabled(identifier, enabled);
    }

    function enableFcfs(
        bool enabled
    ) public onlyTldOwner(identifier) onlyBeforeAuctionStart {
        fcfsEnabled = enabled;
        emit SetFcfsEnabled(identifier, enabled);
    }

    /**
     * @dev To add a new controller which can update the preRegistration states
     * @param controller The address to set as new controller
     */
    function addController(
        address controller
    ) external onlyTldOwner(identifier) {
        require(controller != address(0));
        controllers[controller] = true;
        emit ControllerAdded(controller);
    }

    /**
     * @dev To remove a controller
     * @param controller The address to remove from the controller list
     */
    function removeController(
        address controller
    ) external onlyTldOwner(identifier) {
        require(controller != address(0));
        controllers[controller] = false;
        emit ControllerRemoved(controller);
    }

    /*
     * modifiers
     */
    modifier onlyController() {
        require(controllers[msg.sender], "Not a authorized controller");
        _;
    }

    modifier onlyBeforePreRegistrationStart() {
        uint256 preRegiStartTime = preRegistrationStartTime();
        if (block.timestamp >= preRegiStartTime) {
            revert PreRegistrationNotStarted();
        }
        _;
    }

    modifier onlyBeforeAuctionStart() {
        if (block.timestamp >= auctionStartTime) {
            revert AuctionStarted();
        }
        _;
    }

    modifier onlyBeforeFcfsStart() {
        if (block.timestamp >= fcfsStartTime) {
            revert FcfsStarted();
        }
        _;
    }
}
