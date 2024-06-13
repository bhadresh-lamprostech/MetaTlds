import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, bytesToHex, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    registerTLDWithoutPreRegi,
} from "../test-utils/tld";

describe("PrepaidPlatformFee test", function () {
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

    it("should allow anyone to deposit value to add platform fee credits", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            prepaidPlatformFee,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const depositValue = toBigInt(1e17);
        await expect(
            prepaidPlatformFee
                .connect(addr1)
                .deposit(identifier, {value: depositValue})
        ).to.changeEtherBalance(prepaidPlatformFee, depositValue);
        const depositValueInUSD =
            (toBigInt(1e17) + toBigInt(1)) * toBigInt(1500); // 1500 is the token price
        expect(await prepaidPlatformFee.feeCredits(identifier)).to.be.equal(
            depositValueInUSD
        );
    });

    it("should allow tld controller only to deduct platform fee credits", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            prepaidPlatformFee,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const depositValue = toBigInt(1e17);
        await expect(
            prepaidPlatformFee
                .connect(addr1)
                .deposit(identifier, {value: depositValue})
        ).to.changeEtherBalance(prepaidPlatformFee, depositValue);
        const depositValueInUSD =
            (toBigInt(1e17) + toBigInt(1)) * toBigInt(1500); // 1500 is the token price

        // reverts
        await expect(
            prepaidPlatformFee.connect(addr1).deduct(identifier, toBigInt(1e16))
        ).to.be.revertedWith("Accessible: caller is not the tld controller");

        // set addr1 as the tld controlller
        await sann.connect(platformAdmin).setTldController(addr1);

        // succeed
        await prepaidPlatformFee
            .connect(addr1)
            .deduct(identifier, toBigInt(1e16));
        expect(await prepaidPlatformFee.feeCredits(identifier)).to.be.equal(
            depositValueInUSD - toBigInt(1e16)
        );
    });

    it("should allow platform fee collector only to withdraw fee", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            prepaidPlatformFee,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const depositValue = toBigInt(1e17);
        await expect(
            prepaidPlatformFee
                .connect(addr1)
                .deposit(identifier, {value: depositValue})
        ).to.changeEtherBalance(prepaidPlatformFee, depositValue);

        // reverts
        await expect(
            prepaidPlatformFee.connect(addr1).withdraw()
        ).to.be.revertedWith(
            "Ownable: caller is not the platform fee collector"
        );

        // succeed
        await expect(
            prepaidPlatformFee.connect(platformFeeCollector).withdraw()
        ).to.changeEtherBalance(platformFeeCollector, depositValue);
    });

    it("should not compensate precision loss when depoisted value is very small", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            prepaidPlatformFee,
            platformFeeCollector,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // deposit 1e8 WEI
        // no compensation
        let depositValue = toBigInt(1e8);
        await expect(
            prepaidPlatformFee
                .connect(addr1)
                .deposit(identifier, {value: depositValue})
        ).to.changeEtherBalance(prepaidPlatformFee, depositValue);
        let depositValueInUSD =
            (toBigInt(1e8)) * toBigInt(1500); // 1500 is the token price
        expect(await prepaidPlatformFee.feeCredits(identifier)).to.be.equal(
            depositValueInUSD
        );

        // deposit 2e9 WEI
        depositValue = toBigInt(2 * 1e9);
        await expect(
            prepaidPlatformFee
                .connect(addr1)
                .deposit(identifier, {value: depositValue})
        ).to.changeEtherBalance(prepaidPlatformFee, depositValue);
        depositValueInUSD = depositValueInUSD +
            (toBigInt(2 * 1e9 + 1)) * toBigInt(1500); // 1500 is the token price
        expect(await prepaidPlatformFee.feeCredits(identifier)).to.be.equal(
            depositValueInUSD
        );
    });
});
