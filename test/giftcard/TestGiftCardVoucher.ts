import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";

describe("GiftCardVoucher test", function () {
    const CHAIN_ID = 31337;
    const TLD = "ttt";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    let identifier;
    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000

    async function deployGiftCardVoucherFixture() {
        const [
            owner,
            platformAdmin,
            factory,
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

        // GiftCardVoucher
        const voucher = await ethers.deployContract("GiftCardVoucher", [sann]);
        await voucher.waitForDeployment();

        return {
            sann,
            owner,
            platformAdmin,
            registry,
            voucher,
            tldOwner,
            tldFactory,
            registrar,
            preRegistrationCreator,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should only allow tldOwner to add new customized voucher", async function () {
        const {sann, owner, voucher, tldOwner, addr1, addr2} =
            await loadFixture(deployGiftCardVoucherFixture);

        const setPrice = toBigInt(1e18);
        let tokenId = await voucher.connect(tldOwner).addCustomizedVoucher.staticCall(identifier, setPrice);
        // reverts since caller is not the tldOwner
        await expect(
            voucher
                .connect(addr1)
                .addCustomizedVoucher(identifier, setPrice)
        ).to.be.revertedWith("Ownable: caller is not the tld owner");

        await expect(
            voucher
                .connect(tldOwner)
                .addCustomizedVoucher(identifier, setPrice)
        )
            .to.emit(voucher, "CustomizedVoucherAdded")
            .withArgs(tokenId, setPrice, identifier);
        expect(await voucher.voucherValues(tokenId)).to.equal(setPrice);
        expect(await voucher.voucherTlds(tokenId)).to.equal(identifier);

        // reverts since duplicate tokenId
        await expect(
            voucher
                .connect(tldOwner)
                .addCustomizedVoucher(identifier , setPrice)
        ).to.be.revertedWith("voucher already exsits");
    });

    it("should get right identifier", async function () {
        const {sann, owner, voucher, tldOwner, addr1, addr2} =
            await loadFixture(deployGiftCardVoucherFixture);

        const setPrice = toBigInt(1e18);
        let tokenId = await voucher.connect(tldOwner).addCustomizedVoucher.staticCall(identifier, setPrice);
        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, setPrice);

        expect(await voucher.getTokenIdTld(tokenId)).to.equal(identifier);
    });

    it("should check if a tokenId existes or not", async function () {
        const {sann, owner, voucher, tldOwner, addr1, addr2} =
            await loadFixture(deployGiftCardVoucherFixture);

        const setPrice = toBigInt(1e18);
        let tokenId = await voucher.connect(tldOwner).addCustomizedVoucher.staticCall(identifier, setPrice);
        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, setPrice);

        expect(await voucher.isValidVoucherIds([tokenId])).to.true;
        const tokenId2 = 2;
        expect(await voucher.isValidVoucherIds([tokenId2])).to.false;
    });

    it("should summarize total value of giftcards", async function () {
        const {sann, owner, voucher, tldOwner, addr1, addr2} =
            await loadFixture(deployGiftCardVoucherFixture);

        const setPrice = toBigInt(1e18);
        let tokenId = await voucher.connect(tldOwner).addCustomizedVoucher.staticCall(identifier, setPrice);
        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, setPrice);

        const setPrice2 = toBigInt(2e18);
        let tokenId2 = await voucher.connect(tldOwner).addCustomizedVoucher.staticCall(identifier, setPrice2);

        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, setPrice2);

        expect(
            await voucher.totalValue([tokenId, tokenId2], [1, 2])
        ).to.be.equal(toBigInt(5 * 1e18));
    });

    it("should check if the giftcards belong to same TLD or not", async function () {
        const {
            sann,
            owner,
            voucher,
            tldOwner,
            registry,
            tldFactory,
            registrar,
            platformAdmin,
            preRegistrationCreator,
            addr1,
            addr2,
        } = await loadFixture(deployGiftCardVoucherFixture);

        const setPrice = toBigInt(1e18);
        let tokenId = await voucher.connect(tldOwner).addCustomizedVoucher.staticCall(identifier, setPrice);
        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, setPrice);

        const setPrice2 = toBigInt(2e18);
        let tokenId2 = await voucher.connect(tldOwner).addCustomizedVoucher.staticCall(identifier, setPrice2);

        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, setPrice2);

        // true
        expect(await voucher.isSameTld([tokenId, tokenId2])).to.true;

        // register another TLD
        const tld2 = "aaa";
        const tldOwner2 = addr1;
        const ret = await registerTLD(
            sann,
            registry,
            tldFactory,
            tld2,
            tldOwner2,
            platformAdmin,
            registrar,
            preRegistrationCreator
        );
        const identifier2 = ret.identifier;
        //console.log("identifier: ", identifier);
        //console.log("identifier2: ", identifier2);

        const setPrice3 = toBigInt(1e18);
        let tokenId3 = await voucher.connect(tldOwner2).addCustomizedVoucher.staticCall(identifier2, setPrice3);

        await voucher
            .connect(tldOwner2)
            .addCustomizedVoucher(identifier2, setPrice3);

        // false
        expect(await voucher.isSameTld([tokenId, tokenId3])).to.false;
    });
});
