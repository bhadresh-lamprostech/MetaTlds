import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";
import {expect} from "chai";

const now = Math.floor(Date.now() / 1000);
var initData = {
    config: {
        minDomainLength: 3,
        maxDomainLength: 10,
        minRegistrationDuration: 2592000,
        minRenewDuration: 2592000,
        hasMintCap: false,
        mintCap: 0,
    },
    letters: [3, 4, 5],
    prices: [
        20597680029427, // 650 USD per year
        5070198161089, // 160 USD per year
        158443692534, // 5 USD per year
    ],
    enableGiftCard: true,
    giftCardTokenIds: [10, 11],
    giftCardPrices: [toBigInt(1e18), toBigInt(5 * 1e18)],
    enableReferral: true,
    referralLevels: [1, 2],
    referralComissions: [
        {
            minimumReferralCount: 1,
            referrerRate: 5, // 5%
            refereeRate: 5,
            isValid: true,
        },
        {
            minimumReferralCount: 2,
            referrerRate: 10,
            refereeRate: 10,
            isValid: true,
        },
    ],
    enablePreRegistration: true,
    preRegiConfig: {
        enableAuction: true,
        auctionStartTime: now + 600,
        auctionInitialEndTime: now + 1200, // auctionHardEndTime = auctionInitialEndTime + 86400
        auctionExtendDuration: 86400,
        auctionRetentionDuration: 86400 * 7,
        auctionMinRegistrationDuration: 86400 * 60,
        enableFcfs: true,
        fcfsStartTime: now + 86400 + 1200 + 600, // must be greater than auctionHardEndTime
        fcfsEndTime: now + 86400 + 1200 + 1200,
    },
    preRegiDiscountRateBps: [0, 0, 0, 2000, 2000, 2000], // 20% off
    publicRegistrationStartTime: now + 86400 + 3000,
    publicRegistrationPaused: false,
    baseUri: "https://api.space.id/metadata/",
};

describe("TldFactory Test", function () {
    const CHAIN_ID = 31337;
    const TLD = "test";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const MIN_PLATFORM_FEE = toBigInt(1e17);
    const FEE_RATE = 1500;

    async function deployToolkitFixture() {
        const [
            owner,
            platformAdmin,
            tldOwner,
            platformFeeCollector,
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
            tldFactory,
            usdOracle,
            preRegistrationCreator,
            giftCardVoucher,
        } = await deployToolkit(
            platformAdmin,
            platformFeeCollector,
            MIN_PLATFORM_FEE,
            FEE_RATE
        );

        return {
            owner,
            platformAdmin,
            sann,
            tldFactory,
            tldOwner,
            usdOracle,
            preRegistrationCreator,
            registrar,
            giftCardVoucher,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should create domain service with correct identifier", async function () {
        const {tldFactory, tldOwner, platformAdmin, preRegistrationCreator} =
            await loadFixture(deployToolkitFixture);
        const identifier = await tldFactory
            .connect(platformAdmin)
            .createDomainService.staticCall(
                TLD,
                tldOwner.getAddress(),
                initData
            );
        let calculatedIdentifier: bigint = await calIdentifier(
            CHAIN_ID,
            tldOwner.address,
            TLD
        );
        expect(identifier.toString()).to.equal(calculatedIdentifier.toString());
        await tldFactory
            .connect(platformAdmin)
            .createDomainService(TLD, tldOwner.getAddress(), initData);
    });

    it("should create domain service with correct baseUri", async function () {
        const {
            tldFactory,
            tldOwner,
            platformAdmin,
            preRegistrationCreator,
            sann,
        } = await loadFixture(deployToolkitFixture);
        let identifier: bigint = await calIdentifier(
            CHAIN_ID,
            tldOwner.address,
            TLD
        );
        await tldFactory
            .connect(platformAdmin)
            .createDomainService(TLD, tldOwner.getAddress(), initData);
        let baseAddr = await sann.tldBase(identifier);
        let base = await ethers.getContractAt("Base", baseAddr);
        expect(await base.baseUri()).to.be.equal(initData.baseUri);
    });

    it("enable and disable pre-registration", async function () {
        const {tldFactory, tldOwner, platformAdmin, preRegistrationCreator} =
            await loadFixture(deployToolkitFixture);
        initData.enablePreRegistration = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService(TLD, tldOwner.getAddress(), initData)
        ).not.emit(preRegistrationCreator, "PreRegistrationStateCreated");
        initData.enablePreRegistration = true;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("abc", tldOwner.getAddress(), initData)
        ).to.emit(preRegistrationCreator, "PreRegistrationStateCreated");
    });

    it("enable and disable discount hook", async function () {
        const {tldFactory, tldOwner, platformAdmin, registrar} =
            await loadFixture(deployToolkitFixture);

        initData.preRegiDiscountRateBps = [0, 0, 0, 0, 0, 0];
        initData.enablePreRegistration = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService(TLD, tldOwner.getAddress(), initData)
        ).to.emit(registrar, "SetPriceHook");
        initData.enablePreRegistration = true;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("abc", tldOwner.getAddress(), initData)
        ).to.emit(registrar, "SetPriceHook");
    });

    it("enable and disable referral", async function () {
        const {tldFactory, tldOwner, platformAdmin, registrar} =
            await loadFixture(deployToolkitFixture);

        initData.enableReferral = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService(TLD, tldOwner.getAddress(), initData)
        ).not.emit(registrar, "SetRewardHook");
        initData.enableReferral = true;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("abc", tldOwner.getAddress(), initData)
        ).to.emit(registrar, "SetRewardHook");
    });

    it("enable and disable qualification hook", async function () {
        const {tldFactory, tldOwner, platformAdmin, registrar} =
            await loadFixture(deployToolkitFixture);

        initData.publicRegistrationStartTime = 0;
        initData.publicRegistrationPaused = false;
        initData.enablePreRegistration = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService(TLD, tldOwner.getAddress(), initData)
        ).not.emit(registrar, "SetQualificationHook");

        initData.publicRegistrationStartTime = 1;
        initData.publicRegistrationPaused = false;
        initData.enablePreRegistration = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("test2", tldOwner.getAddress(), initData)
        ).to.emit(registrar, "SetQualificationHook");

        initData.publicRegistrationStartTime = 0;
        initData.publicRegistrationPaused = true;
        initData.enablePreRegistration = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("test3", tldOwner.getAddress(), initData)
        ).to.emit(registrar, "SetQualificationHook");

        initData.publicRegistrationStartTime = now + 86400 + 3000;
        initData.publicRegistrationPaused = false;
        initData.enablePreRegistration = true;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("test4", tldOwner.getAddress(), initData)
        ).to.emit(registrar, "SetQualificationHook");
    });

    it("enable and disable giftcard", async function () {
        const {
            tldFactory,
            tldOwner,
            platformAdmin,
            registrar,
            giftCardVoucher,
        } = await loadFixture(deployToolkitFixture);
        initData.enableGiftCard = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService(TLD, tldOwner.getAddress(), initData)
        ).not.emit(giftCardVoucher, "CustomizedVoucherAdded");

        initData.enableGiftCard = true;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("test2", tldOwner.getAddress(), initData)
        ).to.emit(giftCardVoucher, "CustomizedVoucherAdded");
    });

    it("enable and disable giftcard", async function () {
        const {
            tldFactory,
            tldOwner,
            platformAdmin,
            registrar,
            giftCardVoucher,
        } = await loadFixture(deployToolkitFixture);
        initData.enableGiftCard = false;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService(TLD, tldOwner.getAddress(), initData)
        ).not.emit(giftCardVoucher, "CustomizedVoucherAdded");

        initData.enableGiftCard = true;
        await expect(
            tldFactory
                .connect(platformAdmin)
                .createDomainService("test2", tldOwner.getAddress(), initData)
        ).to.emit(giftCardVoucher, "CustomizedVoucherAdded");
    });
});
