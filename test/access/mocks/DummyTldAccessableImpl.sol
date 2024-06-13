// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../../../contracts/access/TldAccessable.sol";

contract DummyTldAccessableImpl is TldAccessable {
    constructor(ISANN _sann) TldAccessable(_sann) {}

    function testOnlyTldOwner(
        uint256 identifier
    ) public view onlyTldOwner(identifier) returns (bool) {
        return true;
    }

    function testOnlyFactory() public view onlyTldFactory returns (bool) {
        return true;
    }

    function testOnlyTldController()
        public
        view
        onlyTldController
        returns (bool)
    {
        return true;
    }

    function testOnlyPlatformAdmin()
        public
        view
        onlyPlatformAdmin
        returns (bool)
    {
        return true;
    }
}
