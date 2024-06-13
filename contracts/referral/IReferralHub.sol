// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

interface IReferralHub {
    event NewReferralRecord(uint256 identifier, address indexed addr);
    event DepositRecord(address indexed addr, uint256 amount);
    event WithdrawRecord(address indexed addr, uint256 amount);
    event SetComissionChart(
        uint256 identifier,
        uint256 level,
        uint256 minimumCount,
        uint256 referrerRate,
        uint256 refereeRate
    );

    //get a domain's referral count, referral comission and referee comission
    function getReferralDetails(
        uint256 tld,
        address addr
    ) external view returns (uint256, uint256, uint256, uint256);

    function getReferralCommisionFee(
        uint256 identifier,
        uint256 price,
        address addr
    ) external view returns (uint256, uint256);

    function withdraw() external;
}
