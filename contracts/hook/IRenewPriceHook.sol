// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IRenewPriceHook {
    /**
     * @dev To calculate the new price for this renewal
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _cost The sum of price came from price oracle.
     * @param _extraData The abi encoded extra data
     * @return new price
     */
    function calcRenewNewPrice(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        bytes calldata _extraData
    ) external view returns (uint256);

    /**
     * @dev To apply a new price to this renewal
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _cost The sum of price came from price oracle.
     * @param _extraData The abi encoded extra data
     * @return new price
     */
    function newRenewPrice(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        bytes calldata _extraData
    ) external returns (uint256);
}
