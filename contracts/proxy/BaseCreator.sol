// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IBaseCreator.sol";
import "../admin/SANN.sol";
import "../base/Base.sol";
import "../registry/SidRegistry.sol";
import "../access/TldAccessable.sol";

contract BaseCreator is IBaseCreator, TldAccessable {
    constructor(address _sann) TldAccessable(ISANN(_sann)) {}

    function create(
        address registry,
        uint256 identifier,
        string calldata tld,
        string calldata baseUri
    ) external override onlyTldFactory returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(identifier));
        return
            address(
                new Base{salt: salt}(
                    SANN(address(sann)),
                    SidRegistry(registry),
                    identifier,
                    tld,
                    baseUri
                )
            );
    }
}
