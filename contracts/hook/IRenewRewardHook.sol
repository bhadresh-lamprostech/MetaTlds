// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IRenewRewardHook {
    struct RenewReward {
        address rewardReceiver; // the address to receive reward
        uint256 rewardAmount; // the amount of reward can be received
    }

    /**
     * @dev To calculate the rewards if this renewal succeed
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _cost The sum of price came from price oracle.
     * @param _revenue The revenue of the registration to TLD owner.
     * @param _platformFee The platform fee of the registration.
     * @param _extraData The abi encoded extra data
     * @return Reward details
     */
    function calcRenewReward(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) external view returns (RenewReward[] memory);

    function rewardRenew(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) external payable;
}
