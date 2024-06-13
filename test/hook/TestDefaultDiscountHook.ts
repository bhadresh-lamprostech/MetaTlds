import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    encodeHookExtraData,
} from "../test-utils/tld";

describe("DefaultDiscountHook test", function () {
    const CHAIN_ID = 56;
    const TLD = "ttt";
    let identifier;

    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000

    let TOKEN_ID_1;
    let TOKEN_ID_2;
    let TOKEN_ID_3;
    const VALUE_1 = toBigInt(1e18); // 1 USD
    const VALUE_2 = toBigInt(1e19); // 10 USD
    const VALUE_3 = toBigInt(1e16); // 0.01 USD

    const E16STR = "0000000000000000";
    const ONE_DAY_DURATION = 86400;
    const ONE_YEAR_DURATION = ONE_DAY_DURATION * 365;
    const ONE_MONTH_DURATION = ONE_DAY_DURATION * 30;
    const USE_GIFTCARD_EXTRA_DATA = encodeHookExtraData("", true);

    let preRegiConfig;
    let currTime;
    let publicRegistrationStartTime;
    let preRegiDiscountRateBps;
    const EXTRA_DATA = "0x"; // not used

    async function deployFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            factory,
            tldOwner,
            mockController,
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
            giftCardLedger,
            giftCardVoucher,
            giftCardController,
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
        const tldBase = ret.tldBase;
        preRegiConfig = ret.preRegiConfig;
        preRegiConfig.auctionHardEndTime =
            preRegiConfig.auctionInitialEndTime + 86400;
        const auction = ret.auction;
        const preRegiState = ret.preRegistrationState;
        publicRegistrationStartTime = ret.publicRegistrationStartTime;
        preRegiDiscountRateBps = ret.preRegiDiscountRateBps;

        currTime = await time.latest();

        const hooks = await registrar.tldHooks(identifier);
        const discountHookAddr = hooks.priceHook;
        const discountHook = await ethers.getContractAt(
            "DefaultDiscountHook",
            discountHookAddr
        );

        await sann.connect(platformAdmin).setTldController(mockController);

        return {
            sann,
            owner,
            platformFeeCollector,
            factory,
            tldOwner,
            platformAdmin,
            registry,
            platformConfig,
            registrar,
            auction,
            preRegiState,
            mockController,
            giftCardLedger,
            giftCardVoucher,
            giftCardController,
            priceOracle,
            discountHook,
            addr1,
            addr2,
            addr3,
            addr4,
        };
    }

    let mockController;
    let auction;
    let preRegiState;
    let tldOwner;
    let giftCardLedger;
    let giftCardVoucher;
    let giftCardController;
    let registrar;
    let priceOracle;
    let discountHook;
    let addr1;
    let addr2;
    let addr3;
    let oneYearCostInUSD;
    let oneMonthCostInUSD;
    let oneDayCostInUSD;
    let platformConfig;

    describe("discount hook", function () {
        beforeEach(async function makeAllReady() {
            let ret = await loadFixture(deployFixture);
            discountHook = ret.discountHook;
            mockController = ret.mockController;
            auction = ret.auction;
            addr1 = ret.addr1;
            addr2 = ret.addr2;
            addr3 = ret.addr3;
            preRegiState = ret.preRegiState;
            tldOwner = ret.tldOwner;
            giftCardLedger = ret.giftCardLedger;
            giftCardVoucher = ret.giftCardVoucher;
            giftCardController = ret.giftCardController;
            registrar = ret.registrar;
            priceOracle = ret.priceOracle;
            platformConfig = ret.platformConfig;

            await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);
            await preRegiState.connect(tldOwner).setUserQuota(addr2, 2);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_MONTH_DURATION
            );
            let priceInWEI = ret.base + ret.premium;
            oneMonthCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_YEAR_DURATION
            );
            priceInWEI = ret.base + ret.premium;
            oneYearCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_DAY_DURATION
            );
            priceInWEI = ret.base + ret.premium;
            oneDayCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);
        });

        it("should reject calling discount from non-controller", async function () {
            await expect(
                discountHook
                    .connect(addr1)
                    .newPrice(
                        identifier,
                        "1234",
                        addr2,
                        ONE_YEAR_DURATION,
                        oneYearCostInUSD,
                        EXTRA_DATA
                    )
            ).to.be.revertedWith(
                "Accessible: caller is not the tld controller"
            );
        });

        it("discount different in the preregistration", async function () {
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // 10% for 4-letter names
            await discountHook
                .connect(tldOwner)
                .setPreRegiDiscountRateBps(4, 1000);
            // 15% for 5-letter names
            await discountHook
                .connect(tldOwner)
                .setPreRegiDiscountRateBps(5, 1500);

            const letter4OneMonthCostInUSD =
                (toBigInt(10000 - 1000) * oneMonthCostInUSD) / toBigInt(10000);
            let ret = await registrar.rentPrice(
                identifier,
                "12345",
                ONE_MONTH_DURATION
            );
            let priceInWEI = ret.base + ret.premium;
            let priceInUSD = await priceOracle.weiToAttoUSD(priceInWEI);
            const letter5OneMonthCostInUSD =
                (toBigInt(10000 - 1500) * priceInUSD) / toBigInt(10000);

            // 4-letter name
            ret = await discountHook
                .connect(mockController)
                .newPrice.staticCall(
                    identifier,
                    "1234",
                    addr1,
                    ONE_MONTH_DURATION,
                    oneMonthCostInUSD,
                    USE_GIFTCARD_EXTRA_DATA
                );

            expect(ret).to.be.equal(letter4OneMonthCostInUSD);

            // 5-letter name
            ret = await discountHook
                .connect(mockController)
                .newPrice.staticCall(
                    identifier,
                    "12345",
                    addr1,
                    ONE_MONTH_DURATION,
                    priceInUSD,
                    USE_GIFTCARD_EXTRA_DATA
                );

            expect(ret).to.be.equal(letter5OneMonthCostInUSD);
        });
    });

    describe("point hook", function () {
        beforeEach(async function makeAllReady() {
            let ret = await loadFixture(deployFixture);
            discountHook = ret.discountHook;
            mockController = ret.mockController;
            auction = ret.auction;
            addr1 = ret.addr1;
            addr2 = ret.addr2;
            addr3 = ret.addr3;
            preRegiState = ret.preRegiState;
            tldOwner = ret.tldOwner;
            giftCardLedger = ret.giftCardLedger;
            giftCardVoucher = ret.giftCardVoucher;
            giftCardController = ret.giftCardController;
            registrar = ret.registrar;
            priceOracle = ret.priceOracle;
            platformConfig = ret.platformConfig;

            await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);
            await preRegiState.connect(tldOwner).setUserQuota(addr2, 2);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_MONTH_DURATION
            );
            let priceInWEI = ret.base + ret.premium;
            oneMonthCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_YEAR_DURATION
            );
            priceInWEI = ret.base + ret.premium;
            oneYearCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_DAY_DURATION
            );
            priceInWEI = ret.base + ret.premium;
            oneDayCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);
        });

        it("discounts when winner register name in the retention peroid", async function () {
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // bid 1 ether
            await auction
                .connect(addr1)
                .placeBid("1234", {value: toBigInt("100" + E16STR)});

            // end auction to make addr1 be the winner
            // in the retention peroid
            await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

            // platform fee paid in the auction, based on the bid amount
            const bidAmountInWei = toBigInt("100" + E16STR);
            const bidAmount = await priceOracle.weiToAttoUSD(bidAmountInWei);
            const expectedDeductible =
                await platformConfig.computeBasicPlatformFee(
                    identifier,
                    bidAmount
                );

            // discount 100% if register duration is less than auctionMinRegiDuration which is 2 months
            let ret = await discountHook
                .connect(mockController)
                .deduct.staticCall(
                    identifier,
                    "1234",
                    addr1,
                    ONE_MONTH_DURATION,
                    oneMonthCostInUSD,
                    0, // not used
                    EXTRA_DATA
                );

            let discount = ret[0];
            let deductible = ret[1];
            expect(discount).to.be.equal(oneMonthCostInUSD);
            expect(deductible).to.be.equal(expectedDeductible);

            // discount auction bid amount off if register duration is greater than auctionMinRegiDuration
            ret = await discountHook.connect(mockController).deduct.staticCall(
                identifier,
                "1234",
                addr1,
                ONE_YEAR_DURATION,
                oneYearCostInUSD,
                0, // not used
                EXTRA_DATA
            );

            let expectedDiscount = oneMonthCostInUSD * toBigInt(2);

            discount = ret[0];
            deductible = ret[1];
            expect(discount).to.be.equal(expectedDiscount);
            expect(deductible).to.be.equal(expectedDeductible);
        });

        it("won't discount when winner register name after the retention peroid", async function () {
            // set new auctionRetentionDuration to 10 seconds
            const newAuctionRetentionDuration = 10;
            await preRegiState
                .connect(tldOwner)
                .setAuctionConfigs(
                    true,
                    preRegiConfig.auctionStartTime,
                    preRegiConfig.auctionInitialEndTime,
                    preRegiConfig.auctionExtendDuration,
                    newAuctionRetentionDuration,
                    preRegiConfig.auctionMinRegistrationDuration
                );

            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // bid 1 ether
            await auction
                .connect(addr1)
                .placeBid("1234", {value: toBigInt("100" + E16STR)});

            // end auction to make addr1 be the winner
            await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

            // after retention peroid but still in preRegistration
            await time.increaseTo(
                preRegiConfig.auctionHardEndTime +
                    newAuctionRetentionDuration +
                    1
            );

            let ret = await discountHook
                .connect(mockController)
                .deduct.staticCall(
                    identifier,
                    "1234",
                    addr1,
                    ONE_MONTH_DURATION,
                    oneMonthCostInUSD,
                    0, // not usded
                    EXTRA_DATA
                );

            let discount = ret[0];
            let deductible = ret[1];
            expect(discount).to.be.equal(0);
            expect(deductible).to.be.equal(0);

            // into public regi
            let now = await time.latest();
            if (now < publicRegistrationStartTime) {
                await time.increaseTo(publicRegistrationStartTime + 1);
            }

            ret = await discountHook.connect(mockController).deduct.staticCall(
                identifier,
                "1234",
                addr1,
                ONE_MONTH_DURATION,
                oneMonthCostInUSD,
                0, // not used
                EXTRA_DATA
            );

            discount = ret[0];
            deductible = ret[1];
            expect(discount).to.be.equal(0);
            expect(deductible).to.be.equal(0);
        });
    });

    describe("giftCard disocunt", function () {
        beforeEach(async function makeAllReady() {
            let ret = await loadFixture(deployFixture);
            discountHook = ret.discountHook;
            mockController = ret.mockController;
            auction = ret.auction;
            addr1 = ret.addr1;
            addr2 = ret.addr2;
            addr3 = ret.addr3;
            preRegiState = ret.preRegiState;
            tldOwner = ret.tldOwner;
            giftCardLedger = ret.giftCardLedger;
            giftCardVoucher = ret.giftCardVoucher;
            giftCardController = ret.giftCardController;
            registrar = ret.registrar;
            priceOracle = ret.priceOracle;
            platformConfig = ret.platformConfig;

            await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);
            await preRegiState.connect(tldOwner).setUserQuota(addr2, 2);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_MONTH_DURATION
            );
            let priceInWEI = ret.base + ret.premium;
            oneMonthCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_YEAR_DURATION
            );
            priceInWEI = ret.base + ret.premium;
            oneYearCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);

            ret = await registrar.rentPrice(
                identifier,
                "1234",
                ONE_DAY_DURATION
            );
            priceInWEI = ret.base + ret.premium;
            oneDayCostInUSD = await priceOracle.weiToAttoUSD(priceInWEI);

            TOKEN_ID_1 = await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher.staticCall(identifier, VALUE_1);
            TOKEN_ID_2 = await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher.staticCall(identifier, VALUE_2);

            await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher(identifier, VALUE_1);
            await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher(identifier, VALUE_2);

            // register giftCards for addr1 and redeem them
            await giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [20, 20], {
                    value: toBigInt(1e18),
                });
            // addr1's balance is 220 USD
            await giftCardController
                .connect(addr1)
                .batchRedeem(identifier, [TOKEN_ID_1, TOKEN_ID_2], [20, 20]);

            // register 4 giftCards for addr2
            await giftCardController
                .connect(addr2)
                .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {
                    value: toBigInt(1e18),
                });
        });

        it("discount normal in the preregistration", async function () {
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // cancel prereigstration discount
            await discountHook
                .connect(tldOwner)
                .setPreRegiDiscountRateBps(4, 0);

            const expectedDeductible =
                (oneMonthCostInUSD * toBigInt(PLATFORM_FEE_RATIO)) /
                toBigInt(10000);

            let ret = await discountHook
                .connect(mockController)
                .deduct.staticCall(
                    identifier,
                    "1234",
                    addr1,
                    ONE_MONTH_DURATION,
                    oneMonthCostInUSD,
                    0, // not used
                    USE_GIFTCARD_EXTRA_DATA
                );

            let discount = ret[0];
            let deductible = ret[1];
            expect(discount).to.be.equal(oneMonthCostInUSD);
            expect(deductible).to.be.equal(expectedDeductible);
        });

        it("discount 0 before giftCards been redeemed", async function () {
            // into public regi
            let now = await time.latest();
            if (now < publicRegistrationStartTime) {
                await time.increaseTo(publicRegistrationStartTime + 1);
            }

            let ret = await discountHook
                .connect(mockController)
                .deduct.staticCall(
                    identifier,
                    "1234",
                    addr2, // addr2 has not redeemed the giftCards yet
                    ONE_MONTH_DURATION,
                    oneMonthCostInUSD,
                    0, // not used
                    USE_GIFTCARD_EXTRA_DATA
                );

            let discount = ret[0];
            let deductible = ret[1];
            expect(discount).to.be.equal(0);
            expect(deductible).to.be.equal(0);
        });

        it("discount 100% if giftCard points balance is enough", async function () {
            // into public regi
            let now = await time.latest();
            if (now < publicRegistrationStartTime) {
                await time.increaseTo(publicRegistrationStartTime + 1);
            }

            let ret = await discountHook
                .connect(mockController)
                .deduct.staticCall(
                    identifier,
                    "1234",
                    addr1,
                    ONE_MONTH_DURATION,
                    oneMonthCostInUSD,
                    0, // not used
                    USE_GIFTCARD_EXTRA_DATA
                );

            const expectedDeductible =
                await platformConfig.computeBasicPlatformFee(
                    identifier,
                    oneMonthCostInUSD
                );

            let discount = ret[0];
            let deductible = ret[1];
            expect(discount).to.be.equal(oneMonthCostInUSD);
            expect(deductible).to.be.equal(expectedDeductible);

            // should deduct the points
            // new balance should be originalBalance - discount
            const balance = await giftCardLedger.balanceOf(
                identifier,
                addr1.address
            );
            await discountHook.connect(mockController).deduct(
                identifier,
                "1234",
                addr1,
                ONE_MONTH_DURATION,
                oneMonthCostInUSD,
                0, // not used
                USE_GIFTCARD_EXTRA_DATA
            );
            expect(
                await giftCardLedger.balanceOf(identifier, addr1)
            ).to.be.equal(balance - discount);
        });

        it("discount all the points if giftCard points balance is not enough", async function () {
            // into public regi
            let now = await time.latest();
            if (now < publicRegistrationStartTime) {
                await time.increaseTo(publicRegistrationStartTime + 1);
            }

            // create small value giftCard
            TOKEN_ID_3 = await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher.staticCall(identifier, VALUE_3);
            await giftCardVoucher
                .connect(tldOwner)
                .addCustomizedVoucher(identifier, VALUE_3);
            // register 1 giftCard for addr3 and redeem it
            // now addr3 has 15USD points
            await giftCardController
                .connect(addr3)
                .batchRegister([TOKEN_ID_2], [1], {
                    value: toBigInt(1e18),
                });
            // total balance is 10 USD
            await giftCardController
                .connect(addr3)
                .batchRedeem(identifier, [TOKEN_ID_2], [1]);

            const pointBalance = await giftCardLedger.balanceOf(
                identifier,
                addr3
            );

            let ret = await discountHook
                .connect(mockController)
                .deduct.staticCall(
                    identifier,
                    "1234",
                    addr3,
                    ONE_YEAR_DURATION,
                    oneYearCostInUSD, // 160 USD
                    0, // not used
                    USE_GIFTCARD_EXTRA_DATA
                );

            const expectedDeductible =
                await platformConfig.computeBasicPlatformFee(
                    identifier,
                    pointBalance
                );

            let discount = ret[0];
            let deductible = ret[1];
            expect(discount).to.be.equal(pointBalance);
            expect(deductible).to.be.equal(expectedDeductible);

            // should deduct the points
            // new balance should be 0
            await discountHook.connect(mockController).deduct(
                identifier,
                "1234",
                addr3,
                ONE_YEAR_DURATION,
                oneYearCostInUSD,
                0, // not used
                USE_GIFTCARD_EXTRA_DATA
            );
            expect(
                await giftCardLedger.balanceOf(identifier, addr3)
            ).to.be.equal(0);
        });
    });
});
