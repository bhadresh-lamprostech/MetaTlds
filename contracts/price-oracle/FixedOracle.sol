// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

contract FixedOracle {

    int256 immutable value;
    uint8 immutable decimals_val;

    constructor(int256 _value, uint8 _decimals) {
        value = _value;
        decimals_val = _decimals;
    }

    function latestAnswer() public view returns (int256) {
        return value;
    }

    function decimals() public view returns (uint8) {
        return decimals_val;
    }
}

