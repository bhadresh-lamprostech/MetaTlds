import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, bytesToHex, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    registerTLDWithoutPreRegi,
    encodeHookExtraData,
} from "../test-utils/tld";

describe("Registrar test", function () {
    const CHAIN_ID = 56;
    const TLD = "ttt";
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
    const USE_GIFTCARD_EXTRA_DATA = encodeHookExtraData("", true);

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
            registrar,
            tldOwner,
            resolver,
            registry,
            auction,
            preRegiState,
            prepaidPlatformFee,
            platformConfig,
            tldBase,
            priceOracle,
            platformFeeCollector,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    async function deployFixtureNoPreRegi() {
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
            giftCardLedger,
            giftCardVoucher,
            giftCardController,
            prepaidPlatformFee,
            priceOracle,
        } = await deployToolkit(
            platformAdmin,
            platformFeeCollector,
            MIN_PLATFORM_FEE,
            PLATFORM_FEE_RATIO
        );

        const ret = await registerTLDWithoutPreRegi(
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
        publicRegistrationStartTime = ret.publicRegistrationStartTime;

        return {
            sann,
            owner,
            platformAdmin,
            registry,
            registrar,
            tldOwner,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            giftCardLedger,
            giftCardVoucher,
            giftCardController,
            prepaidPlatformFee,
            priceOracle,
            usdOracle,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should get price", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const price = await registrar.rentPrice(
            identifier,
            "aaaaa",
            86400 * 365
        );
        expect(price.base + price.premium).to.be.equal(
            (158443692534 * 86400 * 365) / 1500
        );
    });

    it("should allow registeration", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const nameOwner = addr1;
        const currTime = await time.latest();
        await time.increaseTo(currTime + 86400 * 10);
        await registrar.bulkRegister(
            identifier,
            ["12345"],
            nameOwner,
            86400 * 365,
            resolver,
            false,
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e17)}
        );

        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("12345"))])
        );
        expect(await registry.owner(nodeHash)).to.be.equal(nameOwner.address);
    });

    it("should allow registeration to TLD without preregistartion", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        await time.increaseTo(publicRegistrationStartTime + 10);

        const nameOwner = addr1;
        await registrar.bulkRegister(
            identifier,
            ["12345"],
            nameOwner,
            86400 * 365,
            resolver,
            false,
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e17)}
        );

        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("12345"))])
        );
        expect(await registry.owner(nodeHash)).to.be.equal(nameOwner.address);
    });

    it("should allow winner's registeration with 0 value", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            auction,
            preRegiState,
            prepaidPlatformFee,
            platformConfig,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // set quota
        await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);
        await preRegiState.connect(tldOwner).setUserQuota(addr2, 2);

        await time.increaseTo(preRegiConfig.auctionStartTime + 1);

        // bid 1 ether
        // minAuctionValueInWei = 160/365*60/1500, is around 1.76 * 1e16 WEI
        await auction
            .connect(addr1)
            .placeBid("1234", {value: toBigInt(1.76 * 1e16)});

        //console.log(await prepaidPlatformFee.feeCredits(identifier));

        // end auction to make addr1 be the winner
        await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

        const registrant = addr1;
        const nameOwner = addr2;
        // reverted since prepaid platform fee is less than minPlatformFee
        await expect(
            registrar
                .connect(registrant)
                .bulkRegister(
                    identifier,
                    ["1234"],
                    nameOwner,
                    preRegiConfig.auctionMinRegistrationDuration,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: 0}
                )
        ).to.be.revertedWith("Insufficient funds");

        // update customized platform fee
        // set minPlatformFee to 0 so the free registeration from auction winner will work properly
        await platformConfig
            .connect(platformAdmin)
            .setCustomizedPlatformFee(identifier, 0, PLATFORM_FEE_RATIO, true);
        // reverted since registrant is not the winner
        await expect(
            registrar
                .connect(nameOwner)
                .bulkRegister(
                    identifier,
                    ["1234"],
                    registrant,
                    preRegiConfig.auctionMinRegistrationDuration,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: 0}
                )
        ).to.be.revertedWithCustomError(registrar, "NotQualifiedRegister");
        // succeed
        await registrar
            .connect(registrant)
            .bulkRegister(
                identifier,
                ["1234"],
                nameOwner,
                preRegiConfig.auctionMinRegistrationDuration,
                resolver,
                false,
                [USE_GIFTCARD_EXTRA_DATA],
                {value: 0}
            );

        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("1234"))])
        );
        expect(await registry.owner(nodeHash)).to.be.equal(nameOwner.address);
    });

    it("should allow fcfs registeration", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            auction,
            preRegiState,
            prepaidPlatformFee,
            platformConfig,
            tldBase,
            priceOracle,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // set quota
        await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);

        await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

        const nameOwner = addr1;
        let ret = await registrar.rentPrice(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const price = ret.base + ret.premium;
        // should apply preRegiDiscount
        const expectedCostInWei =
            (toBigInt(price) * toBigInt(10000 - preRegiDiscountRateBps[4])) /
            toBigInt(10000);

        const revenueBefore = await registrar.tldRevenues(identifier);
        const feeBalanceBefore = await registrar.platformFeeBalance();
        const feeBalanceDelta =
            (expectedCostInWei * toBigInt(PLATFORM_FEE_RATIO)) /
            toBigInt(10000);
        const revenueDelta = expectedCostInWei - feeBalanceDelta;

        await expect(
            registrar
                .connect(nameOwner)
                .bulkRegister(
                    identifier,
                    ["1234"],
                    nameOwner,
                    ONE_YEAR_DURATION,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.changeEtherBalance(nameOwner, expectedCostInWei * toBigInt(-1));

        expect(await registrar.tldRevenues(identifier)).to.be.equal(
            revenueBefore + revenueDelta
        );
        expect(await registrar.platformFeeBalance()).to.be.equal(
            feeBalanceBefore + feeBalanceDelta
        );

        // check quota
        expect(await preRegiState.phase2Quota(nameOwner)).to.be.equal(1);
    });

    it("should allow platform fee withdraw only by platformFeeCollector", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        await time.increaseTo(publicRegistrationStartTime + 1);

        let ret = await registrar.rentPrice(identifier, "1234", 86400 * 365);

        const price = ret.base + ret.premium;

        const nameOwner = addr1;
        await registrar.bulkRegister(
            identifier,
            ["1234"],
            nameOwner,
            86400 * 365,
            resolver,
            false,
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e18)}
        );
        const feeBalance =
            (toBigInt(price) * toBigInt(PLATFORM_FEE_RATIO)) / toBigInt(10000);

        expect(await registrar.platformFeeBalance()).to.be.equal(feeBalance);

        // reverts since withdraw by non-platformFeeCollector
        await expect(
            registrar.connect(platformAdmin).withdrawPlatformFee()
        ).to.be.revertedWith(
            "Ownable: caller is not the platform fee collector"
        );
        // succeed
        await expect(
            registrar.connect(platformFeeCollector).withdrawPlatformFee()
        ).to.changeEtherBalance(platformFeeCollector, feeBalance);
    });

    it("should charge min platform fee if price is too small", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        await time.increaseTo(publicRegistrationStartTime + 1);

        // platformFee charged should be minPlatformFee
        const platformFee = MIN_PLATFORM_FEE / toBigInt(1500); // 1500 is the token price

        const nameOwner = addr1;
        await expect(
            registrar.connect(nameOwner).bulkRegister(
                identifier,
                ["12345"],
                nameOwner,
                86400 * 30, // price is too small
                resolver,
                false,
                [USE_GIFTCARD_EXTRA_DATA],
                {value: toBigInt(1e18)}
            )
        ).to.changeEtherBalance(nameOwner, platformFee * toBigInt(-1));

        expect(await registrar.platformFeeBalance()).to.be.equal(platformFee);
    });

    it("should charge fee with preRegi discount when auction winner renew names", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            auction,
            preRegiState,
            prepaidPlatformFee,
            platformConfig,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // set quota
        await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);

        await time.increaseTo(preRegiConfig.auctionStartTime + 1);

        // bid 1 ether
        await auction
            .connect(addr1)
            .placeBid("1234", {value: toBigInt(1 * 1e18)});

        // end auction to make addr1 be the winner
        await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

        const nameOwner = addr1;
        // register
        await registrar
            .connect(nameOwner)
            .bulkRegister(
                identifier,
                ["1234"],
                nameOwner,
                ONE_YEAR_DURATION,
                resolver,
                false,
                [USE_GIFTCARD_EXTRA_DATA],
                {value: toBigInt(1e18)}
            );

        let ret = await registrar.rentPrice(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const price = ret.base + ret.premium;
        const expectedCost =
            (price * (toBigInt(10000) - toBigInt(preRegiDiscountRateBps[4]))) /
            toBigInt(10000);
        const feeBalanceDelta =
            (expectedCost * toBigInt(PLATFORM_FEE_RATIO)) / toBigInt(10000);
        const revenueDelta = expectedCost - feeBalanceDelta;
        const revenueBefore = await registrar.tldRevenues(identifier);
        const feeBalanceBefore = await registrar.platformFeeBalance();

        // renew simulation
        expect(
            await registrar
                .connect(nameOwner)
                .bulkRenew.staticCall(
                    identifier,
                    ["1234"],
                    ONE_YEAR_DURATION,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.be.equal(expectedCost);

        // renew
        await expect(
            registrar
                .connect(nameOwner)
                .bulkRenew(
                    identifier,
                    ["1234"],
                    ONE_YEAR_DURATION,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {
                        value: toBigInt(1e18),
                    }
                )
        ).to.changeEtherBalance(nameOwner, expectedCost * toBigInt(-1));

        // check platform fee and revenue
        expect(await registrar.platformFeeBalance()).to.be.equal(
            feeBalanceBefore + feeBalanceDelta
        );
        expect(await registrar.tldRevenues(identifier)).to.be.equal(
            revenueBefore + revenueDelta
        );
    });

    it("should charge fee with preRegi discount when anyone renew names in fcfs", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            auction,
            preRegiState,
            prepaidPlatformFee,
            platformConfig,
            tldBase,
            priceOracle,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // set quota
        await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);

        await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

        // register
        const nameOwner = addr1;
        await registrar
            .connect(nameOwner)
            .bulkRegister(
                identifier,
                ["1234"],
                nameOwner,
                ONE_YEAR_DURATION,
                resolver,
                false,
                [USE_GIFTCARD_EXTRA_DATA],
                {value: toBigInt(1e18)}
            );

        let ret = await registrar.rentPrice(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const price = ret.base + ret.premium;
        // should apply preRegiDiscount
        const expectedCost =
            (toBigInt(price) * toBigInt(10000 - preRegiDiscountRateBps[4])) /
            toBigInt(10000);
        const feeBalanceDelta =
            (expectedCost * toBigInt(PLATFORM_FEE_RATIO)) / toBigInt(10000);
        const revenueDelta = expectedCost - feeBalanceDelta;

        const revenueBefore = await registrar.tldRevenues(identifier);
        const feeBalanceBefore = await registrar.platformFeeBalance();

        // renew
        await expect(
            registrar
                .connect(nameOwner)
                .bulkRenew(
                    identifier,
                    ["1234"],
                    ONE_YEAR_DURATION,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {
                        value: toBigInt(1e18),
                    }
                )
        ).to.changeEtherBalance(nameOwner, expectedCost * toBigInt(-1));

        expect(await registrar.tldRevenues(identifier)).to.be.equal(
            revenueBefore + revenueDelta
        );
        expect(await registrar.platformFeeBalance()).to.be.equal(
            feeBalanceBefore + feeBalanceDelta
        );

        // check quota
        expect(await preRegiState.phase2Quota(nameOwner)).to.be.equal(1);
    });

    it("should not charge min platform fee if price is too small when renew names", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        await time.increaseTo(publicRegistrationStartTime + 1);

        let ret = await registrar.rentPrice(identifier, "12345", 86400 * 30);
        const price = ret.base + ret.premium;
        const platformFee =
            (toBigInt(PLATFORM_FEE_RATIO) * price) / toBigInt(10000);

        // register
        const nameOwner = addr1;
        await registrar.connect(nameOwner).bulkRegister(
            identifier,
            ["12345"],
            nameOwner,
            86400 * 30, // price is small
            resolver,
            false,
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e18)}
        );

        const feeBalanceBefore = await registrar.platformFeeBalance();

        // renew
        await expect(
            registrar
                .connect(nameOwner)
                .bulkRenew(
                    identifier,
                    ["12345"],
                    86400 * 30,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {
                        value: toBigInt(1e18),
                    }
                )
        ).to.changeEtherBalance(nameOwner, price * toBigInt(-1));

        expect(await registrar.platformFeeBalance()).to.be.equal(
            platformFee + feeBalanceBefore
        );
    });

    it("should allow tld name setting along with registration", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        await time.increaseTo(publicRegistrationStartTime + 1);

        // ensure that controller has been added as reverseRegistrar's controller
        const registrant = addr1;
        const nameOwner = addr1;
        await registrar.connect(registrant).bulkRegister(
            identifier,
            ["12345"],
            nameOwner,
            86400 * 365,
            resolver,
            true, // set new name as tld name
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e17)}
        );

        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("12345"))])
        );
        expect(await registry.owner(nodeHash)).to.be.equal(nameOwner.address);

        // check if reverse node is claimed
        const reverseNodeHash = ethers.namehash(
            registrant.address.slice(2) + ".addr.reverse"
        );
        expect(await registry.owner(reverseNodeHash)).to.be.equal(
            nameOwner.address
        );
        // check tld name record
        const expectedTldName = "12345" + "." + TLD;
        expect(await resolver.tldName(reverseNodeHash, identifier)).to.be.equal(
            expectedTldName
        );
    });

    it("should set chain name only when it has not been set before", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        await time.increaseTo(publicRegistrationStartTime + 1);

        // ensure that controller has been added as reverseRegistrar's controller
        const registrant = addr1;
        const nameOwner = addr1;
        await registrar.connect(registrant).bulkRegister(
            identifier,
            ["12345"],
            nameOwner,
            86400 * 365,
            resolver,
            true, // set new name as tld name
            ["0x"],
            {value: toBigInt(1e17)}
        );

        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("12345"))])
        );
        expect(await registry.owner(nodeHash)).to.be.equal(nameOwner.address);

        // check if reverse node is claimed
        const reverseNodeHash = ethers.namehash(
            registrant.address.slice(2) + ".addr.reverse"
        );
        expect(await registry.owner(reverseNodeHash)).to.be.equal(
            nameOwner.address
        );
        // check chain name record
        const expectedName = "12345" + "." + TLD;
        expect(await resolver.name(reverseNodeHash)).to.be.equal(expectedName);

        // next registration will not update the chain name
        await registrar.connect(registrant).bulkRegister(
            identifier,
            ["123456"], // new name
            nameOwner,
            86400 * 365,
            resolver,
            true, // set new name as tld name
            ["0x"],
            {value: toBigInt(1e17)}
        );
        // check chain name record
        expect(await resolver.name(reverseNodeHash)).to.be.equal(
            expectedName // same chain anme
        );
    });

    it("should not set primary name when not register to self", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        await time.increaseTo(publicRegistrationStartTime + 1);

        // ensure that controller has been added as reverseRegistrar's controller
        const registrant = addr1;
        const nameOwner = addr2;
        await registrar.connect(registrant).bulkRegister(
            identifier,
            ["12345"],
            nameOwner,
            86400 * 365,
            resolver,
            true, // set new name as tld name
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e17)}
        );

        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("12345"))])
        );
        expect(await registry.owner(nodeHash)).to.be.equal(nameOwner.address);

        // check if reverse node is claimed
        const reverseNodeHash = ethers.namehash(
            registrant.address.slice(2) + ".addr.reverse"
        );
        expect(await registry.owner(reverseNodeHash)).to.be.equal(ZERO_ADDR);
        // check tld name record
        const expectedTldName = "";
        expect(await resolver.tldName(reverseNodeHash, identifier)).to.be.equal(
            expectedTldName
        );
    });

    it("should upgrade", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            priceOracle,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // registrar works well
        const identifier = calIdentifier(CHAIN_ID, tldOwner.address, TLD);
        expect(await registrar.getPriceOracle(identifier)).to.be.equal(
            priceOracle.target
        );

        // new version's method not exsits in old version
        try {
            registrar.dummyString();
        } catch (error) {
            assert(error.message === "registrar.dummyString is not a function");
        }

        const newRegistrar = await ethers.deployContract(
            "DummyUpgradeableRegistrar",
            []
        );
        await newRegistrar.waitForDeployment();

        // reverts since called by non-platformAdmin
        await expect(registrar.upgradeTo(newRegistrar)).to.be.revertedWith(
            "Accessible: caller is not the platform admin"
        );

        await registrar.connect(platformAdmin).upgradeTo(newRegistrar);

        const upgradedRegistrar = await ethers.getContractAt(
            "DummyUpgradeableRegistrar",
            registrar
        );

        // new version's method works well
        expect(await upgradedRegistrar.dummyString()).to.equal("New Registrar");
        expect(await upgradedRegistrar.getPriceOracle(identifier)).to.be.equal(
            priceOracle.target
        );

        // old version js object cannot access the methods
        try {
            await registrar.getPriceOracle(identifier);
        } catch (error) {
            assert(
                error.message === "registrar.getPriceOracle is not a function"
            );
        }
    });

    it("should charge full price in registration if not using points", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            giftCardLedger,
            giftCardVoucher,
            giftCardController,
            prepaidPlatformFee,
            priceOracle,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        await time.increaseTo(publicRegistrationStartTime + 1);

        const VALUE_1 = toBigInt(1e18); // 1 USD
        const TOKEN_ID_1 = await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher.staticCall(identifier, VALUE_1);

        await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, VALUE_1);

        // register giftCards for addr1 and redeem them
        await giftCardController
            .connect(addr1)
            .batchRegister([TOKEN_ID_1], [20], {
                value: toBigInt(1e18),
            });
        // addr1's balance is 20 USD
        await giftCardController
            .connect(addr1)
            .batchRedeem(identifier, [TOKEN_ID_1], [20]);

        // query price
        let ret = await registrar.rentPrice(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const price = ret.base + ret.premium;
        ret = await registrar.rentPriceInUSD(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const priceInUSD = ret.base + ret.premium;
        const expectedCost = price;
        const expectedCostAfterPointsDeducted = await priceOracle.attoUSDToWei(
            priceInUSD - toBigInt(20 * 1e18)
        );

        const nameOwner = addr1;
        // simulate register with using points
        expect(
            await registrar
                .connect(nameOwner)
                .bulkRegister.staticCall(
                    identifier,
                    ["1234"],
                    nameOwner,
                    ONE_YEAR_DURATION,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.be.equal(expectedCostAfterPointsDeducted);

        // when register without using points
        // full price will be charged
        await expect(
            registrar
                .connect(nameOwner)
                .bulkRegister(
                    identifier,
                    ["1234"],
                    nameOwner,
                    ONE_YEAR_DURATION,
                    resolver,
                    false,
                    ["0x"],
                    {value: toBigInt(1e18)}
                )
        ).to.changeEtherBalance(nameOwner, expectedCost * toBigInt(-1));
    });

    it("should charge full price in renewal if not using points", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            giftCardLedger,
            giftCardVoucher,
            giftCardController,
            prepaidPlatformFee,
            priceOracle,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        await time.increaseTo(publicRegistrationStartTime + 1);

        // giftcard preparation
        const VALUE_1 = toBigInt(1e18); // 1 USD
        const TOKEN_ID_1 = await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher.staticCall(identifier, VALUE_1);

        await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, VALUE_1);

        // register giftCards for addr1 and redeem them
        await giftCardController
            .connect(addr1)
            .batchRegister([TOKEN_ID_1], [20], {
                value: toBigInt(1e18),
            });
        // addr1's balance is 20 USD
        await giftCardController
            .connect(addr1)
            .batchRedeem(identifier, [TOKEN_ID_1], [20]);

        const nameOwner = addr1;
        // register a name
        registrar
            .connect(nameOwner)
            .bulkRegister(
                identifier,
                ["1234"],
                nameOwner,
                ONE_YEAR_DURATION,
                resolver,
                false,
                ["0x"],
                {value: toBigInt(1e18)}
            );

        // query price
        let ret = await registrar.rentPrice(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const price = ret.base + ret.premium;
        ret = await registrar.rentPriceInUSD(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const priceInUSD = ret.base + ret.premium;
        const expectedCost = price;
        const expectedCostAfterPointsDeducted = await priceOracle.attoUSDToWei(
            priceInUSD - toBigInt(20 * 1e18)
        );

        // simulate renew with using points
        expect(
            await registrar
                .connect(nameOwner)
                .bulkRenew.staticCall(
                    identifier,
                    ["1234"],
                    ONE_YEAR_DURATION,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.be.equal(expectedCostAfterPointsDeducted);

        // when renew without using points
        // full price will be charged
        await expect(
            registrar
                .connect(nameOwner)
                .bulkRenew(identifier, ["1234"], ONE_YEAR_DURATION, ["0x"], {
                    value: toBigInt(1e18),
                })
        ).to.changeEtherBalance(nameOwner, expectedCost * toBigInt(-1));
    });

    describe("price corner case", function () {
        it("should register if giftcard price is very small", async function () {
            const {
                sann,
                owner,
                platformAdmin,
                referralHub,
                tldOwner,
                registrar,
                resolver,
                registry,
                tldBase,
                platformFeeCollector,
                giftCardLedger,
                giftCardVoucher,
                giftCardController,
                prepaidPlatformFee,
                priceOracle,
                addr1,
                addr2,
            } = await loadFixture(deployFixtureNoPreRegi);

            await time.increaseTo(publicRegistrationStartTime + 1);

            const VALUE_1 = toBigInt(1e11); // 1e-7 USD
            const TOKEN_ID_1 = await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher.staticCall(identifier, VALUE_1);

            await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher(identifier, VALUE_1);

            // register giftCards for addr1 and redeem them
            await giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1], [21], {
                    value: toBigInt(1e18),
                });
            // addr1's balance is 21 * 1e-7 USD
            // so the value of ether will be greater then 1 gwei
            await giftCardController
                .connect(addr1)
                .batchRedeem(identifier, [TOKEN_ID_1], [21]);

            // query price
            let ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_YEAR_DURATION
            );
            const price = ret.base + ret.premium;
            ret = await registrar.rentPriceInUSD(
                identifier,
                "1234",
                ONE_YEAR_DURATION
            );
            const priceInUSD = ret.base + ret.premium;
            const expectedCost = price;
            const expectedCostAfterPointsDeducted =
                await priceOracle.attoUSDToWei(
                    priceInUSD - toBigInt(21 * 1e11)
                );

            const nameOwner = addr1;

            // simulate register with using points
            expect(
                await registrar
                    .connect(nameOwner)
                    .bulkRegister.staticCall(
                        identifier,
                        ["1234"],
                        nameOwner,
                        ONE_YEAR_DURATION,
                        resolver,
                        false,
                        [USE_GIFTCARD_EXTRA_DATA],
                        {value: toBigInt(1e18)}
                    )
            ).to.be.equal(expectedCostAfterPointsDeducted);

            // check balance changing
            await expect(
                registrar
                    .connect(nameOwner)
                    .bulkRegister(
                        identifier,
                        ["1234"],
                        nameOwner,
                        ONE_YEAR_DURATION,
                        resolver,
                        false,
                        [USE_GIFTCARD_EXTRA_DATA],
                        {value: toBigInt(1e18)}
                    )
            ).to.changeEtherBalance(
                nameOwner,
                expectedCostAfterPointsDeducted * toBigInt(-1)
            );
        });

        it("should register if price of native token is very large", async function () {
            const {
                sann,
                owner,
                platformAdmin,
                referralHub,
                tldOwner,
                registrar,
                resolver,
                registry,
                tldBase,
                platformFeeCollector,
                giftCardLedger,
                giftCardVoucher,
                giftCardController,
                prepaidPlatformFee,
                priceOracle,
                usdOracle,
                addr1,
                addr2,
            } = await loadFixture(deployFixtureNoPreRegi);

            await time.increaseTo(publicRegistrationStartTime + 1);

            // set token price to 20000000000 USD
            await usdOracle.set(toBigInt(2 * 1e10 * 1e8));

            const VALUE_1 = toBigInt(1e18); // 1 USD
            const TOKEN_ID_1 = await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher.staticCall(identifier, VALUE_1);

            await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher(identifier, VALUE_1);

            // register giftCards for addr1 and redeem them
            await giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1], [21], {
                    value: toBigInt(1e18),
                });
            // addr1's balance is 21 USD
            await giftCardController
                .connect(addr1)
                .batchRedeem(identifier, [TOKEN_ID_1], [21]);

            // query price
            let ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_YEAR_DURATION
            );
            const price = ret.base + ret.premium;
            ret = await registrar.rentPriceInUSD(
                identifier,
                "1234",
                ONE_YEAR_DURATION
            );
            const priceInUSD = ret.base + ret.premium;
            const expectedCost = price;
            const expectedCostAfterPointsDeducted =
                await priceOracle.attoUSDToWei(
                    priceInUSD - toBigInt(21 * 1e18)
                );

            const nameOwner = addr1;

            // simulate register with using points
            expect(
                await registrar
                    .connect(nameOwner)
                    .bulkRegister.staticCall(
                        identifier,
                        ["1234"],
                        nameOwner,
                        ONE_YEAR_DURATION,
                        resolver,
                        false,
                        [USE_GIFTCARD_EXTRA_DATA],
                        {value: toBigInt(1e18)}
                    )
            ).to.be.equal(expectedCostAfterPointsDeducted);

            // check balance changing
            await expect(
                registrar
                    .connect(nameOwner)
                    .bulkRegister(
                        identifier,
                        ["1234"],
                        nameOwner,
                        ONE_YEAR_DURATION,
                        resolver,
                        false,
                        [USE_GIFTCARD_EXTRA_DATA],
                        {value: toBigInt(1e18)}
                    )
            ).to.changeEtherBalance(
                nameOwner,
                expectedCostAfterPointsDeducted * toBigInt(-1)
            );
        });
    });

    it("should allow register and only charge min platform fee if tldOwner is the registrant before preRegistration", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const registrant = tldOwner;
        const nameOwner = addr1;
        const guy = addr2;
        // platformFee charged should be minPlatformFee
        const platformFee = MIN_PLATFORM_FEE / toBigInt(1500); // 1500 is the token price

        // before preRegi
        // non-tldOwner cannot register names
        await expect(
            registrar
                .connect(guy)
                .bulkRegister(
                    identifier,
                    ["12346"],
                    nameOwner,
                    86400 * 365,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.be.revertedWithCustomError(registrar, "NotQualifiedRegister");

        await expect(
            registrar
                .connect(registrant)
                .bulkRegister(
                    identifier,
                    ["12345"],
                    nameOwner,
                    86400 * 365,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.changeEtherBalance(registrant, platformFee * toBigInt(-1));

        // after preRegi started
        await time.increaseTo(preRegiConfig.auctionStartTime + 1);
        // tldOwner cannot register names
        await expect(
            registrar
                .connect(registrant)
                .bulkRegister(
                    identifier,
                    ["12346"],
                    nameOwner,
                    86400 * 365,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.be.revertedWithCustomError(registrar, "NotQualifiedRegister");
    });

    it("should allow register and only charge min platform fee if tldOwner is the registrant before public registration", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        const registrant = tldOwner;
        const nameOwner = addr1;
        const guy = addr2;
        // platformFee charged should be minPlatformFee
        const platformFee = MIN_PLATFORM_FEE / toBigInt(1500); // 1500 is the token price

        // before public registration
        await time.increaseTo(publicRegistrationStartTime - 10);
        // non-tldOwner cannot register names
        await expect(
            registrar
                .connect(guy)
                .bulkRegister(
                    identifier,
                    ["12346"],
                    nameOwner,
                    86400 * 365,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                )
        ).to.be.revertedWithCustomError(registrar, "NotQualifiedRegister");

        await expect(
            registrar.connect(registrant).bulkRegister(
                identifier,
                ["12345"],
                nameOwner,
                86400 * 365 * 10, // register 10 years
                resolver,
                false,
                [USE_GIFTCARD_EXTRA_DATA],
                {value: toBigInt(1e18)}
            )
        ).to.changeEtherBalance(registrant, platformFee * toBigInt(-1));

        // after public registration
        await time.increaseTo(publicRegistrationStartTime + 1);
        // charge normal fee
        let ret = await registrar.rentPrice(
            identifier,
            "12346",
            ONE_YEAR_DURATION * 10
        );
        const price = ret.base + ret.premium;
        await expect(
            registrar.connect(registrant).bulkRegister(
                identifier,
                ["12346"],
                nameOwner,
                86400 * 365 * 10, // register 10 years
                resolver,
                false,
                [USE_GIFTCARD_EXTRA_DATA],
                {value: toBigInt(1e18)}
            )
        ).to.changeEtherBalance(registrant, price * toBigInt(-1));
    });

    it("should allow simulatation from zero address ", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            platformFeeCollector,
            preRegiState,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // set quotas
        await preRegiState.connect(tldOwner).setUserQuota(addr1.address, 1);
        await preRegiState.connect(tldOwner).setUserQuota(addr2.address, 10);

        // go into the FCFS phase
        await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

        const provider = await platformAdmin.provider;

        const tx = await registrar.bulkRegisterSimulate.populateTransaction(
            identifier,
            ["2345"],
            addr1,
            ONE_YEAR_DURATION,
            resolver,
            false,
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e18)}
        );
        tx.from = ZERO_ADDR;
        const realPrice = "";
        let ret = await registrar.rentPrice(
            identifier,
            "2345",
            ONE_YEAR_DURATION
        );
        const price = ret.base + ret.premium;
        const expectedCostInWei =
            (toBigInt(price) * toBigInt(10000 - preRegiDiscountRateBps[4])) /
            toBigInt(10000);

        try {
            await provider.call(tx);
        } catch (err) {
            //console.log("err message: ", err.message);
            const errString =
                "VM Exception while processing transaction: reverted with custom error 'SimulatePrice(" +
                expectedCostInWei +
                ")'";
            expect(err.message).to.be.equal(errString);
        }

        // register should not success
        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("2345"))])
        );
        expect(await registry.owner(nodeHash)).not.to.be.equal(addr1.address);
    });

    it("should allow renew simulation from zero address", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            resolver,
            registry,
            tldBase,
            addr1,
            addr2,
        } = await loadFixture(deployFixtureNoPreRegi);

        const nameOwner = addr1;

        // start the registration
        await time.increaseTo(publicRegistrationStartTime + 1);

        // register a name
        await registrar.bulkRegister(
            identifier,
            ["1234"],
            nameOwner,
            86400 * 365,
            resolver,
            false,
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e18)}
        );

        const baseNode = await tldBase.baseNode();
        const nodeHash = sha3(
            bytesToHex([...hexToBytes(baseNode), ...hexToBytes(sha3("1234"))])
        );
        expect(await registry.owner(nodeHash)).to.be.equal(nameOwner.address);

        let ret = await registrar.rentPrice(
            identifier,
            "1234",
            ONE_YEAR_DURATION
        );
        const price = ret.base + ret.premium;
        const expectedCost = price;

        const provider = await platformAdmin.provider;
        const tx = await registrar.bulkRenewSimulate.populateTransaction(
            identifier,
            ["1234"],
            ONE_YEAR_DURATION,
            nameOwner,
            [USE_GIFTCARD_EXTRA_DATA],
            {value: toBigInt(1e18)}
        );
        tx.from = ZERO_ADDR;

        try {
            await provider.call(tx);
        } catch (err) {
            //console.log("err message: ", err.message);
            const errString =
                "VM Exception while processing transaction: reverted with custom error 'SimulatePrice(" +
                expectedCost +
                ")'";
            expect(err.message).to.be.equal(errString);
        }
    });
});
