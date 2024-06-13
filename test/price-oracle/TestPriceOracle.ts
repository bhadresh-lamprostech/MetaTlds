import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";

describe("PriceOracle Contract", function () {
    const CHAIN_ID = 31337;
    const DEFAULT_MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const DEFAULT_PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000
    async function deployFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            addr1,
            addr2,
            addr3,
            addr4,
        ] = await ethers.getSigners();

        const {
            registry,
            sann,
            registrar,
            platformConfig,
            usdOracle,
            priceOracle,
        } = await deployToolkit(
            platformAdmin,
            platformFeeCollector,
            DEFAULT_MIN_PLATFORM_FEE,
            DEFAULT_PLATFORM_FEE_RATIO
        );

        return {
            sann,
            owner,
            platformAdmin,
            registry,
            platformFeeCollector,
            usdOracle,
            priceOracle,
            addr1,
            addr2,
            addr3,
            addr4,
        };
    }

    it("should init right through contrauctor", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            priceOracle,
            usdOracle,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        expect(await priceOracle.usdOracle()).to.equal(usdOracle.target);
    });

    it("should allow initialize a tld's price model only by factory", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            priceOracle,
            usdOracle,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        expect(await priceOracle.usdOracle()).to.equal(usdOracle.target);

        const tldIdentifier = 1;
        const currTime = await time.latest();

        // all price should be 0 before initialization
        let result1 = await priceOracle.price(
            "1",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result1.base).to.be.equal(0);
        expect(result1.premium).to.be.equal(0);
        let result2 = await priceOracle.price(
            "12",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result2.base).to.be.equal(0);
        expect(result2.premium).to.be.equal(0);
        let result3 = await priceOracle.price(
            "123",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result3.base).to.be.equal(0);
        expect(result3.premium).to.be.equal(0);
        let result4 = await priceOracle.price(
            "1234",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result4.base).to.be.equal(0);
        expect(result4.premium).to.be.equal(0);
        let result5 = await priceOracle.price(
            "12345",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result5.base).to.be.equal(0);
        expect(result5.premium).to.be.equal(0);
        let result6 = await priceOracle.price(
            "123456",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result6.base).to.be.equal(0);
        expect(result6.premium).to.be.equal(0);

        await expect(
            priceOracle.connect(addr1).initTldPriceModel(tldIdentifier)
        ).to.be.reverted;

        // make addr1 be the factory and then initialization will succeed
        await sann.connect(platformAdmin).setTldFactory(addr1.address);
        await priceOracle.connect(addr1).initTldPriceModel(tldIdentifier);

        // all price should be MAX_INT after initialization
        const maxInt256 = toBigInt(
            "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        );
        const maxInt64 = toBigInt("18446744073709551615");
        result1 = await priceOracle.price(
            "1",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result1.base).to.be.equal(maxInt64);
        expect(result1.premium).to.be.equal(0);
        result2 = await priceOracle.price(
            "12",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result2.base).to.be.equal(maxInt64);
        expect(result2.premium).to.be.equal(0);
        result3 = await priceOracle.price(
            "123",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result3.base).to.be.equal(maxInt64);
        expect(result3.premium).to.be.equal(0);
        result4 = await priceOracle.price(
            "1234",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result4.base).to.be.equal(maxInt64);
        expect(result4.premium).to.be.equal(0);
        result5 = await priceOracle.price(
            "12345",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result5.base).to.be.equal(maxInt64);
        expect(result5.premium).to.be.equal(0);
        result6 = await priceOracle.price(
            "123456",
            currTime,
            86400 * 30,
            tldIdentifier
        );
        expect(result6.base).to.be.equal(maxInt64);
        expect(result6.premium).to.be.equal(0);
    });

    describe("ExponentialPremiumPriceOracle test", function () {});
});
