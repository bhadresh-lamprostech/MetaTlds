// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IRenewPointHook {
    /**
     * @dev To calculate the amount of money can be deducted by points in this renewal
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _cost The sum of price came from price oracle.
     * @param _platformFee The platform fee of the registration.
     * @param _extraData The abi encoded extra data
     * @return dedcuted amount
     * @return Deductible platform fee credits
     */
    function calcRenewDeduction(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _platformFee,
        bytes calldata _extraData
    ) external view returns (uint256, uint256);

    /**
     * @dev To use points againts a certain amount of money in this renewal
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _cost The sum of price came from price oracle.
     * @param _platformFee The platform fee of the registration.
     * @param _extraData The abi encoded extra data
     * @return deducted amount
     * @return Deductible platform fee credits
     */
    function deductRenew(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _platformFee,
        bytes calldata _extraData
    ) external returns (uint256, uint256);
}
