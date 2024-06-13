// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IQualificationHook {
    /**
     * @dev To check if the buyer is qulified for the name
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _extraData The abi encoded extra data
     * @return If the buyer is qualified to register the name or not
     */
    function isQualified(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        bytes calldata _extraData
    ) external view returns (bool);

    /**
     * @dev To check if the buyer is qulified for the name
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _extraData The abi encoded extra data
     * @return If the buyer is qualified to register the name or not
     */
    function qualify(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        bytes calldata _extraData
    ) external returns (bool);
}
