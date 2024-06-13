// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ISANN.sol";
import {ISidRegistry} from "../registry/ISidRegistry.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

error InvalidTLD(string tld);

contract SANN is UUPSUpgradeable, Initializable, ISANN {
    /// chainId is used to identify the chain this contract is deployed on.
    /// It is also used during generating unique identifier for each TLD.
    uint256 public chainId;

    /// Authorized contract that creates the TLD.
    address public currentTldFactory;

    /// Authorized contract that controls all the TLDs.
    address public currentTldController;

    /// Platform admin address.
    address public platformAdmin;

    /// name registry contract address.
    address public registry;

    /// minimal length of TLD.
    uint256 public minTldLength;

    /// maximal length of TLD.
    uint256 public maxTldLength;

    /// Metadata of a TLD
    struct TldInfo {
        /// the ASCII string of the TLD
        string tld;
        /// TLD owner
        address owner;
        /// base contract address
        /// cannot be changed after deployment by tld owner
        address base;
    }

    /// TLD identifier => TLD info (metadata)
    mapping(uint256 => TldInfo) public tldInfos;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// Create a domain registry contract
    /// @param _domainRegistry as the name registry contract address.
    /// @param _platformAdmin is the platform admin address.
    /// msg.sender will be the owner of the contract.

    function initialize(
        address _domainRegistry,
        address _platformAdmin
    ) external initializer {
        chainId = block.chainid;
        currentTldFactory = address(0);
        platformAdmin = _platformAdmin;
        emit NewPlatformAdmin(platformAdmin);
        registry = _domainRegistry;
        minTldLength = 3;
        emit SetMinTldLength(minTldLength);
        maxTldLength = 5;
        emit SetMaxTldLength(maxTldLength);
    }

    modifier onlyValidTldFactory() {
        require(msg.sender == currentTldFactory, "only valid tld factory");
        _;
    }

    modifier onlyTldOwner(uint256 identifier) {
        require(tldInfos[identifier].owner == msg.sender, "only tld owner");
        _;
    }

    modifier onlyPlatformAdmin() {
        require(msg.sender == platformAdmin, "only platform admin");
        _;
    }

    modifier onlyPlatformAdminOrTldFactory() {
        require(
            msg.sender == platformAdmin || msg.sender == currentTldFactory,
            "only platform admin or current tld factory"
        );
        _;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyPlatformAdmin {}

    function setTldFactory(address tldFactory) external onlyPlatformAdmin {
        currentTldFactory = tldFactory;
        emit NewTldFactory(currentTldFactory);
    }

    function setPlatformAdmin(
        address _platformAdmin
    ) external onlyPlatformAdmin {
        platformAdmin = _platformAdmin;
        emit NewPlatformAdmin(platformAdmin);
    }

    function setMinTldLength(uint256 _minTldLength) external onlyPlatformAdmin {
        minTldLength = _minTldLength;
        emit SetMinTldLength(minTldLength);
    }

    function setMaxTldLength(uint256 _maxTldLength) external onlyPlatformAdmin {
        maxTldLength = _maxTldLength;
        emit SetMaxTldLength(maxTldLength);
    }

    function setTldController(
        address _tldController
    ) external onlyPlatformAdmin {
        currentTldController = _tldController;
        emit NewTldController(currentTldController);
    }

    /// @return tld of @param identifier.
    function tld(uint256 identifier) external view returns (string memory) {
        return tldInfos[identifier].tld;
    }

    /// @return tld_owner address of @param identifier.
    function tldOwner(uint256 identifier) public view returns (address) {
        return tldInfos[identifier].owner;
    }

    /// @return tld_controller contract address of @param identifier.
    function tldController() public view returns (address) {
        return currentTldController;
    }

    /// @return tld_base contract address of @param identifier.
    function tldBase(uint256 identifier) public view returns (address) {
        return tldInfos[identifier].base;
    }

    /// @return identifier based on the tld and owner address.
    function tldIdentifier(
        string calldata tldName,
        address owner
    ) public view returns (uint256) {
        return
            (chainId << 224) |
            (uint256(keccak256(abi.encodePacked(owner, tldName))) >> 32);
    }

    /// register a new @param tldName with @param owner.
    /// premise:
    ///   1. Only callable by TldFactory.
    ///   2. @param identifier is computed using the above tldIdentifier function.
    ///   3. @param base is the NFT contract.
    function registerTld(
        string calldata tldName,
        uint256 identifier,
        address owner,
        address base
    ) external onlyValidTldFactory {
        require(owner != address(0), "invalid owner address");
        require(base != address(0), "invalid base address");
        if (!_isValidTld(tldName)) {
            revert InvalidTLD(tldName);
        }

        require(
            bytes(tldInfos[identifier].tld).length == 0,
            "TLD has been registered"
        );
        tldInfos[identifier].tld = tldName;
        tldInfos[identifier].owner = owner;
        tldInfos[identifier].base = base;
        emit NewTld(tldName, identifier, owner, base, currentTldController);

        // setup node ownership in registry
        // 1. set *.identifier node to this contract.
        bytes32 identifierSubNode = ISidRegistry(registry).setSubnodeOwner(
            bytes32(0),
            bytes32(identifier),
            address(this)
        );
        // 2. give *.tld.identifier node to base contract.
        bytes32 tldHash = keccak256(bytes(tldName));
        ISidRegistry(registry).setSubnodeOwner(
            identifierSubNode,
            tldHash,
            base
        );
    }

    /// transfer ownership of a node to @param newOwner.
    /// required if we need to upgrade the contract, we will need to
    /// transfer out all the *.identifier nodes to the new contract.
    function transferNodeOwner(
        bytes32 node,
        address newOwner
    ) external onlyPlatformAdmin {
        require(newOwner != address(0), "zero address");
        ISidRegistry(registry).setOwner(node, newOwner);
    }

    /// transfer the ownership of @param identifier to @param newOwner.
    function setTldOwner(
        uint256 identifier,
        address newOwner
    ) external override onlyTldOwner(identifier) {
        tldInfos[identifier].owner = newOwner;
        emit NewTldOwner(identifier, newOwner);
    }

    /**
     * @dev check if tld is valid with valid charset [a-z][0-9] and configurable max length and min length
     * @param tldName top level domain in string
     */
    function _isValidTld(string calldata tldName) internal view returns (bool) {
        bytes calldata tldBytes = bytes(tldName);
        uint length = tldBytes.length;
        if (length < minTldLength || length > maxTldLength) {
            return false;
        }
        for (uint i = 0; i < length; i++) {
            bytes1 char = tldBytes[i];
            if (
                !(char >= 0x61 && char <= 0x7A) &&
                !(char >= 0x30 && char <= 0x39)
            ) {
                return false;
            }
        }
        return true;
    }
}
