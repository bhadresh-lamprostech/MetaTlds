import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";

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
            addr1,
            addr2,
            addr3,
            addr4,
        };
    }

    describe("Auction: 3 users bid 1 name", async function () {
        const tokenId = sha3("1234");

        let auction;
        let owner;
        let addr1;
        let addr2;
        let addr3;
        let preRegiState;
        let tldOwner;

        before(async function makeAllReady() {
            const result = await loadFixture(deployFixture);
            auction = result.auction;
            tldOwner = result.tldOwner;
            owner = result.owner;
            addr1 = result.addr1;
            addr2 = result.addr2;
            addr3 = result.addr3;
            preRegiState = result.preRegiState;
        });

        it("reverts if set user quota by non-tldOwner", async function () {
            await expect(
                preRegiState.connect(addr1).setUserQuota(addr2.address, 10)
            ).to.be.revertedWith("Ownable: caller is not the tld owner");
        });

        it("should set user quota by tldOwner before auction starts", async function () {
            await preRegiState
                .connect(tldOwner)
                .setUserQuota(addr1.address, 10);
            await preRegiState
                .connect(tldOwner)
                .setUserQuota(addr2.address, 10);
            await preRegiState
                .connect(tldOwner)
                .setUserQuota(addr3.address, 10);
        });

        it("reverts if bid before auction starts", async function () {
            await expect(
                auction
                    .connect(addr2)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)})
            ).to.be.revertedWith("not in auction");
        });

        // auction starts
        it("reverts if first bid value is less than registration price", async function () {
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // min registration duration is 1 month
            // 4-letters domain registration price for 1 month is 13.33 USD,
            // which converts to ether($1500) is 0.0089
            // addr1 bid with 0.0005 ether
            await expect(
                auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt(5 * 1e14)})
            ).to.be.revertedWithCustomError(auction, "BidAmountTooLow");
        });

        it("reverts if set user quota by tldOwner after auction starts", async function () {
            await expect(
                preRegiState.connect(tldOwner).setUserQuota(addr2.address, 20)
            ).to.be.revertedWithCustomError(
                preRegiState,
                "PreRegistrationNotStarted"
            );
        });

        // addr1 bid with 0.2 ether and is the winner
        it("makes first bidder winner", async function () {
            await auction
                .connect(addr1)
                .placeBid("1234", {value: toBigInt("20" + E16STR)});
            expect(await auction.isWinner(addr1.address, tokenId)).to.equal(
                true
            );
        });

        it("reverts if new bid value is less than 105% of the top bid", async function () {
            await expect(
                // addr2 bid with 0.209 ether (less than min value 0.21=0.2*105% )
                auction.connect(addr2).placeBid("1234", {
                    value: toBigInt("209000000000000000"),
                })
            ).to.be.revertedWithCustomError(auction, "BidAmountTooLow");
        });

        // addr2 bid with 0.21 ether and is the winner
        it("makes higher bidder winner", async function () {
            await auction
                .connect(addr2)
                .placeBid("1234", {value: toBigInt("21" + E16STR)});
            expect(await auction.isWinner(addr2.address, tokenId)).to.equal(
                true
            );
        });

        // addr2 bid with 0.09 ether
        // addr3 bid with 0.4 ether and is the winner
        it("makes higher bidder winner", async function () {
            await auction
                .connect(addr2)
                .placeBid("1234", {value: toBigInt("9" + E16STR)});
            await auction
                .connect(addr3)
                .placeBid("1234", {value: toBigInt("40" + E16STR)});
            expect(await auction.isWinner(addr3.address, tokenId)).to.equal(
                true
            );
        });

        // addr1 bid with 0.25 ether (total bid 0.45 ether) and is the winner
        it("makes higher bidder winner", async function () {
            await auction
                .connect(addr1)
                .placeBid("1234", {value: toBigInt("25" + E16STR)});
            expect(await auction.isWinner(addr1.address, tokenId)).to.equal(
                true
            );
        });

        // non-winner withdraw bidded money
        it("withdraw all bidded money", async function () {
            // amount: 0.21 + 0.09
            expect(
                await auction.connect(addr2).withdraw("1234")
            ).to.changeEtherBalance(addr2, toBigInt("30" + E16STR));
        });

        // addr2 bid with 0.3 ether after withdraw
        // total bid value is 0.3 (not 0.3 + 0.3) which is less than 105% of the top bid
        it("reverts if new bid value is less than 105% of the top bid after withraw", async function () {
            await expect(
                auction
                    .connect(addr2)
                    .placeBid("1234", {value: toBigInt("30" + E16STR)})
            ).to.be.revertedWithCustomError(auction, "BidAmountTooLow");
        });

        it("shows top 10 highest price bids", async function () {
            const top10bids = await preRegiState.connect(addr1).topBidsView();

            expect(top10bids.length).to.equal(10);
            expect(top10bids[0].label).to.equal("1234");
            expect(top10bids[0].bid).to.equal(toBigInt("45" + E16STR));

            expect(top10bids[1].label).to.equal("");
            expect(top10bids[1].bid).to.equal(toBigInt("0"));
            expect(top10bids[2].label).to.equal("");
            expect(top10bids[2].bid).to.equal(toBigInt("0"));
            expect(top10bids[3].label).to.equal("");
            expect(top10bids[3].bid).to.equal(toBigInt("0"));
            expect(top10bids[4].label).to.equal("");
            expect(top10bids[4].bid).to.equal(toBigInt("0"));
            expect(top10bids[5].label).to.equal("");
            expect(top10bids[5].bid).to.equal(toBigInt("0"));
            expect(top10bids[6].label).to.equal("");
            expect(top10bids[6].bid).to.equal(toBigInt("0"));
            expect(top10bids[7].label).to.equal("");
            expect(top10bids[7].bid).to.equal(toBigInt("0"));
            expect(top10bids[8].label).to.equal("");
            expect(top10bids[8].bid).to.equal(toBigInt("0"));
            expect(top10bids[9].label).to.equal("");
            expect(top10bids[9].bid).to.equal(toBigInt("0"));
        });

        it("reverts if user dose not have enough quota", async function () {
            // addr3 bid other domains
            await auction
                .connect(addr3)
                .placeBid("3000", {value: toBigInt("30" + E16STR)});
            await auction
                .connect(addr3)
                .placeBid("3001", {value: toBigInt("31" + E16STR)});
            await auction
                .connect(addr3)
                .placeBid("3002", {value: toBigInt("32" + E16STR)});
            await auction
                .connect(addr3)
                .placeBid("3003", {value: toBigInt("33" + E16STR)});
            await auction
                .connect(addr3)
                .placeBid("3004", {value: toBigInt("34" + E16STR)});

            // addr2 bid other domains
            await auction
                .connect(addr2)
                .placeBid("2000", {value: toBigInt("20" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2001", {value: toBigInt("21" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2002", {value: toBigInt("22" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2003", {value: toBigInt("23" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2004", {value: toBigInt("24" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2005", {value: toBigInt("25" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2006", {value: toBigInt("26" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2007", {value: toBigInt("27" + E16STR)});
            await auction
                .connect(addr2)
                .placeBid("2008", {value: toBigInt("28" + E16STR)});
            await expect(
                auction
                    .connect(addr2)
                    .placeBid("2009", {value: toBigInt("24" + E16STR)})
            ).to.be.revertedWithCustomError(preRegiState, "NotEnoughQuota");

            // addr2 can still bid previous domains
            await auction
                .connect(addr2)
                .placeBid("2001", {value: toBigInt("9" + E16STR)});
        });

        it("shows user's bids", async function () {
            const bidsView = await preRegiState.userBidsView(addr3);

            expect(bidsView.length).to.equal(6);
            expect(bidsView[0].label).to.equal("1234");
            expect(bidsView[0].tokenID).to.equal(sha3("1234"));
            expect(bidsView[0].winner).to.equal(addr1.address);
            expect(bidsView[0].highestBid).to.equal(toBigInt("45" + E16STR));
            expect(bidsView[0].userBid).to.equal(toBigInt("40" + E16STR));
            expect(bidsView[1].label).to.equal("3000");
            expect(bidsView[1].tokenID).to.equal(sha3("3000"));
            expect(bidsView[1].winner).to.equal(addr3.address);
            expect(bidsView[1].highestBid).to.equal(toBigInt("30" + E16STR));
            expect(bidsView[1].userBid).to.equal(toBigInt("30" + E16STR));
            expect(bidsView[2].label).to.equal("3001");
            expect(bidsView[2].tokenID).to.equal(sha3("3001"));
            expect(bidsView[2].winner).to.equal(addr3.address);
            expect(bidsView[2].highestBid).to.equal(toBigInt("31" + E16STR));
            expect(bidsView[2].userBid).to.equal(toBigInt("31" + E16STR));
            expect(bidsView[3].label).to.equal("3002");
            expect(bidsView[3].tokenID).to.equal(sha3("3002"));
            expect(bidsView[3].winner).to.equal(addr3.address);
            expect(bidsView[3].highestBid).to.equal(toBigInt("32" + E16STR));
            expect(bidsView[3].userBid).to.equal(toBigInt("32" + E16STR));
            expect(bidsView[4].label).to.equal("3003");
            expect(bidsView[4].tokenID).to.equal(sha3("3003"));
            expect(bidsView[4].winner).to.equal(addr3.address);
            expect(bidsView[4].highestBid).to.equal(toBigInt("33" + E16STR));
            expect(bidsView[4].userBid).to.equal(toBigInt("33" + E16STR));
            expect(bidsView[5].label).to.equal("3004");
            expect(bidsView[5].tokenID).to.equal(sha3("3004"));
            expect(bidsView[5].winner).to.equal(addr3.address);
            expect(bidsView[5].highestBid).to.equal(toBigInt("34" + E16STR));
            expect(bidsView[5].userBid).to.equal(toBigInt("34" + E16STR));
        });

        // addr2 bids with 0.6 ether (total bid is 0.6 ether)
        // and becomes new winner
        it("should be biddable and make higher bidder new winner and extend the auction", async function () {
            // new bid will push foraward the endTime to auctionHardEndTime
            // when it's close to aucitonInitalEndTime (less than auctionExtendDuration)
            // in this case we set auctionExtendDuration to 1 day,
            let now = preRegiConfig.auctionInitialEndTime - 100;
            await time.increaseTo(now);
            // push forward the endTime to (auctionInitialEndTime + auctionExtendDuration)
            await auction
                .connect(addr2)
                .placeBid("1234", {value: toBigInt("60" + E16STR)});
            expect(await auction.isWinner(addr2.address, tokenId)).to.equal(
                true
            );
            now = await time.latest();
            // so the endTime will be now + auctionExtendDuration
            let auctionStatus = await preRegiState.auctionStatus(tokenId);
            expect(auctionStatus.endTime).to.equal(
                now + preRegiConfig.auctionExtendDuration
            );
        });

        it("reverts if winner withdraw fund", async function () {
            await expect(
                auction.connect(addr2).withdraw("1234")
            ).to.be.revertedWithCustomError(
                auction,
                "AuctionWinnerCannotWithdraw"
            );
        });

        it("should be biddable after initialEndTime", async function () {
            // time flies
            let now = preRegiConfig.auctionInitialEndTime + 100;
            await time.increaseTo(now);
            // addr1 bids another 0.2 ether
            // addr1 shall bid succefully cause last bid extended the auction
            // and push forward the endTime to auctionHardEndTime
            // which is auctionInitialEndTime + 1 day
            // now addr1 is the new winner (total bid 0.65)
            await auction
                .connect(addr1)
                .placeBid("1234", {value: toBigInt("20" + E16STR)});

            let auctionStatus = await preRegiState.auctionStatus(tokenId);
            expect(auctionStatus.endTime).to.equal(
                preRegiConfig.auctionInitialEndTime + 86400
            );
        });

        it("reverts if bid unextended auction", async function () {
            // 2001: bid twice
            let auctionStatus = await preRegiState.auctionStatus(sha3("2001"));
            await time.increaseTo(auctionStatus.endTime + toBigInt(1));
            await expect(
                auction
                    .connect(addr2)
                    .placeBid("2001", {value: toBigInt("10" + E16STR)})
            ).to.be.revertedWithCustomError(auction, "AuctionEnded");
            // 3005: new bid
            await expect(
                auction
                    .connect(addr3)
                    .placeBid("3005", {value: toBigInt("10" + E16STR)})
            ).to.be.revertedWithCustomError(auction, "AuctionEnded");
        });

        it("should withdraw all bidded money to non-tldOwners", async function () {
            // addr2 amount: 0.6
            expect(
                await auction.connect(addr2).withdraw("1234")
            ).to.changeEtherBalance(addr2, toBigInt("60" + E16STR));
            // addr3 amount: 0.4
            expect(
                await auction.connect(addr3).withdraw("1234")
            ).to.changeEtherBalance(addr2, toBigInt("40" + E16STR));
        });

        it("reverts if winner withdraw fund", async function () {
            await expect(
                auction.connect(addr1).withdraw("1234")
            ).to.be.revertedWithCustomError(
                auction,
                "AuctionWinnerCannotWithdraw"
            );
            await expect(
                auction.connect(addr2).withdraw("2001")
            ).to.be.revertedWithCustomError(
                auction,
                "AuctionWinnerCannotWithdraw"
            );
            await expect(
                auction.connect(addr3).withdraw("3001")
            ).to.be.revertedWithCustomError(
                auction,
                "AuctionWinnerCannotWithdraw"
            );
        });

        it("reverts if tldOwner withdraw all winners' fund before HardEndTime", async function () {
            await expect(
                auction.connect(tldOwner).ownerWithdraw()
            ).to.be.revertedWith("auction not ended");
        });

        it("reverts if bid after hardEndTime cause previous bid cannot extend auction beyond hardEndTime", async function () {
            await time.increaseTo(
                preRegiConfig.auctionInitialEndTime + 86400 + 1
            );
            await expect(
                auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("20" + E16STR)})
            ).to.be.revertedWith("not in auction");
        });

        it("reverts if non-tldOwner withdraw all winners' fund", async function () {
            await expect(
                auction.connect(addr2).ownerWithdraw()
            ).to.be.revertedWith("Ownable: caller is not the tld owner");
        });

        it("withdraw all winners' fund", async function () {
            // addr1 bid 1234 for 0.65
            // addr2 bid 9 domains for 0.20+(0.21+0.09)+0.22+0.23+0.24+0.25+0.26+0.27+0.28 = 2.25
            // addr3 bid 5 domains for 0.3+0.31+0.32+0.33+0.34 = 1.6
            expect(
                await auction.connect(tldOwner).ownerWithdraw()
            ).to.changeEtherBalance(tldOwner, toBigInt("450" + E16STR));
        });

        it("returns all users' quota can be used in phase 2", async function () {
            // addr1 win 1 domain - 1234
            expect(
                await preRegiState.connect(addr1).phase2Quota(addr1.address)
            ).to.equal(9);

            // addr2 win 9 domains - 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008
            // lose 1 domain - 1234
            expect(
                await preRegiState.connect(addr1).phase2Quota(addr2.address)
            ).to.equal(1);
            // addr3 win 5 domains - 3000, 3001, 3002, 3003, 3004
            // lose 1 domain - 1234
            expect(
                await preRegiState.connect(addr1).phase2Quota(addr3.address)
            ).to.equal(5);
        });

        it("shows top 10 highest price bids", async function () {
            const top10bids = await preRegiState.connect(addr1).topBidsView();

            expect(top10bids.length).to.equal(10);
            expect(top10bids[0].label).to.equal("1234");
            expect(top10bids[0].bid).to.equal(toBigInt("65" + E16STR));

            expect(top10bids[1].label).to.equal("3004");
            expect(top10bids[1].bid).to.equal(toBigInt("34" + E16STR));

            expect(top10bids[2].label).to.equal("3003");
            expect(top10bids[2].bid).to.equal(toBigInt("33" + E16STR));

            expect(top10bids[3].label).to.equal("3002");
            expect(top10bids[3].bid).to.equal(toBigInt("32" + E16STR));

            expect(top10bids[4].label).to.equal("3001");
            expect(top10bids[4].bid).to.equal(toBigInt("31" + E16STR));

            // if bid value is same, later bid go front
            expect(top10bids[5].label).to.equal("2001");
            expect(top10bids[5].bid).to.equal(toBigInt("30" + E16STR));

            expect(top10bids[6].label).to.equal("3000");
            expect(top10bids[6].bid).to.equal(toBigInt("30" + E16STR));

            expect(top10bids[7].label).to.equal("2008");
            expect(top10bids[7].bid).to.equal(toBigInt("28" + E16STR));

            expect(top10bids[8].label).to.equal("2007");
            expect(top10bids[8].bid).to.equal(toBigInt("27" + E16STR));

            expect(top10bids[9].label).to.equal("2006");
            expect(top10bids[9].bid).to.equal(toBigInt("26" + E16STR));
        });
    });

    describe("Auction: charge platform fee", async function () {
        it("should charge platform fee right", async function () {
            const {
                platformAdmin,
                platformFeeCollector,
                platformConfig,
                owner,
                tldOwner,
                auction,
                preRegiState,
                addr1,
                addr2,
            } = await loadFixture(deployFixture);

            // set quota
            await preRegiState.connect(tldOwner).setUserQuota(addr1.address, 2);
            await preRegiState.connect(tldOwner).setUserQuota(addr2.address, 2);

            // auction starts
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            // addr1 bid with 0.2 ether
            // and fee collector should receive 0.03 ether (0.2 * 15%)
            expect(
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("20" + E16STR)})
            ).to.changeEtherBalance(
                platformFeeCollector,
                toBigInt("3" + E16STR)
            );

            // addr1 bid with 0.2 ether
            // and fee collector should receive another 0.03 ether ((0.4 - 0.2) * 15%)
            expect(
                await auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("40" + E16STR)})
            ).to.changeEtherBalance(
                platformFeeCollector,
                toBigInt("3" + E16STR)
            );

            // addr2 bid with 1 ether
            // and fee collector should receive 0.12 ether ((1 - 0.4) * 15%)
            expect(
                await auction
                    .connect(addr2)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)})
            ).to.changeEtherBalance(
                platformFeeCollector,
                toBigInt("12" + E16STR)
            );

            // end auction to make addr2 be the winner
            await time.increaseTo(currTime + 86400 + 3300);

            // non-winner should get back all bid value
            expect(
                await auction.connect(addr1).withdraw("1234")
            ).to.changeEtherBalance(addr1, toBigInt("40" + E16STR));

            // tldOwner should get bid value after fee changed
            // which is 0.85 (1 * (1 - 15%))
            expect(
                await auction.connect(tldOwner).ownerWithdraw()
            ).to.changeEtherBalance(tldOwner, toBigInt("85" + E16STR));
        });
    });

    describe("Prepaid Platform Fee", async function () {
        const tokenId = sha3("1234");

        let auction;
        let owner;
        let addr1;
        let addr2;
        let addr3;
        let preRegiState;
        let tldOwner;
        let prepaidPlatformFee;
        let priceOracle;
        let platformFeeCollector;

        before(async function makeAllReady() {
            const result = await loadFixture(deployFixture);
            auction = result.auction;
            tldOwner = result.tldOwner;
            owner = result.owner;
            addr1 = result.addr1;
            addr2 = result.addr2;
            addr3 = result.addr3;
            preRegiState = result.preRegiState;
            priceOracle = result.priceOracle;
            prepaidPlatformFee = result.prepaidPlatformFee;
            platformFeeCollector = result.platformFeeCollector;

            await preRegiState.connect(tldOwner).setUserQuota(addr1, 10);
            await preRegiState.connect(tldOwner).setUserQuota(addr2, 10);
            await preRegiState.connect(tldOwner).setUserQuota(addr3, 10);
        });

        it("deposits right amount of platform fee from first bid", async function () {
            // start the auction
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            const bidAmount = toBigInt("20" + E16STR);
            const expectedBalanceChange =
                (bidAmount * toBigInt(PLATFORM_FEE_RATIO)) / toBigInt(10000);
            const expectedPrepaidPlatformFee = await priceOracle.weiToAttoUSD(
                expectedBalanceChange + toBigInt(1) // precision loss compensatation
            );

            // bid 0.2 ether
            await expect(
                auction.connect(addr1).placeBid("1234", {value: bidAmount})
            ).to.changeEtherBalance(prepaidPlatformFee, expectedBalanceChange);

            expect(await prepaidPlatformFee.feeCredits(identifier)).to.equal(
                expectedPrepaidPlatformFee
            );
        });

        it("deposits right amount of platform fee from following bids", async function () {
            // first bid
            const firstBidAmount = toBigInt("20" + E16STR);
            const firstBidFee =
                (firstBidAmount * toBigInt(PLATFORM_FEE_RATIO)) /
                toBigInt(10000);

            // second bid
            const bidAmount = toBigInt("10" + E16STR);
            const expectedBalanceChange =
                (bidAmount * toBigInt(PLATFORM_FEE_RATIO)) / toBigInt(10000);
            const expectedPrepaidPlatformFee = await priceOracle.weiToAttoUSD(
                firstBidFee + toBigInt(1) + expectedBalanceChange + toBigInt(1) // precision loss compensatation
            );

            // bid 0.1 ether
            await expect(
                auction.connect(addr1).placeBid("1234", {value: bidAmount})
            ).to.changeEtherBalance(prepaidPlatformFee, expectedBalanceChange);

            expect(await prepaidPlatformFee.feeCredits(identifier)).to.equal(
                expectedPrepaidPlatformFee
            );
        });
    });

    describe("Config setting", async function () {
        it("should update auction configs only by tldOwner before auction start", async function () {
            const {preRegiState, auction, tldOwner, addr1} = await loadFixture(
                deployFixture
            );

            let newAuctionEnabled = false;
            let newAuctionStartTime = preRegiConfig.auctionStartTime + 100;
            let newAuctionInitialEndTime =
                preRegiConfig.auctionInitialEndTime + 100;
            let newAuctionExtendDuration =
                preRegiConfig.auctionExtendDuration + 10;
            let newAuctionRetentionDuration =
                preRegiConfig.auctionRetentionDuration + 100;
            let newAuctionMinRegistrationDuration =
                preRegiConfig.auctionMinRegistrationDuration;
            // revert the setting from non-tldOwner
            await expect(
                preRegiState
                    .connect(addr1)
                    .setAuctionConfigs(
                        newAuctionEnabled,
                        newAuctionStartTime,
                        newAuctionInitialEndTime,
                        newAuctionExtendDuration,
                        newAuctionRetentionDuration,
                        newAuctionMinRegistrationDuration
                    )
            ).to.be.reverted;
            await preRegiState
                .connect(tldOwner)
                .setAuctionConfigs(
                    newAuctionEnabled,
                    newAuctionStartTime,
                    newAuctionInitialEndTime,
                    newAuctionExtendDuration,
                    newAuctionRetentionDuration,
                    newAuctionMinRegistrationDuration
                );
            expect(await preRegiState.auctionEnabled()).to.be.equal(
                newAuctionEnabled
            );
            expect(await preRegiState.auctionStartTime()).to.be.equal(
                newAuctionStartTime
            );
            expect(await preRegiState.auctionInitialEndTime()).to.be.equal(
                newAuctionInitialEndTime
            );
            expect(await preRegiState.auctionRetentionDuration()).to.be.equal(
                newAuctionRetentionDuration
            );
            expect(await preRegiState.auctionHardEndTime()).to.be.equal(
                newAuctionInitialEndTime + 86400
            );
            expect(await preRegiState.auctionRetentionDuration()).to.be.equal(
                newAuctionRetentionDuration
            );
            expect(
                await preRegiState.auctionMinRegistrationDuration()
            ).to.be.equal(newAuctionMinRegistrationDuration);
        });

        it("reverts auction config updating after auction started", async function () {
            const {preRegiState, tldOwner, addr1} = await loadFixture(
                deployFixture
            );

            let newAuctionEnabled = false;
            let newAuctionStartTime = preRegiConfig.auctionStartTime + 100;
            let newAuctionInitialEndTime =
                preRegiConfig.auctionInitialEndTime + 100;
            let newAuctionExtendDuration =
                preRegiConfig.auctionExtendDuration + 10;
            let newAuctionRetentionDuration =
                preRegiConfig.auctionRetentionDuration + 100;
            let newAuctionMinRegistrationDuration =
                preRegiConfig.auctionMinRegistrationDuration;

            // auction starts
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);

            await expect(
                preRegiState
                    .connect(addr1)
                    .setAuctionConfigs(
                        newAuctionEnabled,
                        newAuctionStartTime,
                        newAuctionInitialEndTime,
                        newAuctionExtendDuration,
                        newAuctionRetentionDuration,
                        newAuctionMinRegistrationDuration
                    )
            ).to.be.reverted;
        });

        it("reverts bid if auction is not enabled", async function () {
            const {preRegiState, auction, tldOwner, addr1} = await loadFixture(
                deployFixture
            );
            await preRegiState.connect(tldOwner).enableAuction(false);
            // auction starts
            await time.increaseTo(preRegiConfig.auctionStartTime + 1);
            await expect(
                auction
                    .connect(addr1)
                    .placeBid("1234", {value: toBigInt("100" + E16STR)})
            ).to.be.revertedWith("not in auction");
        });

        it("should update FCFS configs only by tldOwner", async function () {
            const {preRegiState, tldOwner, addr1} = await loadFixture(
                deployFixture
            );

            const newFcfsEnabled = false;
            const newFcfsStartTime = preRegiConfig.fcfsStartTime + 100;
            const newFcfsEndTime = preRegiConfig.fcfsEndTime + 100;

            // revert the setting from non-tldOwner
            await expect(
                preRegiState
                    .connect(addr1)
                    .setFcfsConfigs(
                        newFcfsEnabled,
                        newFcfsStartTime,
                        newFcfsEndTime
                    )
            ).to.be.reverted;
            await preRegiState
                .connect(tldOwner)
                .setFcfsConfigs(
                    newFcfsEnabled,
                    newFcfsStartTime,
                    newFcfsEndTime
                );
            expect(await preRegiState.fcfsEnabled()).to.be.equal(
                newFcfsEnabled
            );
            expect(await preRegiState.fcfsStartTime()).to.be.equal(
                newFcfsStartTime
            );
            expect(await preRegiState.fcfsEndTime()).to.be.equal(
                newFcfsEndTime
            );
        });

        it("reverts FCFS config updating after fcfs started", async function () {
            const {preRegiState, tldOwner, addr1} = await loadFixture(
                deployFixture
            );

            const newFcfsEnabled = false;
            const newFcfsStartTime = preRegiConfig.fcfsStartTime + 100;
            const newFcfsEndTime = preRegiConfig.fcfsEndTime + 100;

            // FCFS starts
            await time.increaseTo(preRegiConfig.fcfsStartTime + 1);

            await expect(
                preRegiState
                    .connect(tldOwner)
                    .setFcfsConfigs(
                        newFcfsEnabled,
                        newFcfsStartTime,
                        newFcfsEndTime
                    )
            ).to.be.revertedWithCustomError(preRegiState, "FcfsStarted");
        });
    });
});
