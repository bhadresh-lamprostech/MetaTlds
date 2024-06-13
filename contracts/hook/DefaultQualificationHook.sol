// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {TldAccessable} from "../access/TldAccessable.sol";
import {IQualificationHook} from "../hook/IQualificationHook.sol";
import {PreRegistrationState} from "../preregistration/PreRegistrationState.sol";
import {ISANN} from "../admin/ISANN.sol";

error PublicRegistrationStarted();
error PublicRegistrationNotStarted();

contract DefaultQualificationHook is TldAccessable, IQualificationHook {
    uint256 public publicRegistrationStartTime;
    bool public publicRegistrationPaused;
    PreRegistrationState public preRegiState;

    // identifier of TLD
    uint256 public immutable identifier;

    event SetPublicRegistrationStartTime(uint256 identifier, uint256 startTime);
    event SetPublicRegistrationPaused(uint256 identifier, bool paused);

    constructor(
        ISANN _sann,
        uint256 _identifier,
        PreRegistrationState _state,
        uint256 _publicRegistrationStartTime,
        bool _publicRegistrationPaused
    ) TldAccessable(_sann) {
        identifier = _identifier;
        preRegiState = _state;

        uint256 preRegiEndTime;
        if (address(preRegiState) != address(0)) {
            preRegiEndTime = preRegiState.preRegistrationEndTime();
        }
        require(
            preRegiEndTime <= _publicRegistrationStartTime,
            "new publicRegistrationStartTime must be greater than preRegistrationEndTime"
        );
        publicRegistrationStartTime = _publicRegistrationStartTime;
        publicRegistrationPaused = _publicRegistrationPaused;
        emit SetPublicRegistrationStartTime(
            identifier,
            _publicRegistrationStartTime
        );
        emit SetPublicRegistrationPaused(identifier, _publicRegistrationPaused);
    }

    /**
     * @dev To check if name is available for the buyer and
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _extraData The abi encoded extra data
     * @return If the buyer is qualified to register the name or not
     */
    function isQualified(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        bytes calldata _extraData
    ) public view returns (bool) {
        (bool qualified, ) = _isQualified(
            _identifier,
            _name,
            _buyer,
            _duration,
            _extraData
        );
        return qualified;
    }

    function qualify(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        bytes calldata _extraData
    ) external onlyTldController returns (bool) {
        (bool qualified, bool needToConsumeQuota) = _isQualified(
            _identifier,
            _name,
            _buyer,
            _duration,
            _extraData
        );

        if (needToConsumeQuota) {
            // consume quota only
            // add this hook as preRegiState's controller to get the cosuming access
            preRegiState.consumeFcfsQuota(_buyer);
        }

        return qualified;
    }

    /**
     * @dev To check if name is available for the buyer and
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _extraData The abi encoded extra data
     * @return If the buyer is qualified to register the name or not
     * @return If it needs to consume buyer's quota or not
     */
    function _isQualified(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        bytes calldata _extraData
    ) private view returns (bool, bool) {
        uint256 tokenID = uint256(keccak256(bytes(_name)));

        // name reserving logic
        // tldOwner can register names
        // before preRegistration and publicRegistration
        if (sann.tldOwner(identifier) == _buyer) {
            if (block.timestamp < publicRegistrationStartTime) {
                if (address(preRegiState) != address(0)) {
                    uint256 preRegiStartTime = preRegiState
                        .preRegistrationStartTime();
                    if (
                        (preRegiStartTime == 0) ||
                        (block.timestamp < preRegiStartTime)
                    ) {
                        return (true, false);
                    }
                } else {
                    return (true, false);
                }
            }
        }

        // phase 1 - auction
        if (address(preRegiState) != address(0)) {
            if (preRegiState.auctionEnabled()) {
                // if the auction is not ended, no one can register any names
                if (block.timestamp <= preRegiState.auctionHardEndTime()) {
                    return (false, false);
                }

                if (preRegiState.inRetentionPeriod()) {
                    // if name is still in the retention period and it has an auction winner
                    // no one can register it except the winner
                    address winner = preRegiState.winnerOf(tokenID);
                    if (winner == _buyer) {
                        return (true, false);
                    } else if (winner != address(0)) {
                        return (false, false);
                    }
                }
            }

            // phase 2 - FCFS registration
            if (preRegiState.fcfsEnabled()) {
                // if FCFS has not started yet, no one can register names
                if (block.timestamp < preRegiState.fcfsStartTime()) {
                    return (false, false);
                }
                // if FCFS has not ended
                if (block.timestamp <= preRegiState.fcfsEndTime()) {
                    // anyone who has no quatas can not register names
                    if (preRegiState.phase2Quota(_buyer) <= 0) {
                        return (false, false);
                    }

                    return (true, true);
                }
            }
        }

        // public registration
        if (block.timestamp < publicRegistrationStartTime) {
            return (false, false);
        }
        if (publicRegistrationPaused) {
            return (false, false);
        }

        return (true, false);
    }

    modifier onlyBeforePublicRegiStart() {
        if (block.timestamp >= publicRegistrationStartTime) {
            revert PublicRegistrationStarted();
        }
        _;
    }

    modifier onlyAfterPublicRegiStart() {
        if (block.timestamp < publicRegistrationStartTime) {
            revert PublicRegistrationNotStarted();
        }
        _;
    }

    function setPublicRegistrationStartTime(
        uint256 _publicRegistrationStartTime
    ) public onlyTldOwner(identifier) onlyBeforePublicRegiStart {
        require(
            block.timestamp < _publicRegistrationStartTime,
            "new publicRegistrationStartTime must be greater than now"
        );

        uint256 preRegiEndTime = preRegiState.preRegistrationEndTime();
        require(
            preRegiEndTime < _publicRegistrationStartTime,
            "new publicRegistrationStartTime must be greater than preRegistrationEndTime"
        );

        publicRegistrationStartTime = _publicRegistrationStartTime;
        emit SetPublicRegistrationStartTime(
            identifier,
            _publicRegistrationStartTime
        );
    }

    function setPublicRegistrationPaused(
        bool _paused
    ) public onlyTldOwner(identifier) onlyAfterPublicRegiStart {
        publicRegistrationPaused = _paused;
        emit SetPublicRegistrationPaused(identifier, _paused);
    }

    function setPreRegistrationState(
        address _state
    ) public onlyTldOwner(identifier) {
        preRegiState = PreRegistrationState(_state);
    }
}
