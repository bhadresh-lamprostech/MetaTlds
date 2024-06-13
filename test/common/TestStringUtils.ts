import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, bytesToHex, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    registerTLDWithoutPreRegi,
} from "../test-utils/tld";

describe("StringUtils test", function () {
    async function deployFixture() {
        const [owner, addr1, addr2, addr3, addr4, addr5] =
            await ethers.getSigners();

        const dummy = await ethers.deployContract("Dummy");
        await dummy.waitForDeployment();

        return {
            dummy,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should work when langth of string is less than 3", async function () {
        const {dummy, addr1, addr2} = await loadFixture(deployFixture);

        const name1 = "123";
        expect(await dummy.containsZeroWidthChar(name1)).to.be.false;

        const name2 = "12";
        expect(await dummy.containsZeroWidthChar(name2)).to.be.false;

        const name3 = "1";
        expect(await dummy.containsZeroWidthChar(name3)).to.be.false;

        const name4 = "";
        expect(await dummy.containsZeroWidthChar(name4)).to.be.false;
    });
});
