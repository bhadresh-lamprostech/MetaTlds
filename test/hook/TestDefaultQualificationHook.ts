import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";

describe("DefaultQualication test", function () {
    const CHAIN_ID = 56;
    const TLD = "ttt";
    let identifier;

    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000
    let preRegiConfig;

    const E16STR = "0000000000000000";
    const ONE_YEAR_DURATION = 86400 * 365;

    let currTime;
    let publicRegistrationStartTime;
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

        currTime = await time.latest();

        const hooks = await registrar.tldHooks(identifier);
        const qualificationHookAddr = hooks.qualificationHook;
        const qualificationHook = await ethers.getContractAt(
            "DefaultQualificationHook",
            qualificationHookAddr
        );

        await sann.connect(platformAdmin).setTldController(mockController);
        //await preRegiState.connect(tldOwner).addController(qualificationHook);

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
            qualificationHook,
            mockController,
            addr1,
            addr2,
            addr3,
            addr4,
        };
    }

    describe("public registration qualification", async function () {
        it("is not qualified to register before public registration started", async function () {
            const {
                platformAdmin,
                owner,
                tldOwner,
                qualificationHook,
                addr1,
                addr2,
            } = await loadFixture(deployFixture);
            await time.increaseTo(publicRegistrationStartTime - 100);

            let nameOwner = addr1;
            let duration = 86400 * 365;
            expect(
                await qualificationHook.isQualified(
                    identifier,
                    "12345",
                    nameOwner,
                    duration,
                    EXTRA_DATA
                )
            ).to.be.false;
        });

        it("is qualified to register after public registration started", async function () {
            const {
                platformAdmin,
                owner,
                tldOwner,
                qualificationHook,
                addr1,
                addr2,
            } = await loadFixture(deployFixture);
            await time.increaseTo(publicRegistrationStartTime + 100);

            let nameOwner = addr1;
            let duration = 86400 * 365;
            expect(
                await qualificationHook.isQualified(
                    identifier,
                    "12345",
                    nameOwner,
                    duration,
                    EXTRA_DATA
                )
            ).to.be.true;
        });

        it("should allow tldOwner to update public registration start time only", async function () {
            const {
                platformAdmin,
                owner,
                tldOwner,
                qualificationHook,
                preRegiState,
                addr1,
                addr2,
            } = await loadFixture(deployFixture);

            let now = await time.latest();
            let guy = addr1;
            let newPublicRegistartionStartTime = now + 1800;
            // reverts since caller is not the tldOwner
            await expect(
                qualificationHook
                    .connect(guy)
                    .setPublicRegistrationStartTime(
                        newPublicRegistartionStartTime
                    )
            ).to.be.revertedWith("Ownable: caller is not the tld owner");

            // reverts since new public registration start time is less than now
            now = await time.latest();
            newPublicRegistartionStartTime = now - 100;
            await expect(
                qualificationHook
                    .connect(tldOwner)
                    .setPublicRegistrationStartTime(
                        newPublicRegistartionStartTime
                    )
            ).to.be.revertedWith(
                "new publicRegistrationStartTime must be greater than now"
            );

            // reverts since new public registration start time is less than preRegiEndTime
            const preRegiEndTime = await preRegiState.preRegistrationEndTime();
            newPublicRegistartionStartTime = Number(preRegiEndTime) - 100;
            await expect(
                qualificationHook
                    .connect(tldOwner)
                    .setPublicRegistrationStartTime(
                        newPublicRegistartionStartTime
                    )
            ).to.be.revertedWith(
                "new publicRegistrationStartTime must be greater than preRegistrationEndTime"
            );

            // success
            newPublicRegistartionStartTime = publicRegistrationStartTime + 200;
            await qualificationHook
                .connect(tldOwner)
                .setPublicRegistrationStartTime(newPublicRegistartionStartTime);
            expect(
                await qualificationHook.publicRegistrationStartTime()
            ).to.be.equal(newPublicRegistartionStartTime);

            // reverts since public registartion is already started
            await time.increaseTo(newPublicRegistartionStartTime + 1);
            newPublicRegistartionStartTime += 100;
            await expect(
                qualificationHook
                    .connect(tldOwner)
                    .setPublicRegistrationStartTime(
                        newPublicRegistartionStartTime
                    )
            ).to.be.revertedWithCustomError(
                qualificationHook,
                "PublicRegistrationStarted"
            );
        });

        it("should allow tldOwner to pause public registration only", async function () {
            const {
                platformAdmin,
                owner,
                tldOwner,
                qualificationHook,
                preRegiState,
                addr1,
                addr2,
            } = await loadFixture(deployFixture);

            let guy = addr1;
            // reverts since caller is not the tldOwner
            await expect(
                qualificationHook.connect(guy).setPublicRegistrationPaused(true)
            ).to.be.revertedWith("Ownable: caller is not the tld owner");

            // reverts since public registration is not started
            await expect(
                qualificationHook
                    .connect(tldOwner)
                    .setPublicRegistrationPaused(true)
            ).to.be.revertedWithCustomError(
                qualificationHook,
                "PublicRegistrationNotStarted"
            );

            await time.increaseTo(publicRegistrationStartTime + 1);
            await qualificationHook
                .connect(tldOwner)
                .setPublicRegistrationPaused(true);
            expect(await qualificationHook.publicRegistrationPaused()).to.be
                .true;
        });

        it("is not qualified to register when public registration is paused", async function () {
            const {
                platformAdmin,
                owner,
                tldOwner,
                qualificationHook,
                addr1,
                addr2,
            } = await loadFixture(deployFixture);
            await time.increaseTo(publicRegistrationStartTime + 100);

            let nameOwner = addr1;
            let duration = 86400 * 365;
            expect(
                await qualificationHook.isQualified(
                    identifier,
                    "12345",
                    nameOwner,
                    duration,
                    EXTRA_DATA
                )
            ).to.be.true;

            await qualificationHook
                .connect(tldOwner)
                .setPublicRegistrationPaused(true);
            expect(await qualificationHook.publicRegistrationPaused()).to.be
                .true;

            expect(
                await qualificationHook.isQualified(
                    identifier,
                    "12345",
                    nameOwner,
                    duration,
                    EXTRA_DATA
                )
            ).to.be.false;
        });

        it("should allow tldOwner to update preRegiState only", async function () {
            const {
                platformAdmin,
                owner,
                tldOwner,
                qualificationHook,
                preRegiState,
                addr1,
                addr2,
            } = await loadFixture(deployFixture);

            let guy = addr1;
            let newPreRegiState = addr2;
            // reverts since caller is not the tldOwner
            await expect(
                qualificationHook
                    .connect(guy)
                    .setPreRegistrationState(newPreRegiState)
            ).to.be.revertedWith("Ownable: caller is not the tld owner");

            await qualificationHook
                .connect(tldOwner)
                .setPreRegistrationState(newPreRegiState);
            expect(await qualificationHook.preRegiState()).to.be.equal(
                newPreRegiState.address
            );
        });
    });

    describe("preregistration qualification", async function () {
        let qualificationHook;
        let mockController;
        let auction;
        let preRegiState;
        let tldOwner;
        let addr1;
        let addr2;
        let addr3;
        describe("Aucton enabled only", async function () {
            beforeEach(async function makeAllReady() {
                const ret = await loadFixture(deployFixture);
                qualificationHook = ret.qualificationHook;
                mockController = ret.mockController;
                auction = ret.auction;
                addr1 = ret.addr1;
                addr2 = ret.addr2;
                addr3 = ret.addr3;
                preRegiState = ret.preRegiState;
                tldOwner = ret.tldOwner;

                await preRegiState.connect(tldOwner).setUserQuota(addr1, 2);
                await preRegiState.connect(tldOwner).setUserQuota(addr2, 2);
                await preRegiState.connect(tldOwner).enableFcfs(false);
            });

            it("should reject calling qualify from non-controller", async function () {
                await expect(
                    qualificationHook
                        .connect(addr1)
                        .qualify(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.revertedWith(
                    "Accessible: caller is not the tld controller"
                );
            });

            it("should return not qualified if auction is not ended", async function () {
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;

                await time.increaseTo(preRegiConfig.auctionStartTime + 1);
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is qualified to winner's registration in the retention peroid", async function () {
                await time.increaseTo(preRegiConfig.auctionStartTime + 1);

                // bid 1 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr1 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // in the retention peroid
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr1,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });

            it("is qualified to winner's registration after retention peroid", async function () {
                await time.increaseTo(preRegiConfig.auctionStartTime + 1);

                // bid 1 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr1 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // after retention peroid
                await time.increaseTo(
                    preRegiConfig.auctionHardEndTime +
                        preRegiConfig.auctionRetentionDuration +
                        1
                );
                // into public regi
                let now = await time.latest();
                if (now < publicRegistrationStartTime) {
                    await time.increaseTo(publicRegistrationStartTime + 1);
                }
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });

            it("is not qualified to non-winner's normal registration names which is still in the retention peroid", async function () {
                await time.increaseTo(preRegiConfig.auctionStartTime + 1);

                // bid 1 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr1 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // in the retention peroid
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is qualified to non-winner's normal registration names which is out of the retention peroid", async function () {
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

                // after retention peroid
                await time.increaseTo(
                    preRegiConfig.auctionHardEndTime +
                        newAuctionRetentionDuration +
                        1
                );

                // reject
                // before public regi started
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;

                // into public regi
                await time.increaseTo(publicRegistrationStartTime + 1);

                // allow
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });

            it("is not qualified to non-winner's normal registration names with no winner before public registration started", async function () {
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is qualified to non-winner's normal registration names with no winner after public registration started", async function () {
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // into public regi
                await time.increaseTo(publicRegistrationStartTime + 1);

                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });
        });

        describe("FCFS enabled only", async function () {
            beforeEach(async function makeAllReady() {
                const ret = await loadFixture(deployFixture);
                qualificationHook = ret.qualificationHook;
                mockController = ret.mockController;
                auction = ret.auction;
                addr1 = ret.addr1;
                addr2 = ret.addr2;
                addr3 = ret.addr3;
                preRegiState = ret.preRegiState;
                tldOwner = ret.tldOwner;

                await preRegiState
                    .connect(tldOwner)
                    .setUserQuotas([addr1.address, addr2.address], [2, 2]);
                await preRegiState.connect(tldOwner).enableAuction(false);
            });

            it("is not qualified to anyone's registration if FCFS is not started", async function () {
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is not qualified to anyone's registration if FCFS is ended but public registration not started", async function () {
                await time.increaseTo(preRegiConfig.fcfsEndTime + 1); // fcfs ended

                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is not qualified to anyone's registration if FCFS is ended and public registration started", async function () {
                await time.increaseTo(preRegiConfig.fcfsEndTime + 1); // fcfs ended
                // into public regi
                await time.increaseTo(publicRegistrationStartTime + 1);

                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr3,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });

            it("is not qualified to anyone's registration if no quota left", async function () {
                await time.increaseTo(preRegiConfig.fcfsStartTime + 1); // fcfs started
                // addr3 has no quota
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr3,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is qualified to anyone's registration and comuses quota", async function () {
                await time.increaseTo(preRegiConfig.fcfsStartTime + 1); // fcfs started
                // simulate
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;

                // actual call will consume quota
                await qualificationHook
                    .connect(mockController)
                    .qualify(
                        identifier,
                        "1234",
                        addr2,
                        ONE_YEAR_DURATION,
                        EXTRA_DATA
                    );
                expect(
                    await preRegiState.phase2Quota(addr2.address)
                ).to.be.equal(1);
            });
        });

        describe("Auction and FCFS are both enabled", async function () {
            beforeEach(async function makeAllReady() {
                const ret = await loadFixture(deployFixture);
                qualificationHook = ret.qualificationHook;
                mockController = ret.mockController;
                auction = ret.auction;
                addr1 = ret.addr1;
                addr2 = ret.addr2;
                addr3 = ret.addr3;
                preRegiState = ret.preRegiState;
                tldOwner = ret.tldOwner;

                await preRegiState
                    .connect(tldOwner)
                    .setUserQuota(addr1.address, 1);
                await preRegiState
                    .connect(tldOwner)
                    .setUserQuota(addr2.address, 2);
            });

            it("should share quotas", async function () {
                await time.increaseTo(preRegiConfig.auctionStartTime + 1); // auction started
                // addr1 bid with 0.2 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("20" + E16STR)});
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1); // auction ended

                await time.increaseTo(preRegiConfig.fcfsStartTime + 1); // FCFS started
                // no quota left for addr1
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "2234",
                            addr1,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;

                // addr2 still quotas
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "2234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });

            it("is not qualified to non-winner's FCFS registration if the name is still in the retention peroid", async function () {
                // auctionRetentionDuration is 7 days

                await time.increaseTo(preRegiConfig.auctionStartTime + 1); // auction started

                // bid 1 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr1 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // FCFS started
                await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

                // in the retention peroid
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is qualified to auction winner's registration after FCFS started", async function () {
                // auctionRetentionDuration is 7 days

                await time.increaseTo(preRegiConfig.auctionStartTime + 1);

                // bid 1 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr1 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // FCFS started
                await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

                // in the retention peroid
                // no more quota needed
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr1,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });

            it("is qualified to past winner's registration after FCFS started", async function () {
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
                    .connect(addr2)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr2 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // after retention peroid
                await time.increaseTo(
                    preRegiConfig.auctionHardEndTime +
                        newAuctionRetentionDuration +
                        1
                );
                // FCFS started
                await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

                // need to consume another quota
                // addr2 has 2 quota
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });

            it("is not qualified to past winner's registration after FCFS started when no quota left", async function () {
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

                // auction started
                await time.increaseTo(preRegiConfig.auctionStartTime + 1);

                // bid 1 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr1 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // after retention peroid
                await time.increaseTo(
                    preRegiConfig.auctionHardEndTime +
                        newAuctionRetentionDuration +
                        1
                );

                // FCFS started
                await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

                // addr1 has only 1 quota which is consumed in the auction
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr1,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("should behavior same if the name is still in the retention peroid when FCFS ended", async function () {
                // auctionRetentionDuration is 7 days

                await time.increaseTo(preRegiConfig.auctionStartTime + 1); // auction started

                // bid 1 ether
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)});
                // end auction to make addr1 be the winner
                await time.increaseTo(preRegiConfig.auctionHardEndTime + 1);

                // FCFS ended
                await time.increaseTo(preRegiConfig.fcfsEndTime + 1);

                // in the retention peroid
                // qualified winner's registration and no more quota needed
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr1,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;

                // reject other's
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr2,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is not qualified to anyone's registration when FCFS ended but public regi not started", async function () {
                // FCFS ended
                await time.increaseTo(preRegiConfig.fcfsEndTime + 1);

                // allow anyone's registration and no more quota needed
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr3,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.false;
            });

            it("is qualified to anyone's registration when FCFS ended and public regi started", async function () {
                // FCFS ended
                await time.increaseTo(preRegiConfig.fcfsEndTime + 1);

                // into public regi
                await time.increaseTo(publicRegistrationStartTime + 1);

                // allow anyone's registration and no more quota needed
                expect(
                    await qualificationHook
                        .connect(mockController)
                        .qualify.staticCall(
                            identifier,
                            "1234",
                            addr3,
                            ONE_YEAR_DURATION,
                            EXTRA_DATA
                        )
                ).to.be.true;
            });
        });
    });
});
