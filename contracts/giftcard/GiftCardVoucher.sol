// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;
import "../access/TldAccessable.sol";
import "../admin/ISANN.sol";

contract GiftCardVoucher is TldAccessable {
    mapping(uint256 => uint256) public voucherValues;
    mapping(uint256 => uint256) public voucherTlds;

    event CustomizedVoucherAdded(
        uint256 indexed tokenId,
        uint256 indexed price,
        uint256 indexed identifier
    );

    constructor(ISANN _sann) TldAccessable(_sann) {}

    function addCustomizedVoucher(
        uint256 identifier,
        uint256 price
    ) external onlyTldOwner(identifier) returns (uint256) {
        bytes32 label = keccak256(bytes.concat(bytes32(identifier), bytes32(price)));
        uint256 tokenId = uint256(label);
        require(voucherValues[tokenId] == 0, "voucher already exsits");
        voucherValues[tokenId] = price;

        // map tokenid => identifier
        voucherTlds[tokenId] = identifier;

        emit CustomizedVoucherAdded(tokenId, price, identifier);
        return tokenId;
    }

    function totalValue(
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            total += voucherValues[ids[i]] * amounts[i];
        }
        return total;
    }

    function isValidVoucherIds(
        uint256[] calldata ids
    ) external view returns (bool) {
        for (uint256 i = 0; i < ids.length; i++) {
            if (voucherValues[ids[i]] == 0) {
                return false;
            }
        }
        return true;
    }

    function getTokenIdTld(uint256 tokenId) external view returns (uint256) {
        require(voucherTlds[tokenId] != 0, "TokenId's tld not exists");
        return voucherTlds[tokenId];
    }

    function isSameTld(uint256[] calldata ids) public view returns (bool) {
        uint256 tld = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            require(voucherTlds[tokenId] != 0, "TokenId's tld not exists");

            if (tld == 0) {
                tld = voucherTlds[tokenId];
                continue;
            }

            if (voucherTlds[tokenId] != tld) {
                return false;
            }
        }

        return true;
    }
}
