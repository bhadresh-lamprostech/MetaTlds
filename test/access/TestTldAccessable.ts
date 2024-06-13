import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";

describe("TldAccessable test", function () {
    const CHAIN_ID = 56;
    const TLD = "ttt";
    let identifier;
    const BASE_NODEHASH =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000

    async function deploySANNFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            tldOwner,
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
            tldFactory,
            resolver,
            preRegistrationCreator,
        } = await deployToolkit(
            platformAdmin,
            platformFeeCollector,
            MIN_PLATFORM_FEE,
            PLATFORM_FEE_RATIO
        );

        const ret = await registerTLD(
            sann,
            registry,
            tldFactory,
            TLD,
            tldOwner,
            platformAdmin,
            registrar,
            preRegistrationCreator
        );
        identifier = ret.identifier;
        const tldBase = ret.tldBase;

        const dummy = await ethers.deployContract("DummyTldAccessableImpl", [
            sann,
        ]);
        await dummy.waitForDeployment();

        return {
            sann,
            owner,
            platformAdmin,
            dummy,
            tldOwner,
            tldFactory,
            addr1,
            addr2,
            addr3,
            addr4,
        };
    }

    it("should get right platformAdmin", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            dummy,
            tldOwner,
            tldFactory,
            addr1,
            addr2,
            addr3,
            addr4,
        } = await loadFixture(deploySANNFixture);

        const guy = addr4;

        await expect(dummy.connect(guy).testOnlyPlatformAdmin()).to.be.reverted;
        expect(
            await dummy.connect(platformAdmin).testOnlyPlatformAdmin()
        ).to.equal(true);

        const newPlatformAdmin = addr1;
        await sann
            .connect(platformAdmin)
            .setPlatformAdmin(newPlatformAdmin.address);

        await expect(dummy.connect(platformAdmin).testOnlyPlatformAdmin()).to.be
            .reverted;
        expect(
            await dummy.connect(newPlatformAdmin).testOnlyPlatformAdmin()
        ).to.equal(true);
    });

    it("should get right tldOwner", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            dummy,
            tldOwner,
            tldFactory,
            addr1,
            addr2,
            addr3,
            addr4,
        } = await loadFixture(deploySANNFixture);

        const guy = addr4;

        await expect(dummy.connect(guy).testOnlyTldOwner(identifier)).to.be
            .reverted;
        expect(
            await dummy.connect(tldOwner).testOnlyTldOwner(identifier)
        ).to.equal(true);

        const newTldOwner = addr1;
        await sann
            .connect(tldOwner)
            .setTldOwner(identifier, newTldOwner.address);

        await expect(dummy.connect(tldOwner).testOnlyTldOwner(identifier)).to.be
            .reverted;
        expect(
            await dummy.connect(newTldOwner).testOnlyTldOwner(identifier)
        ).to.equal(true);
    });

    it("should get right factory", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            dummy,
            tldOwner,
            tldFactory,
            addr1,
            addr2,
            addr3,
            addr4,
        } = await loadFixture(deploySANNFixture);

        const factory = addr3;
        await sann.connect(platformAdmin).setTldFactory(factory.address);

        const guy = addr4;
        await expect(dummy.connect(guy).testOnlyFactory()).to.be.reverted;
        expect(await dummy.connect(factory).testOnlyFactory()).to.equal(true);

        const newFactory = addr1;
        await sann.connect(platformAdmin).setTldFactory(newFactory.address);

        await expect(dummy.connect(factory).testOnlyFactory()).to.be.reverted;
        expect(await dummy.connect(newFactory).testOnlyFactory()).to.equal(
            true
        );
    });

    it("should get right controller", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            dummy,
            tldOwner,
            tldFactory,
            addr1,
            addr2,
            addr3,
            addr4,
        } = await loadFixture(deploySANNFixture);

        const guy = addr4;
        const controller = addr2;
        await sann.connect(platformAdmin).setTldController(controller.address);

        await expect(dummy.connect(guy).testOnlyTldController()).to.be.reverted;
        expect(
            await dummy.connect(controller).testOnlyTldController()
        ).to.equal(true);

        const newController = addr3;
        await sann
            .connect(platformAdmin)
            .setTldController(newController.address);
        await expect(dummy.connect(controller).testOnlyTldController()).to.be
            .reverted;
        expect(
            await dummy.connect(newController).testOnlyTldController()
        ).to.equal(true);
    });
});
