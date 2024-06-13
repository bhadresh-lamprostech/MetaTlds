// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {ISANN} from "../admin/ISANN.sol";
import "hardhat/console.sol";
/*
 * @dev TldAccessable is a base contract for contracts that need access control on TLD.
 * Roles:
 * 1. TLD owner: the owner of the TLD.
 * 2. TLD factory: the factory contract that creates the TLD.
 * 3. TLD controller: the controller contract of the TLD.
 * 4. Platform admin: the admin of the platform, i.e. Space ID DAO
 */
abstract contract TldAccessable {
    ISANN public sann;

    constructor(ISANN _sann) {
        sann = _sann;
    }

    /// require the caller is the TLD owner of the identifier.
    modifier onlyTldOwner(uint256 identifier) {
        require(
            sann.tldOwner(identifier) == msg.sender,
            "Ownable: caller is not the tld owner"
        );
        _;
    }

    /// require the caller is the TLD factory.
    modifier onlyTldFactory() {
        require(
            sann.currentTldFactory() == msg.sender,
            "Accessible: caller is not the factory"
        );
        _;
    }

    /// require the caller is the TLD controller of the identifier.
    modifier onlyTldController() {
        require(
            sann.tldController() == msg.sender,
            "Accessible: caller is not the tld controller"
        );
        _;
    }

    /// require the caller is the platform admin.
    modifier onlyPlatformAdmin() {
        require(
            sann.platformAdmin() == msg.sender,
            "Accessible: caller is not the platform admin"
        );
        _;
    }
}
