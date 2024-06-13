// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISANN {
    event NewTld(
        string tld,
        uint256 identifier,
        address owner,
        address base,
        address controller
    );
    event NewTldOwner(uint256 identifier, address owner);
    event NewTldFactory(address tldFactory);
    event NewPlatformAdmin(address tldFactory);
    event SetMinTldLength(uint256 minTldLength);
    event SetMaxTldLength(uint256 maxTldLength);
    event NewTldController(address tldController);

    function setTldFactory(address tldFactory) external;

    function setPlatformAdmin(address _platformAdmin) external;

    function setMinTldLength(uint256 _minTldLength) external;

    function setMaxTldLength(uint256 _maxTldLength) external;

    function setTldController(address _tldController) external;

    /// @return identifier based on the tld and owner address.
    function tldIdentifier(
        string calldata tld,
        address owner
    ) external view returns (uint256);

    /// register a new @param tld with @param owner.
    /// pre-condition: tld is valid and has not been registered.
    function registerTld(
        string calldata tld,
        uint256 identifier,
        address owner,
        address base
    ) external;

    /// transfer ownership of a node to @param newOwner.
    /// required if we need to upgrade the contract, we will need to
    /// transfer out all the *.identifier nodes to the new contract.
    function transferNodeOwner(bytes32 node, address newOwner) external;

    /// transfer the ownership of @param identifier to @param newOwner.
    function setTldOwner(uint256 identifier, address newOwner) external;

    function tld(uint256 identifier) external view returns (string memory);

    function tldOwner(uint256 identifier) external view returns (address);

    function tldBase(uint256 identifier) external view returns (address);

    function currentTldFactory() external view returns (address);

    function tldController() external view returns (address);

    function platformAdmin() external view returns (address);

    function chainId() external view returns (uint256);

    function registry() external view returns (address);
}
