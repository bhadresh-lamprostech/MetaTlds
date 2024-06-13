// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/// Contract interface allowing TLD owners to prepaid platform fee.
interface IPrepaidPlatformFee {
    event PlatformFeeDeposit(uint256 identifier, uint256 usdAmount);
    event PlatformFeeDeduct(uint256 identifier, uint256 usdAmount);
    event PlatformFeeWithdraw(uint256 amount);

    /// add platform fee credit in USD for @param identifier tld.
    function deposit(uint256 identifier) external payable;

    /// @param identifier identifier of the tld.
    /// Only authorized contract, usually the active controller,
    /// is allowed to deduct the @param amount from its prepaid balance for @param identifier.
    /// The authentication is done by the caller.
    function deduct(uint256 identifier, uint256 amount) external;
}
