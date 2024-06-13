// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IReferralHub} from "./IReferralHub.sol";
import {ISidRegistry} from "../registry/ISidRegistry.sol";
import {TldAccessable} from "../access/TldAccessable.sol";
import {ISANN} from "../admin/ISANN.sol";
import {IRewardHook} from "../hook/IRewardHook.sol";
import {IRenewRewardHook} from "../hook/IRenewRewardHook.sol";
import {IPriceOracle} from "../price-oracle/IPriceOracle.sol";
import {HookExtraData} from "../common/Struct.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract ReferralHub is
    IReferralHub,
    IRewardHook,
    IRenewRewardHook,
    ReentrancyGuard,
    Initializable,
    TldAccessable
{
    // Commission configuration
    struct Comission {
        // The number of minimum referrals that is required for the rate.
        uint256 minimumReferralCount;
        // Percentage of registration fee that will be deposited to referrer.
        uint256 referrerRate;
        // Percentage of registration fee that will be discounted to referee.
        uint256 refereeRate;
        // To distinguish whether this config line is initialized or not.
        bool isValid;
    }

    // Referral info which can be decoded from extraData
    struct ReferralInfo {
        // referrer's address
        address referrerAddress;
    }

    // map comission chart to a level
    mapping(uint256 => mapping(uint256 => Comission)) public comissionCharts;
    // map from referral address to the number of referrals of a tld identifier
    mapping(uint256 => mapping(address => uint256)) public referralCounts;
    // map address to the amount of bonus in WEI.
    mapping(address => uint256) public referralBalance;

    // default price oracle
    IPriceOracle public priceOracle;

    constructor(ISANN _sann) TldAccessable(_sann) {}

    function initialize(IPriceOracle _priceOracle) public initializer onlyPlatformAdmin {
        priceOracle = _priceOracle;
    }

    function setPriceOracle(IPriceOracle _priceOracle) external onlyPlatformAdmin {
        priceOracle = _priceOracle;
    }


    function calcReward(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) public view returns (IRewardHook.Reward[] memory rewards) {
        return
            _calcReward(
                _identifier,
                _name,
                _buyer,
                _duration,
                _cost,
                _revenue,
                _platformFee,
                _extraData
            );
    }

    function calcRenewReward(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) public view returns (IRenewRewardHook.RenewReward[] memory rewards) {
        IRewardHook.Reward[] memory tmpRewards = _calcReward(
            _identifier,
            _name,
            _buyer,
            _duration,
            _cost,
            _revenue,
            _platformFee,
            _extraData
        );
        rewards = new IRenewRewardHook.RenewReward[](2);
        rewards[0] = IRenewRewardHook.RenewReward({
            rewardReceiver: tmpRewards[0].rewardReceiver,
            rewardAmount: tmpRewards[0].rewardAmount
        });
        rewards[1] = IRenewRewardHook.RenewReward({
            rewardReceiver: tmpRewards[1].rewardReceiver,
            rewardAmount: tmpRewards[1].rewardAmount
        });
        return rewards;
    }

    /**
     * @dev To calculate the rewards if this registration succeed
     * @param _identifier The identifier of TLD
     * @param _name The name to be registered
     * @param _buyer The address to do the registration
     * @param _duration The duration of the registration
     * @param _cost The sum of price came from price oracle.
     * @param _revenue The revenue of the registration to TLD owner.
     * @param _platformFee The platform fee of the registration.
     * @param _extraData The abi encoded extra data
     */
    function reward(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) external payable onlyTldController {
        _reward(
            _identifier,
            _name,
            _buyer,
            _duration,
            _cost,
            _revenue,
            _platformFee,
            _extraData
        );
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
     */
    function rewardRenew(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) external payable onlyTldController {
        _reward(
            _identifier,
            _name,
            _buyer,
            _duration,
            _cost,
            _revenue,
            _platformFee,
            _extraData
        );
    }

    function _calcReward(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) internal view returns (IRewardHook.Reward[] memory rewards) {
        rewards = new IRewardHook.Reward[](2);
        ReferralInfo memory referralInfo;

        {
            if (_extraData.length == 0) {
                return rewards;
            }

            HookExtraData memory hookExtraData = abi.decode(
                _extraData,
                (HookExtraData)
            );

            if (hookExtraData.RewardHookExtraData.length == 0) {
                return rewards;
            }

            referralInfo = abi.decode(
                hookExtraData.RewardHookExtraData,
                (ReferralInfo)
            );
        }

        uint256 referrerFee = 0;
        uint256 refereeFee = 0;
        uint256 costInWei = priceOracle.attoUSDToWei(_cost);
        (referrerFee, refereeFee) = getReferralCommisionFee(
            _identifier,
            costInWei,
            referralInfo.referrerAddress
        );
        rewards[0] = IRewardHook.Reward({
            rewardReceiver: referralInfo.referrerAddress,
            rewardAmount: referrerFee
        });
        rewards[1] = IRewardHook.Reward({
            rewardReceiver: _buyer,
            rewardAmount: refereeFee
        });
        return rewards;
    }

    function _reward(
        uint256 _identifier,
        string calldata _name,
        address _buyer,
        uint256 _duration,
        uint256 _cost,
        uint256 _revenue,
        uint256 _platformFee,
        bytes calldata _extraData
    ) internal {
        IRewardHook.Reward[] memory rewards = calcReward(
            _identifier,
            _name,
            _buyer,
            _duration,
            _cost,
            _revenue,
            _platformFee,
            _extraData
        );

        uint256 referrerFee;
        uint256 refereeFee;
        referrerFee = rewards[0].rewardAmount;
        refereeFee = rewards[1].rewardAmount;

        _addNewReferralRecord(_identifier, rewards[0].rewardReceiver);

        if (referrerFee > 0) {
            referralBalance[rewards[0].rewardReceiver] += referrerFee;
        }
        if (refereeFee > 0) {
            referralBalance[rewards[1].rewardReceiver] += refereeFee;
        }

        // send remaining back to controller
        uint256 rewardCost = referrerFee + refereeFee;
        require(msg.value >= rewardCost, "Insufficient Fee");
        if (msg.value > rewardCost) {
            (bool sent, ) = msg.sender.call{value: msg.value - rewardCost}("");
            require(sent, "Failed to send Ether");
        }
    }

    modifier validLevel(uint256 _level) {
        require(_level >= 1 && _level <= 10, "Invalid level");
        _;
    }

    function getReferralCommisionFee(
        uint256 identifier,
        uint256 price,
        address addr
    ) public view returns (uint256, uint256) {
        uint256 referrerRate = 0;
        uint256 refereeRate = 0;
        uint256 level = 1;
        uint256 referralCount = _getReferralCount(identifier, addr);
        (level, referrerRate, refereeRate) = _getComissionChart(
            identifier,
            referralCount
        );
        uint256 referrerFee = (price * referrerRate) / 100;
        uint256 refereeFee = (price * refereeRate) / 100;
        return (referrerFee, refereeFee);
    }

    function _addNewReferralRecord(uint256 identifier, address addr) internal {
        referralCounts[identifier][addr] += 1;
        emit NewReferralRecord(identifier, addr);
    }

    function _getReferralCount(
        uint256 identifier,
        address addr
    ) internal view returns (uint256) {
        return referralCounts[identifier][addr];
    }

    function _getComissionChart(
        uint256 identifier,
        uint256 referralCount
    ) internal view returns (uint256, uint256, uint256) {
        uint256 curLevel = 1;
        uint256 referrerRate;
        uint256 refereeRate;
        uint256 level;
        while (
            comissionCharts[identifier][curLevel].isValid &&
            referralCount >=
            comissionCharts[identifier][curLevel].minimumReferralCount &&
            curLevel <= 10
        ) {
            referrerRate = comissionCharts[identifier][curLevel].referrerRate;
            refereeRate = comissionCharts[identifier][curLevel].refereeRate;
            level = curLevel;
            curLevel += 1;
        }
        return (level, referrerRate, refereeRate);
    }

    function getReferralDetails(
        uint256 identifier,
        address addr
    ) external view override returns (uint256, uint256, uint256, uint256) {
        uint256 referralCount = _getReferralCount(identifier, addr);
        (
            uint256 level,
            uint256 referrerRate,
            uint256 refereeRate
        ) = _getComissionChart(identifier, referralCount);
        return (referralCount, level, referrerRate, refereeRate);
    }

    function setComissionChart(
        uint256 identifier,
        uint256 level,
        uint256 minimumCount,
        uint256 referrerRate,
        uint256 refereeRate
    ) external onlyTldOwner(identifier) validLevel(level) {
        comissionCharts[identifier][level] = Comission(
            minimumCount,
            referrerRate,
            refereeRate,
            true
        );
        emit SetComissionChart(
            identifier,
            level,
            minimumCount,
            referrerRate,
            refereeRate
        );
    }

    /**
     * @dev To withdraw the referral reward
     */
    function withdraw() external nonReentrant {
        uint256 amount = referralBalance[msg.sender];
        require(amount > 0, "Insufficient balance");
        referralBalance[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit WithdrawRecord(msg.sender, amount);
    }
}
