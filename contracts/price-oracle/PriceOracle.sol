// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../common/StringUtils.sol";
import "./IPriceOracle.sol";
import "../access/TldAccessable.sol";
import "../admin/ISANN.sol";
import "../common/AggregatorInterface.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract PriceOracle is IPriceOracle, TldAccessable, Initializable {
    using StringUtils for *;

    mapping(uint256 => mapping(uint8 => uint64)) private prices;

    uint64 constant DEFAULT_LETTER_PRICE = type(uint64).max;

    uint256 constant GRACE_PERIOD = 90 days;
    uint256 public startPremium;
    uint256 public endValue;

    // Oracle address
    AggregatorInterface public usdOracle;

    constructor(
        ISANN _sann
    ) TldAccessable(_sann) {}

    function initialize(
        AggregatorInterface _usdOracle,
        uint256 _startPremium,
        uint256 totalDays
    ) public initializer onlyPlatformAdmin {
        usdOracle = _usdOracle;
        startPremium = _startPremium;
        endValue = _startPremium >> totalDays;
    }

    /**
     * @dev To initialize the price model for a new TLD.
     *      Only can be called by TLD factory
     * @param identifier The new idntifier of new TLD
     */
    function initTldPriceModel(
        uint256 identifier
    ) external virtual onlyTldFactory {
        _initTldPriceModel(identifier);
    }

    function _initTldPriceModel(uint256 identifier) internal {
        for (uint8 i = 1; i <= 5; i++) {
            prices[identifier][i] = DEFAULT_LETTER_PRICE;
            emit SetPrice(identifier, i, DEFAULT_LETTER_PRICE);
        }
    }

    /**
     * @dev To update price model config.
     *      Only can be called by TLD owner
     * @param identifier The new idntifier of TLD
     * @param letter The length of name
     * @param newPrice The new price in USD per second
     */
    function setTldPriceModel(
        uint256 identifier,
        uint8 letter,
        uint64 newPrice
    ) external onlyTldOwner(identifier) {
        require(letter <= 5);
        prices[identifier][letter] = newPrice;

        emit SetPrice(identifier, letter, newPrice);
    }

    /**
     * @dev Returns the pricing premium in wei.
     */
    function premium(
        string calldata name,
        uint256 expires,
        uint256 duration
    ) external view returns (uint256) {
        return attoUSDToWei(_premium(name, expires, duration));
    }

    /**
     * @dev Returns the registration price in USD
     * @param name The name want to register
     * @param expires The expiration timestamp of the name
     * @param duration The duration want to register
     * @param identifier The identifier of TLD
     * @return the registration price including premium fee
     */
    function price(
        string calldata name,
        uint256 expires,
        uint256 duration,
        uint256 identifier
    ) public view returns (IPriceOracle.Price memory) {
        uint256 len = name.strlen();

        uint256 basePrice;
        uint8 letter;
        if (len > 5) {
            letter = 5;
        } else {
            letter = uint8(len);
        }
        uint64 letterPrice = prices[identifier][letter];
        if (letterPrice == DEFAULT_LETTER_PRICE) {
            basePrice = DEFAULT_LETTER_PRICE;
        } else {
            basePrice = letterPrice * duration;
        }
        return
            IPriceOracle.Price({
                base: basePrice,
                premium: _premium(name, expires, duration)
            });
    }

    /**
     * @dev Returns the registration price in WEI
     */
    function priceInWei(
        string calldata name,
        uint256 expires,
        uint256 duration,
        uint256 identifier
    ) external view returns (IPriceOracle.Price memory) {
        IPriceOracle.Price memory namePrice = price(
            name,
            expires,
            duration,
            identifier
        );
        return
            IPriceOracle.Price({
                base: attoUSDToWei(namePrice.base),
                premium: attoUSDToWei(namePrice.premium)
            });
    }

    function attoUSDToWei(uint256 amount) public view returns (uint256) {
        if (amount == DEFAULT_LETTER_PRICE) {
            return DEFAULT_LETTER_PRICE;
        }
        uint256 tokenPrice = uint256(usdOracle.latestAnswer());
        uint8 decimals = usdOracle.decimals();
        return (amount * (10 ** decimals)) / tokenPrice;
    }

    function weiToAttoUSD(uint256 amount) public view returns (uint256) {
        uint256 tokenPrice = uint256(usdOracle.latestAnswer());
        uint8 decimals = usdOracle.decimals();
        return (amount * tokenPrice) / (10 ** decimals);
    }

    function setUsdOracle(address _usdOracle) external onlyPlatformAdmin {
        usdOracle = AggregatorInterface(_usdOracle);
    }

    uint256 constant PRECISION = 1e18;
    uint256 constant bit1 = 999989423469314432; // 0.5 ^ 1/65536 * (10 ** 18)
    uint256 constant bit2 = 999978847050491904; // 0.5 ^ 2/65536 * (10 ** 18)
    uint256 constant bit3 = 999957694548431104;
    uint256 constant bit4 = 999915390886613504;
    uint256 constant bit5 = 999830788931929088;
    uint256 constant bit6 = 999661606496243712;
    uint256 constant bit7 = 999323327502650752;
    uint256 constant bit8 = 998647112890970240;
    uint256 constant bit9 = 997296056085470080;
    uint256 constant bit10 = 994599423483633152;
    uint256 constant bit11 = 989228013193975424;
    uint256 constant bit12 = 978572062087700096;
    uint256 constant bit13 = 957603280698573696;
    uint256 constant bit14 = 917004043204671232;
    uint256 constant bit15 = 840896415253714560;
    uint256 constant bit16 = 707106781186547584;

    /**
     * @dev Returns the pricing premium in internal base units.
     */
    function _premium(
        string memory,
        uint256 expires,
        uint256
    ) internal view returns (uint256) {
        expires = expires + GRACE_PERIOD;
        if (expires > block.timestamp) {
            return 0;
        }

        uint256 elapsed = block.timestamp - expires;
        uint256 premium = decayedPremium(startPremium, elapsed);
        if (premium >= endValue) {
            return premium - endValue;
        }
        return 0;
    }

    /**
     * @dev Returns the premium price at current time elapsed
     * @param _startPremium starting price
     * @param elapsed time past since expiry
     */
    function decayedPremium(
        uint256 _startPremium,
        uint256 elapsed
    ) public pure returns (uint256) {
        uint256 daysPast = (elapsed * PRECISION) / 1 days;
        uint256 intDays = daysPast / PRECISION;
        uint256 premium = _startPremium >> intDays;
        uint256 partDay = (daysPast - intDays * PRECISION);
        uint256 fraction = (partDay * (2 ** 16)) / PRECISION;
        uint256 totalPremium = addFractionalPremium(fraction, premium);
        return totalPremium;
    }

    function addFractionalPremium(
        uint256 fraction,
        uint256 premium
    ) internal pure returns (uint256) {
        if (fraction & (1 << 0) != 0) {
            premium = (premium * bit1) / PRECISION;
        }
        if (fraction & (1 << 1) != 0) {
            premium = (premium * bit2) / PRECISION;
        }
        if (fraction & (1 << 2) != 0) {
            premium = (premium * bit3) / PRECISION;
        }
        if (fraction & (1 << 3) != 0) {
            premium = (premium * bit4) / PRECISION;
        }
        if (fraction & (1 << 4) != 0) {
            premium = (premium * bit5) / PRECISION;
        }
        if (fraction & (1 << 5) != 0) {
            premium = (premium * bit6) / PRECISION;
        }
        if (fraction & (1 << 6) != 0) {
            premium = (premium * bit7) / PRECISION;
        }
        if (fraction & (1 << 7) != 0) {
            premium = (premium * bit8) / PRECISION;
        }
        if (fraction & (1 << 8) != 0) {
            premium = (premium * bit9) / PRECISION;
        }
        if (fraction & (1 << 9) != 0) {
            premium = (premium * bit10) / PRECISION;
        }
        if (fraction & (1 << 10) != 0) {
            premium = (premium * bit11) / PRECISION;
        }
        if (fraction & (1 << 11) != 0) {
            premium = (premium * bit12) / PRECISION;
        }
        if (fraction & (1 << 12) != 0) {
            premium = (premium * bit13) / PRECISION;
        }
        if (fraction & (1 << 13) != 0) {
            premium = (premium * bit14) / PRECISION;
        }
        if (fraction & (1 << 14) != 0) {
            premium = (premium * bit15) / PRECISION;
        }
        if (fraction & (1 << 15) != 0) {
            premium = (premium * bit16) / PRECISION;
        }
        return premium;
    }
}
