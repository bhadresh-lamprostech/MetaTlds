import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    encodeHookExtraData,
} from "../test-utils/tld";

describe("PreRegistration test", function () {
    const CHAIN_ID = 56;
    const TLD = "ttt";
    let identifier;

    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000
    let preRegiConfig;

    const AUCTION_RETENTION_DURATION = 600;
    const E16STR = "0000000000000000";
    const MIN_REGISTRATION_DURATION = 86400 * 30;
    const USE_GIFTCARD_EXTRA_DATA = encodeHookExtraData("", true);
    const ONE_YEAR_DURATION = 86400 * 365;

    let currTime;

    async function deployFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            factory,
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
            priceOracle,
            prepaidPlatformFee,
            giftCardVoucher,
            giftCardController,
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
        const auction = ret.auction;
        const preRegiState = ret.preRegistrationState;

        currTime = await time.latest();

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
            priceOracle,
            prepaidPlatformFee,
            giftCardVoucher,
            giftCardController,
            resolver,
            addr1,
            addr2,
            addr3,
            addr4,
        };
    }

    describe("Auction: QA verification", async function () {
        const tokenId = sha3("1234");

        let auction;
        let owner;
        let addr1;
        let addr2;
        let addr3;
        let preRegiState;
        let tldOwner;
        let giftCardVoucher;
        let giftCardController;
        let registrar;
        let priceOracle;
        let resolver;

        beforeEach(async function makeAllReady() {
            const result = await loadFixture(deployFixture);
            auction = result.auction;
            tldOwner = result.tldOwner;
            owner = result.owner;
            addr1 = result.addr1;
            addr2 = result.addr2;
            addr3 = result.addr3;
            preRegiState = result.preRegiState;
            giftCardVoucher = result.giftCardVoucher;
            giftCardController = result.giftCardController;
            registrar = result.registrar;
            priceOracle = result.priceOracle;
            resolver = result.resolver;
        });

        it("should allow non-winner's bid between initalEndTime and hardEndTime", async function () {
            const tokenId = sha3("12345");
            // set quotas
            await preRegiState
                .connect(tldOwner)
                .setUserQuota(addr1.address, 10);
            await preRegiState
                .connect(tldOwner)
                .setUserQuota(addr2.address, 10);

            // start the auction
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // addr1 bid with 0.03 ether and becomes the winner
            await auction
                .connect(addr1)
                .placeBid("12345", {value: toBigInt("3" + E16STR)});

            // push forward the time
            await time.increaseTo(preRegiConfig.auctionInitialEndTime - 100);
            // addr1 bid with 0.01 ether
            await auction
                .connect(addr1)
                .placeBid("12345", {value: toBigInt("1" + E16STR)});
            expect(await auction.isWinner(addr1.address, tokenId)).to.equal(
                true
            );
            // push forward the time
            await time.increaseTo(preRegiConfig.auctionInitialEndTime + 100);

            // addr2 bid with 0.05 ether
            await auction
                .connect(addr2)
                .placeBid("12345", {value: toBigInt("5" + E16STR)});
        });

        it("should use giftcard points when register a domain in FCFS phase", async function () {
            const name = "iphone";
            const tokenId = sha3(name);
            // set quotas
            await preRegiState
                .connect(tldOwner)
                .setUserQuota(addr1.address, 10);

            // get points
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

            // go into the FCFS phase
            await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

            // query price
            let ret = await registrar.rentPrice(
                identifier,
                name,
                ONE_YEAR_DURATION
            );
            const price = ret.base + ret.premium;
            ret = await registrar.rentPriceInUSD(
                identifier,
                name,
                ONE_YEAR_DURATION
            );
            const priceInUSD = ret.base + ret.premium;
            const expectedCost = price;
            const expectedCostAfterPointsDeducted = toBigInt(0);
            if (priceInUSD > toBigInt(20 * 1e18)) {
                expectedCostAfterPointsDeducted =
                    await priceOracle.attoUSDToWei(
                        priceInUSD - toBigInt(20 * 1e18)
                    );
            }

            // register name with giftCardPoints
            const nameOwner = addr1;
            await expect(
                registrar
                    .connect(nameOwner)
                    .bulkRegister(
                        identifier,
                        [name],
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

        it("should allow non-winner's register in FCFS", async function () {
            const tokenId = sha3("12345");
            // set quotas
            await preRegiState.connect(tldOwner).setUserQuota(addr1.address, 1);
            await preRegiState
                .connect(tldOwner)
                .setUserQuota(addr2.address, 10);

            // start the auction
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // addr1 bid with 0.03 ether and becomes the winner
            await auction
                .connect(addr1)
                .placeBid("12345", {value: toBigInt("3" + E16STR)});
            // addr2 will be the winner
            await auction
                .connect(addr2)
                .placeBid("12345", {value: toBigInt("8" + E16STR)});

            // go into the FCFS phase
            await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

            await registrar
                .connect(addr1)
                .bulkRegister(
                    identifier,
                    ["23456"],
                    addr1,
                    ONE_YEAR_DURATION,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                );
        });

        it("should consume quota correctly in FCFS", async function () {
            const tokenId = sha3("12345");
            // set quotas
            await preRegiState.connect(tldOwner).setUserQuota(addr1, 3);

            // go into the FCFS phase
            await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

            // 1
            await registrar
                .connect(addr1)
                .bulkRegister(
                    identifier,
                    ["23456"],
                    addr1,
                    ONE_YEAR_DURATION,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                );
            // 2
            await registrar
                .connect(addr1)
                .bulkRegister(
                    identifier,
                    ["33456"],
                    addr1,
                    ONE_YEAR_DURATION,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                );
            // 3
            await registrar
                .connect(addr1)
                .bulkRegister(
                    identifier,
                    ["43456"],
                    addr1,
                    ONE_YEAR_DURATION,
                    resolver,
                    false,
                    [USE_GIFTCARD_EXTRA_DATA],
                    {value: toBigInt(1e18)}
                );
        });
    });
});
