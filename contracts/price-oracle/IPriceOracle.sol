// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IPriceOracle {
    event SetPrice(uint256 identifier, uint8 letter, uint64 newPrice);

    struct Price {
        uint256 base;
        uint256 premium;
    }

    function price(
        string calldata name,
        uint256 expires,
        uint256 duration,
        uint256 identifier
    ) external view returns (Price calldata);

    function priceInWei(
        string calldata name,
        uint256 expires,
        uint256 duration,
        uint256 identifier
    ) external view returns (Price calldata);

    function initTldPriceModel(uint256 identifier) external;

    function attoUSDToWei(uint256 amount) external view returns (uint256);

    function weiToAttoUSD(uint256 amount) external view returns (uint256);

    function setTldPriceModel(
        uint256 identifier,
        uint8 letter,
        uint64 newPrice
    ) external;
}
