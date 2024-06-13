// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {SANN} from "../../../contracts/admin/SANN.sol";

contract DummyUpgradeableSANN is SANN {
    function dummyString() public pure returns (string memory) {
        return "New SANN";
    }
}
