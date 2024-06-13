// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {RegistrarController} from "../../../contracts/controller/RegistrarController.sol";

contract DummyUpgradeableRegistrar is RegistrarController {
    function dummyString() public pure returns (string memory) {
        return "New Registrar";
    }
}
