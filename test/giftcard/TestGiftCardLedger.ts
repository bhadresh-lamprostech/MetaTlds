import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";

describe("GiftCardLedger Contract", function () {
    const CHAIN_ID = 31337;
    const TLD = "ttt";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    let identifier;
    const TOKEN_ID_1 = 1;
    const TOKEN_ID_2 = 2;
    const VALUE_1 = toBigInt(1e18);
    const VALUE_2 = toBigInt(2 * 1e18);
    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000

    async function deployGiftCardLedgerFixture() {
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

        // GiftCardBase
        const base = await ethers.deployContract("GiftCardBase", [sann]);
        await base.waitForDeployment();

        // GiftCardVoucher
        const voucher = await ethers.deployContract("GiftCardVoucher", [sann]);
        await voucher.waitForDeployment();

        // GiftCardLedger
        const ledger = await ethers.deployContract("GiftCardLedger", [sann]);
        await ledger.waitForDeployment();

        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, VALUE_1);
        await voucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, VALUE_2);

        return {
            owner,
            platformAdmin,
            base,
            sann,
            voucher,
            ledger,
            tldOwner,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should allow platformAdmin to add or remove controller", async function () {
        const {platformAdmin, voucher, ledger, addr1, addr2, addr3} =
            await loadFixture(deployGiftCardLedgerFixture);

        expect(await ledger.controllers(addr1.address)).to.false;

        await expect(
            ledger.connect(addr2).addController(addr1.address)
        ).to.be.revertedWith("Accessible: caller is not the platform admin");

        await ledger.connect(platformAdmin).addController(addr1.address);
        expect(await ledger.controllers(addr1.address)).to.true;

        await expect(
            ledger.connect(platformAdmin).addController(ZERO_ADDR)
        ).to.be.revertedWith("address can not be zero!");

        await ledger.connect(platformAdmin).removeController(addr1.address);
        expect(await ledger.controllers(addr1.address)).to.false;
    });

    it("should redeem and return right balance", async function () {
        const {platformAdmin, base, voucher, ledger, addr1, addr2, addr3} =
            await loadFixture(deployGiftCardLedgerFixture);
        const controller = addr1;
        await ledger.connect(platformAdmin).addController(controller);

        // balance is 0 before redeem
        expect(await ledger.balanceOf(identifier, addr2)).to.equal(0);

        // after redeem
        const amount = toBigInt(5 * 1e18);
        await ledger.connect(controller).redeem(identifier, addr2, amount);
        expect(await ledger.balanceOf(identifier, addr2)).to.equal(amount);
    });

    it("should allow deduct only by controller", async function () {
        const {
            platformAdmin,
            base,
            voucher,
            ledger,
            tldOwner,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deployGiftCardLedgerFixture);
        const controller = addr1;
        await ledger.connect(platformAdmin).addController(controller);

        // redeem
        const amount = toBigInt(5 * 1e18);
        await ledger.connect(controller).redeem(identifier, addr2, amount);
        expect(await ledger.balanceOf(identifier, addr2)).to.equal(amount);

        // controller is not a tldGiftCardController
        await expect(
            ledger.connect(controller).deduct(identifier, addr2, toBigInt(1e18))
        ).to.be.revertedWith("Not a authorized controller");

        // add controller as a tldGiftCardController which is allowed to deduct points
        await ledger
            .connect(tldOwner)
            .addTldGiftCardController(identifier, controller);

        // after deduction
        let deductAmount = toBigInt(1e18);
        await ledger
            .connect(controller)
            .deduct(identifier, addr2, deductAmount);
        // newBalance = balance - deductAmount
        expect(await ledger.balanceOf(identifier, addr2)).to.equal(
            amount - deductAmount
        );
        // Insufficient balance
        await expect(
            ledger.connect(controller).deduct(identifier, addr2, amount)
        ).to.be.revertedWith("Insufficient balance");
    });
});
