// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {Proxy} from "@openzeppelin/contracts/proxy/Proxy.sol";
import {ERC1967Upgrade} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Upgrade.sol";

contract ERC1967Proxy is Proxy, ERC1967Upgrade {

    address private immutable deployer;
    bytes32 private immutable nameHash;

    /**
     * @dev Initializes the upgradeable proxy with an initial implementation specified by `_logic`.
     *
     * If `_data` is nonempty, it's used as data in a delegate call to `_logic`. This will typically be an encoded
     * function call, and allows initializing the storage of the proxy like a Solidity constructor.
     */
    constructor(address _deployer, bytes32 _nameHash) payable {
        deployer = _deployer;
        nameHash = _nameHash;

    }

    function initialize(address implementation, bytes memory data) public {
        require(msg.sender == deployer, "ERC1967Proxy: unauthorized");
        ERC1967Upgrade._upgradeToAndCall(implementation, data, false);
    }

    /**
     * @dev Returns the current implementation address.
     */
    function _implementation() internal view virtual override returns (address impl) {
        return ERC1967Upgrade._getImplementation();
    }

}
