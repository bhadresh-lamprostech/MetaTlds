// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import {StringUtils} from "../../../contracts/common/StringUtils.sol";

contract Dummy {
    using StringUtils for string;

    constructor() {}

    function containsZeroWidthChar(
        string calldata name
    ) public pure returns (bool) {
        return !name.notContainsZeroWidth();
    }
}
