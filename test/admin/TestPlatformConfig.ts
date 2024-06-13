import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    registerTLDWithoutPreRegi,
} from "../test-utils/tld";

describe("PlatformConfig test", function () {
    const CHAIN_ID = 56;
    const DEFAULT_MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const DEFAULT_PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000
    async function deployFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            tldOwner,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        ] = await ethers.getSigners();

        const {
            registry,
            sann,
            registrar,
            platformConfig,
            usdOracle,
            tldFactory,
            resolver,
            preRegistrationCreator,
            prepaidPlatformFee,
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
            platformConfig,
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
            platformConfig,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);
        expect(await platformConfig.defaultMinPlatformFee()).to.equal(
            DEFAULT_MIN_PLATFORM_FEE
        );
        expect(await platformConfig.defaultRateBps()).to.equal(
            DEFAULT_PLATFORM_FEE_RATIO
        );
        expect(await platformConfig.platformFeeCollector()).to.equal(
            platformFeeCollector.address
        );
    });

    it("should allow defaultMinPlatformFee update only by platformAdmin", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            platformConfig,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);
        const newDefaultMinPlatformFee = toBigInt(1e18);

        await expect(
            platformConfig
                .connect(addr1)
                .setDefaultMinPlatformFee(newDefaultMinPlatformFee)
        ).to.be.reverted;

        await platformConfig
            .connect(platformAdmin)
            .setDefaultMinPlatformFee(newDefaultMinPlatformFee);
        expect(await platformConfig.defaultMinPlatformFee()).to.equal(
            newDefaultMinPlatformFee
        );
    });

    it("should allow defaultRateBps update only by platformAdmin", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            platformConfig,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);
        const newDefaultPlatformFeeRatio = 200;

        await expect(
            platformConfig
                .connect(addr1)
                .setDefaultRateBps(newDefaultPlatformFeeRatio)
        ).to.be.reverted;

        await platformConfig
            .connect(platformAdmin)
            .setDefaultRateBps(newDefaultPlatformFeeRatio);
        expect(await platformConfig.defaultRateBps()).to.equal(
            newDefaultPlatformFeeRatio
        );
    });

    it("should allow paltformFeeCollector update only by platformAdmin", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            platformConfig,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);
        const newPlatformFeeCollector = addr2;

        await expect(
            platformConfig
                .connect(addr1)
                .setPlatformFeeCollector(newPlatformFeeCollector)
        ).to.be.reverted;

        await platformConfig
            .connect(platformAdmin)
            .setPlatformFeeCollector(newPlatformFeeCollector);
        expect(await platformConfig.platformFeeCollector()).to.equal(
            newPlatformFeeCollector.address
        );
    });

    it("should allow set customized platform fee only by platformAdmin", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            platformConfig,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const newFeeRateBps = 2000;
        const newMinPlatformFee = toBigInt(1e18);
        const tldIdentifier1 = 1;
        const tldIdentifier2 = 2;

        await platformConfig
            .connect(platformAdmin)
            .setCustomizedPlatformFee(
                tldIdentifier1,
                newMinPlatformFee,
                newFeeRateBps,
                true
            );

        // new fee rate
        expect(
            await platformConfig.getPlatformFeeRateBps(tldIdentifier1)
        ).to.equal(newFeeRateBps);
        // other tld's fee ratio should keep same
        expect(
            await platformConfig.getPlatformFeeRateBps(tldIdentifier2)
        ).to.equal(DEFAULT_PLATFORM_FEE_RATIO);

        // new mini platform fee
        expect(await platformConfig.getMinPlatformFee(tldIdentifier1)).to.equal(
            toBigInt(1e18)
        );
        // other tld's fee ratio should keep same
        expect(await platformConfig.getMinPlatformFee(tldIdentifier2)).to.equal(
            DEFAULT_MIN_PLATFORM_FEE
        );

        // reverts since called by non-platformAdmin
        await expect(
            platformConfig
                .connect(addr1)
                .setCustomizedPlatformFee(
                    tldIdentifier1,
                    newMinPlatformFee,
                    newFeeRateBps,
                    true
                )
        ).to.be.revertedWith("Accessible: caller is not the platform admin");
        // disable customized platform fee
        await platformConfig
            .connect(platformAdmin)
            .setCustomizedPlatformFee(
                tldIdentifier1,
                newMinPlatformFee,
                newFeeRateBps,
                false
            );
        expect(
            await platformConfig.getPlatformFeeRateBps(tldIdentifier1)
        ).to.equal(DEFAULT_PLATFORM_FEE_RATIO);
        expect(await platformConfig.getMinPlatformFee(tldIdentifier1)).to.equal(
            DEFAULT_MIN_PLATFORM_FEE
        );
    });
});
