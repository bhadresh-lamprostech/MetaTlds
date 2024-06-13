// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {PreRegistrationState} from "../preregistration/PreRegistrationState.sol";
import {Auction} from "../preregistration/Auction.sol";
import {IRegistrarController} from "../controller/IRegistrarController.sol";
import {IPlatformConfig} from "../admin/IPlatformConfig.sol";
import {ISANN} from "../admin/ISANN.sol";
import {PreRegistrationUpdateConfig} from "../common/Struct.sol";
import {IPreRegistrationCreator} from "./IPreRegistrationCreator.sol";
import {PrepaidPlatformFee} from "../admin/PrepaidPlatformFee.sol";
import {ISANN} from "../admin/ISANN.sol";
import {TldAccessable} from "../access/TldAccessable.sol";

contract PreRegistrationCreator is IPreRegistrationCreator, TldAccessable {
    constructor(ISANN _sann) TldAccessable(_sann) {}

    function create(
        address sann,
        uint256 identifier,
        address tldOwner,
        address controller,
        address platformConfig,
        address prepaidPlatformFee,
        PreRegistrationUpdateConfig calldata config
    ) public onlyTldFactory returns (address, address) {
        bytes32 salt = keccak256(abi.encodePacked(identifier));
        PreRegistrationState newPreRegistrationState = new PreRegistrationState{
            salt: salt
        }(ISANN(sann), identifier, config);

        emit PreRegistrationStateCreated(
            address(newPreRegistrationState),
            msg.sender,
            identifier
        );

        Auction newAuction;
        if (config.enableAuction) {
            newAuction = Auction(
                createAuction(
                    sann,
                    identifier,
                    tldOwner,
                    controller,
                    platformConfig,
                    address(newPreRegistrationState),
                    prepaidPlatformFee
                )
            );
        }

        return (address(newPreRegistrationState), address(newAuction));
    }

    function createAuction(
        address sann,
        uint256 identifier,
        address tldOwner,
        address controller,
        address platformConfig,
        address preRegiState,
        address prepaidPlatformFeeAddr
    ) public onlyTldFactory returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(identifier));
        Auction newAuction = new Auction{salt: salt}(
            ISANN(sann),
            identifier,
            IRegistrarController(controller),
            PreRegistrationState(preRegiState),
            IPlatformConfig(platformConfig),
            PrepaidPlatformFee(prepaidPlatformFeeAddr)
        );

        emit AuctionCreated(address(newAuction), msg.sender, identifier);
        return address(newAuction);
    }
}
