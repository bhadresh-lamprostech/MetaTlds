// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "../admin/ISANN.sol";
import "../access/TldAccessable.sol";

contract GiftCardLedger is TldAccessable {
    mapping(address => bool) public controllers;
    mapping(uint256 => mapping(address => bool)) public tldControllers;

    mapping(address => mapping(uint256 => uint256)) public balances;

    event ControllerAdded(address indexed controller);
    event ControllerRemoved(address indexed controller);
    event TldControllerAdded(uint256 identifier, address indexed controller);
    event TldControllerRemoved(uint256 identifier, address indexed controller);

    constructor(ISANN _sann) TldAccessable(_sann) {}

    modifier onlyController() {
        require(controllers[msg.sender], "Not a authorized controller");
        _;
    }

    modifier onlyTldGiftCardController(uint256 identifier) {
        require(
            tldControllers[identifier][msg.sender],
            "Not a authorized controller"
        );
        _;
    }

    /**
     * @dev To return balance of points
     * @param identifier The identifier of TLD
     * @param account The address to deduct from
     * @return balance of points
     */
    function balanceOf(
        uint256 identifier,
        address account
    ) public view returns (uint256) {
        return balances[account][identifier];
    }

    /**
     * @dev To charge points
     * @param identifier The identifier of TLD
     * @param account The address to charge to
     * @param amount The amount to charge
     */
    function redeem(
        uint256 identifier,
        address account,
        uint256 amount
    ) external onlyController {
        balances[account][identifier] += amount;
    }

    /**
     * @dev To deduct the point
     * @param identifier The identifier of TLD
     * @param account The address to deduct from
     * @param amount The amount to deduct
     */
    function deduct(
        uint256 identifier,
        address account,
        uint256 amount
    ) public onlyTldGiftCardController(identifier) {
        uint256 fromBalance = balances[account][identifier];
        require(fromBalance >= amount, "Insufficient balance");
        balances[account][identifier] = fromBalance - amount;
    }

    /**
     * @dev To add a new tld controller which can deduct the point
     * @param controller The address to set as new controller
     */
    function addTldGiftCardController(
        uint256 identifier,
        address controller
    ) external onlyTldOwner(identifier) {
        require(controller != address(0), "address can not be zero!");
        tldControllers[identifier][controller] = true;
        emit TldControllerAdded(identifier, controller);
    }

    /**
     * @dev To remove a tld controller
     * @param controller The address to remove from the tld controller list
     */
    function removeTldGiftCardController(
        uint256 identifier,
        address controller
    ) external onlyTldOwner(identifier) {
        require(controller != address(0), "address can not be zero!");
        tldControllers[identifier][controller] = false;
        emit TldControllerRemoved(identifier, controller);
    }

    /**
     * @dev To add a new controller which can redeem the point
     * @param controller The address to set as new controller
     */
    function addController(address controller) external onlyPlatformAdmin {
        require(controller != address(0), "address can not be zero!");
        controllers[controller] = true;
        emit ControllerAdded(controller);
    }

    /**
     * @dev To remove a controller
     * @param controller The address to remove from the controller list
     */
    function removeController(address controller) external onlyPlatformAdmin {
        require(controller != address(0), "address can not be zero!");
        controllers[controller] = false;
        emit ControllerRemoved(controller);
    }
}
