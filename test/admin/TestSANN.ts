import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, bytesToHex, sha3} from "web3-utils";
import {calIdentifier} from "../test-utils/tld";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    registerTLDWithoutPreRegi,
} from "../test-utils/tld";

describe("SANN test", function () {
    const CHAIN_ID = 31337;
    const TLD = "ttt";
    const BASE_NODEHASH =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const ZERO_HASH =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
    const E16STR = "0000000000000000";
    let identifier;
    const MIN_PLATFORM_FEE = toBigInt(5 * 1e18); // 5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000
    const MIN_REGISTRATION_DURATION = 86400 * 30;
    const ONE_YEAR_DURATION = 86400 * 365;
    let publicRegistrationStartTime;
    let preRegiConfig;
    let preRegiDiscountRateBps;

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
        preRegiConfig = ret.preRegiConfig;
        preRegiConfig.auctionHardEndTime =
            preRegiConfig.auctionInitialEndTime + 86400;
        const auction = ret.auction;
        const preRegiState = ret.preRegistrationState;
        const tldBase = ret.tldBase;
        preRegiDiscountRateBps = ret.preRegiDiscountRateBps;

        return {
            sann,
            owner,
            platformAdmin,
            registry,
            tldOwner,
            tldFactory,
            tldBase,
            registrar,
            addr1,
            addr2,
            addr3,
            addr4,
        };
    }

    it("should init right through contrauctor", async function () {
        const {sann, owner, platformAdmin, registry, addr1, addr2} =
            await loadFixture(deploySANNFixture);
        expect(await sann.registry()).to.equal(registry.target);
        expect(await sann.platformAdmin()).to.equal(platformAdmin.address);

        expect(await sann.minTldLength()).to.equal(3);
        expect(await sann.maxTldLength()).to.equal(5);
    });

    it("should allow platformAdmin update", async function () {
        const {sann, owner, platformAdmin, registry, addr1, addr2} =
            await loadFixture(deploySANNFixture);
        await expect(
            sann.connect(addr2).setPlatformAdmin(addr1.address)
        ).to.be.revertedWith("only platform admin");
        await sann.connect(platformAdmin).setPlatformAdmin(addr1.address);

        expect(await sann.platformAdmin()).to.equal(addr1.address);
    });

    it("should allow update tld length", async function () {
        const {sann, owner, platformAdmin, registry, addr1, addr2} =
            await loadFixture(deploySANNFixture);
        const newMinTldLength = 1;
        const newMaxTldLength = 10;
        await sann.connect(platformAdmin).setMinTldLength(newMinTldLength);
        await sann.connect(platformAdmin).setMaxTldLength(newMaxTldLength);
        expect(await sann.minTldLength()).to.equal(newMinTldLength);
        expect(await sann.maxTldLength()).to.equal(newMaxTldLength);
    });

    it("should allow tldFactory set", async function () {
        const {sann, owner, platformAdmin, registry, addr1, addr2} =
            await loadFixture(deploySANNFixture);
        await sann.connect(platformAdmin).setTldFactory(addr1.address);
        expect(await sann.currentTldFactory()).to.equal(addr1.address);
    });

    it("should prohibit tldFactory updating by non-owners", async function () {
        const {sann, owner, platformAdmin, registry, addr1, addr2} =
            await loadFixture(deploySANNFixture);
        await expect(sann.connect(addr1).setTldFactory(addr2.address)).to.be
            .reverted;
    });

    it("should registerTld only by tldFactory", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            registry,
            tldOwner,
            tldBase,
            registrar,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deploySANNFixture);
        let factory = addr1;
        await sann.connect(platformAdmin).setTldFactory(factory.address);

        const newTld = "ttt2";
        const newTldOwner = addr3;
        const newIdentifier = await sann.tldIdentifier(newTld, newTldOwner);
        const newTldBase = await ethers.deployContract("Base", [
            sann,
            registry,
            newIdentifier,
            newTld,
        ]);
        await newTldBase.waitForDeployment();
        // can not be called by non-tldFactory
        await expect(
            sann
                .connect(addr2)
                .registerTld(newTld, newIdentifier, newTldOwner, newTldBase)
        ).to.be.reverted;

        // should emit NewTld event if registerTld succeeded
        await expect(
            sann
                .connect(factory)
                .registerTld(newTld, newIdentifier, newTldOwner, newTldBase)
        )
            .to.emit(sann, "NewTld")
            .withArgs(
                newTld,
                toBigInt(newIdentifier),
                newTldOwner.address,
                newTldBase.target,
                registrar.target
            );

        // tld owner mapping should be set right
        expect(await sann.tldOwner(toBigInt(newIdentifier))).to.equal(
            newTldOwner.address
        );
    });

    it("should set a new Tld owner only by tldOwner", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            registry,
            tldOwner,
            addr1,
            addr2,
            addr3,
            addr4,
        } = await loadFixture(deploySANNFixture);
        let factory = addr1;
        let guy = addr2;
        let newOwner = addr4;
        await sann.connect(platformAdmin).setTldFactory(factory.address);

        // revert since called by non-owner
        await expect(
            sann.connect(guy).setTldOwner(toBigInt(identifier), newOwner)
        ).to.be.reverted;
        // should succeed and emit NewTldOwner event
        await expect(
            sann.connect(tldOwner).setTldOwner(toBigInt(identifier), newOwner)
        )
            .to.emit(sann, "NewTldOwner")
            .withArgs(toBigInt(identifier), newOwner.address);

        expect(await sann.tldOwner(toBigInt(identifier))).to.be.equal(
            newOwner.address
        );
    });

    // it("should update a new Tld's info only by platformAdmin", async function () {
    //     const {
    //         sann,
    //         owner,
    //         platformAdmin,
    //         registry,
    //         tldOwner,
    //         addr1,
    //         addr2,
    //         addr3,
    //         addr4,
    //     } = await loadFixture(deploySANNFixture);
    //     let factory = addr1;
    //     let newBase = addr3;
    //     let newTldOwner = addr4;
    //     let newTld = "ttt2";
    //     await sann.connect(platformAdmin).setTldFactory(factory.address);

    //     // revert since called by tld owner
    //     await expect(
    //         sann
    //             .connect(tldOwner)
    //             .setTldInfo(identifier, newTld, newTldOwner, newBase)
    //     ).to.be.reverted;
    //     // should succeed and emit NewTldInfo event
    //     await sann
    //         .connect(platformAdmin)
    //         .setTldInfo(identifier, newTld, newTldOwner, newBase);
    // });

    it("should transfer base node's owership to others", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            registry,
            tldBase,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deploySANNFixture);
        let factory = addr1;
        await sann.connect(platformAdmin).setTldFactory(factory.address);

        // SANN should be the owner of .idenfitier base node
        const identifierBaseNode = sha3(
            bytesToHex([
                ...hexToBytes(BASE_NODEHASH),
                ...hexToBytes(ethers.toBeHex(identifier, 32)),
            ])
        );
        // const identifierBaseNode = sha3(BASE_NODEHASH + sha3(identifier));
        expect(await registry.owner(identifierBaseNode)).to.equal(sann.target);
        // Base should be the owner of .tld.identifier base node
        const tldBaseNode = await tldBase.baseNode();
        expect(await registry.owner(tldBaseNode)).to.equal(tldBase.target);

        // reverts
        await expect(
            sann.connect(addr3).transferNodeOwner(BASE_NODEHASH, addr2)
        ).to.be.reverted;

        // addr2 should be the owner of base node
        await sann
            .connect(platformAdmin)
            .transferNodeOwner(BASE_NODEHASH, addr2);
        expect(await registry.owner(BASE_NODEHASH)).to.equal(addr2.address);
    });

    it("should upgrade", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            registry,
            tldBase,
            tldOwner,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deploySANNFixture);

        // sann works well
        const identifier = calIdentifier(CHAIN_ID, tldOwner.address, TLD);
        expect(await sann.tldIdentifier(TLD, tldOwner)).to.be.equal(identifier);

        // new version's method not exsits in old version
        try {
            sann.dummyString();
        } catch (error) {
            assert(error.message === "sann.dummyString is not a function");
        }

        const newSANN = await ethers.deployContract("DummyUpgradeableSANN", []);
        await newSANN.waitForDeployment();

        // reverts since called by non-platformAdmin
        await expect(sann.upgradeTo(newSANN)).to.be.revertedWith(
            "only platform admin"
        );

        // upgrade sann to new version
        await sann.connect(platformAdmin).upgradeTo(newSANN);

        const upgradedSann = await ethers.getContractAt(
            "DummyUpgradeableSANN",
            sann
        );

        // new version's method works well
        expect(await upgradedSann.dummyString()).to.equal("New SANN");
        expect(await upgradedSann.tldIdentifier(TLD, tldOwner)).to.be.equal(
            identifier
        );

        // old version js object cannot access the methods
        try {
            await sann.tldIdentifier(TLD, tldOwner);
        } catch (error) {
            assert(error.message === "sann.tldIdentifier is not a function");
        }
    });
});
