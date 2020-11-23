const BN = require('bignumber.js');
BN.config({ DECIMAL_PLACES: 0 })
BN.config({ ROUNDING_MODE: BN.ROUND_DOWN })
const NerdToken = artifacts.require('Nerd');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
const NerdVault = artifacts.require('NerdVault');
const WETH9 = artifacts.require('WETH9');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const FeeApprover = artifacts.require('FeeApprover');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');
const FarmETHRouter = artifacts.require('FarmETHRouter');
const e18 = new BN('1000000000000000000');
const lgeApprover = require('./lgeapprover');
const SampleERC20 = artifacts.require('SampleERC20');
const testconfig = require('./testconfig');

function toWei(n) {
    return new BN(n).multipliedBy(e18).toFixed();
}

const totalSupply = toWei('21000');
const initialMinted = new BN(totalSupply).multipliedBy(91).dividedBy(100).toString();
const DEV_FEE = 724;

async function addNewLP(his, alice, clean4, minter, minter2) {
    his.sampleERC = await SampleERC20.new(clean4, { from: clean4 });
    await his.factory.createPair(
        his.sampleERC.address,
        his.nerd.address
    );
    his.newLP = await UniswapV2Pair.at(await his.factory.getPair(his.sampleERC.address, his.nerd.address));

    //add liquidity
    //send NERd from minter to clean4
    await his.nerd.transfer(clean4, toWei(10), { from: minter });
    //approve
    await his.nerd.approve(his.router.address, new BN('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), { from: clean4 });
    await his.sampleERC.approve(his.router.address, new BN('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), { from: clean4 });
    let clean4SampleBalance = (await his.sampleERC.balanceOf(clean4)).valueOf().toString();
    let clean4NerdBalance = (await his.nerd.balanceOf(clean4)).valueOf().toString();
    await his.router.addLiquidity(his.sampleERC.address, his.nerd.address, new BN(clean4SampleBalance).dividedBy(2).toFixed(0), clean4NerdBalance, 0, 0, clean4, 15999743005, { from: clean4 });
    let clean4NewLPBalance = (await his.newLP.balanceOf(clean4)).valueOf().toString();
    //withdraw pending rewards
    await his.nerdvault.withdrawNerd(0, { from: minter });
    await his.nerdvault.withdrawNerd(0, { from: minter2 });

    assert.equal((await his.nerdvault.pendingRewards()).valueOf().toString(), "0")
    //add pools
    await his.nerdvault.add('1000', his.newLP.address, true, { from: alice });
    await his.newLP.approve(his.nerdvault.address, clean4NewLPBalance, { from: clean4 });

    //await this.nerdvault.deposit(1, new BN(clean4NewLPBalance).dividedBy(2).toFixed(0), { from: clean4 });
    await his.nerdvault.deposit(1, "10010", { from: clean4 });
}

contract('More', ([alice, john, minter, dev, burner, clean, clean2, clean3, clean4, clean5, clean6, minter2]) => {
    before(async () => {
        this.lgeApprover = lgeApprover.lgeApprover;
    })

    beforeEach(async () => {
        if (testconfig.network != "local") {
            await testconfig.readUniswap(this);
        } else {
            this.factory = await UniswapV2Factory.new(alice, { from: alice });
            this.weth = await WETH9.new({ from: john });
            this.router = await UniswapV2Router02.new(this.factory.address, this.weth.address, { from: alice });
        }
        await this.weth.deposit({ from: alice, value: toWei('1000') })
        this.nerd = await NerdToken.new(this.router.address, this.factory.address, dev, 0, this.lgeApprover, { from: alice });
        this.nerdWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.nerd.address));
        assert.equal(await this.nerd.tokenUniswapPair(), this.nerdWETHPair.address);

        let addedLiquidity = toWei('500');
        let approverSig = lgeApprover.signApprover(minter);
        await this.nerd.addLiquidity(true, approverSig.r, approverSig.s, approverSig.v, { from: minter, value: addedLiquidity });
        let liq2 = toWei('300');
        addedLiquidity = new BN(addedLiquidity).plus(liq2).toFixed();
        let approverSig2 = lgeApprover.signApprover(minter2);
        await this.nerd.addLiquidity(true, approverSig2.r, approverSig2.s, approverSig2.v, { from: minter2, value: liq2 });

        await time.increase(60 * 60 * 24 * 7 + 1);
        await this.nerd.addLiquidityToUniswapNERDxWETHPair();

        assert.equal((await this.weth.balanceOf(this.nerdWETHPair.address)).valueOf().toString(), addedLiquidity);
        assert.equal((new BN(await this.nerd.balanceOf(this.nerdWETHPair.address)).valueOf().toString()).toString(), initialMinted);

        this.feeapprover = await FeeApprover.new({ from: alice });
        await this.feeapprover.initialize(this.nerd.address);

        await this.feeapprover.setPaused(false, { from: alice });
        await this.nerd.setShouldTransferChecker(this.feeapprover.address, { from: alice });

        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.nerd.address], minter, 15999743005, { from: minter, value: toWei('5') });

        assert.equal(await this.factory.getPair(this.nerd.address, this.weth.address), this.nerdWETHPair.address);
        await expectRevert.unspecified(this.factory.createPair(this.weth.address, this.nerd.address));

        this.nerdvault = await NerdVault.new({ from: alice });
        await this.nerdvault.initialize(this.nerd.address, dev, { from: alice });
        await this.feeapprover.setNerdVaultAddress(this.nerdvault.address, { from: alice });
        await this.weth.transfer(minter, toWei('10'), { from: alice });
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
    });

    it('calculates fees correctly', async () => {
        await this.nerd.transfer(burner, (await this.nerd.balanceOf(john)).valueOf().toString(), { from: john });
        await this.feeapprover.setFeeMultiplier(10, { from: alice })

        const balanceOfMinter = (await this.nerd.balanceOf(minter)).valueOf();
        await this.nerd.transfer(john, '1000', { from: minter });

        assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), "10");
        assert.equal((await this.nerd.balanceOf(john)).valueOf().toString(), "990");
        assert.equal((await this.nerd.balanceOf(minter)).valueOf().toString(), new BN(balanceOfMinter).minus(1000).toFixed(0));

        await this.feeapprover.setFeeMultiplier('20', { from: alice });
        assert.equal(await this.feeapprover.feePercentX100(), '20');
        await this.nerd.transfer(john, '1000', { from: minter });

        assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), "30");
        assert.equal((await this.nerd.balanceOf(john)).valueOf().toString(), `${990 + 980}`);
        assert.equal((await this.nerd.balanceOf(minter)).valueOf().toString(), new BN(balanceOfMinter).minus(2000).toFixed(0));

        await this.nerd.transfer(john, '1', { from: minter });
        await this.nerd.transfer(john, '2', { from: minter });
        assert.equal((await this.nerd.balanceOf(john)).valueOf().toString(), `${990 + 980 + 3}`);
        assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), "30");
        assert.equal((await this.nerd.balanceOf(minter)).valueOf().toString(), new BN(balanceOfMinter).minus(2003).toFixed(0));

        await this.nerd.transfer(minter, '1000', { from: john });

        assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), "50");
    });

    it('should be able to deposit in nerdvault (includes depositing 0)', async () => {
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.nerd.address], clean, 15999743005, { from: minter, value: toWei('5') });
        await this.weth.deposit({ from: clean, value: toWei('1000') });
        await this.weth.transfer(this.nerdWETHPair.address, '100000000', { from: clean });
        await this.nerd.transfer(this.nerdWETHPair.address, '100000000', { from: clean });
        await this.nerdWETHPair.mint(clean);
        await this.nerdWETHPair.transfer(this.nerdWETHPair.address, "2000000", { from: clean });

        // aprove spend of everything
        await this.nerdWETHPair.approve(this.nerdvault.address, '10000000000000', { from: clean });

        const LPTokenBalanceOfMinter = await this.nerdWETHPair.balanceOf(clean)
        assert.notEqual(LPTokenBalanceOfMinter, "0");

        await this.nerdvault.claimLPToken();

        let lpBefore = (await this.nerdWETHPair.balanceOf(this.nerdvault.address)).valueOf().toString();
        await this.nerdvault.deposit(0, "100", { from: clean });
        let lpAfter = (await this.nerdWETHPair.balanceOf(this.nerdvault.address)).valueOf().toString();
        assert.equal(new BN(lpAfter).minus(new BN(lpBefore)).toFixed(0), "100");
        await this.nerdvault.deposit(0, "0", { from: clean });
        lpAfter = (await this.nerdWETHPair.balanceOf(this.nerdvault.address)).valueOf().toString();
        assert.equal(new BN(lpAfter).minus(new BN(lpBefore)).toFixed(0), "100");
    });

    it("Multiple pools work", async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        await this.feeapprover.setFeeMultiplier(10, { from: alice })

        await addNewLP(this, alice, clean4, minter, minter2);

        await this.nerdvault.setDevFee('1000', { from: alice }); //10%
        await this.nerd.transfer(burner, '1000000000', { from: minter });

        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10000000")

        await this.nerdvault.deposit(1, "0", { from: clean4 });

        await this.nerdvault.deposit(0, "0", { from: minter });
        await this.nerdvault.deposit(0, "0", { from: minter2 });

        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "2250000");

        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")

        await this.nerd.transfer(burner, '1000000000', { from: minter });
        await this.nerdvault.deposit(1, "0", { from: clean4 });

        await this.nerdvault.deposit(0, "0", { from: minter });
        await this.nerdvault.deposit(0, "0", { from: minter2 });

        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")

        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "4500000");


        await this.nerd.transfer(burner, '1000000000', { from: minter });
        await this.nerdvault.deposit(0, "0", { from: clean4 });
        await this.nerdvault.deposit(1, "0", { from: clean4 });
        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "6750000");
        await this.nerd.transfer(burner, '1000000000', { from: minter });
        await this.nerd.transfer(burner, '1000000000', { from: minter });
        await this.nerdvault.deposit(0, "0", { from: clean4 });
        await this.nerdvault.deposit(1, "0", { from: clean4 });
        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "11250000");
        await this.nerdvault.deposit(1, "0", { from: clean4 });


        await this.nerdvault.deposit(0, "0", { from: minter });
        await this.nerdvault.deposit(0, "0", { from: minter2 });
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")

        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "11250000");

        //test withdraw newLP
        let remainingNewLP = (await this.nerdvault.getRemainingLP(1, clean4)).valueOf().toString();
        let depositTimeNewLP = (await this.nerdvault.getDepositTime(1, clean4)).valueOf().toString();
        assert.equal("0", (await this.nerdvault.computeReleasableLP(1, clean4)).valueOf().toString());
        //increase 28 days
        let withdrawableTime = new BN(depositTimeNewLP).plus(new BN(60 * 60 * 24 * 28)).toFixed(0);
        let currentTime = await time.latest();
        let diff = new BN(withdrawableTime).minus(new BN(currentTime)).plus(1).toNumber();
        await time.increase(diff);
        assert.notEqual("0", (await this.nerdvault.computeReleasableLP(1, clean4)).valueOf().toString());
        //increase 10 weeks
        await time.increase(60 * 60 * 24 * 7 * 10);
        assert.equal(remainingNewLP, (await this.nerdvault.computeReleasableLP(1, clean4)).valueOf().toString());
        assert.equal(remainingNewLP, (await this.nerdvault.computeReleasableLPWithPenalty(1, clean4)).valueOf().userAmount.toString());
    });

    it("NerdVault should give rewards to LP stakers proportionally", async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        await this.feeapprover.setFeeMultiplier(10, { from: alice })
        await addNewLP(this, alice, clean4, minter, minter2);

        await this.nerd.transfer(burner, '1000', { from: minter })
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10")
        //assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), "10")

        await time.advanceBlock();
        await this.nerdvault.massUpdatePools();

        await time.advanceBlock();
        await time.advanceBlock();
        await time.advanceBlock();
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "2");
        await this.nerdvault.withdrawNerd(0, { from: clean4 });

        await this.nerdvault.withdrawNerd(0, { from: clean });

        await this.newLP.transfer(clean, '10000', { from: clean4 });
        await this.newLP.approve(this.nerdvault.address, '10000000000000', { from: clean });
        assert.equal((await this.newLP.balanceOf(clean)).valueOf().toString(), '10000');

        await this.nerdvault.deposit(1, '10000', { from: clean });
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")
        assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), "0");
        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        //assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), '0');

        assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '0');

        await time.advanceBlock();

        await time.advanceBlock();

        await time.advanceBlock();
        await this.nerdvault.withdrawNerd(1, { from: clean });
        assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '0');
        await this.nerd.transfer(burner, '1000', { from: minter })
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10")
        await time.advanceBlock();
        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });

        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "3");
        assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '1');

        await this.nerd.transfer(burner, '100000', { from: minter })
        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });

        assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "119");
        assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '117');

        await this.nerd.transfer(burner, '1000000', { from: minter })
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10000")

        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });
        //assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "2559");
        //assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '2554');

        // Checking if clean has balances even tho clean2 claimed twice
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")
        //assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), "0")

        await this.nerd.transfer(burner, '1000000', { from: minter })
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10000")

        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });

        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")

        //assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "4879");
        //assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '4874');

        await this.nerd.transfer(burner, '1000000', { from: minter })
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10000")

        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });

        //assert.equal((await this.nerd.balanceOf(clean2)).valueOf().toString(), "7199");
        //assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '7194');
        await time.advanceBlock();
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")

        await time.advanceBlock();
        await time.advanceBlock();
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")

        await time.advanceBlock();
        await time.advanceBlock();
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")
        await this.nerdvault.deposit(0, '0', { from: clean4 });
        await this.nerdvault.deposit(0, '0', { from: clean });
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")
        //assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "7199");
        //assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '7194');
        await this.nerdvault.deposit(0, '0', { from: clean });
        await this.nerdvault.deposit(0, '0', { from: clean4 });
        //assert.equal((await this.nerd.balanceOf(clean4)).valueOf().toString(), "7199");
        //assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '7194');

        await expectRevert(this.nerdvault.withdraw(1, '1000', { from: clean }), "withdraw: not good");
        await expectRevert(this.nerdvault.quitPool(1, { from: clean }), "cannot withdraw all lp tokens before");

        //before quit
        let refBeforeQuit = (await this.newLP.balanceOf(clean)).valueOf().toString();
        let cleanReAmount = (await this.nerdvault.getRemainingLP(1, clean)).valueOf().toString();
        await time.increase(60 * 60 * 24 * 7 * 14);    //withdrawnablle
        await this.nerdvault.quitPool(1, { from: clean });
        let refAfterQuit = (await this.newLP.balanceOf(clean)).valueOf().toString();
        let cleanReAmountAfter = (await this.nerdvault.getRemainingLP(1, clean)).valueOf().toString();
        assert.equal(cleanReAmountAfter, '0');
        assert.equal(cleanReAmount, new BN(refAfterQuit).minus(new BN(refBeforeQuit)).toFixed(0));

        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")
        await this.nerd.transfer(burner, '1000000', { from: minter })
        //reward halving
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "5000")
        await expectRevert(this.nerdvault.withdraw(0, '1000', { from: clean }), 'withdraw: not good');

        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });
        //assert.equal((await this.nerd.balanceOf(clean2)).valueOf().toString(), "11901");
        //assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '26150');

        await this.nerd.transfer(burner, '1000000', { from: minter })
        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });

        await expectRevert(this.nerdvault.emergencyWithdraw(1, { from: clean4 }), "Withdrawing from this pool is disabled");
        await this.nerdvault.setEmergencyWithdrawable(1, true, { from: alice });
        await this.nerdvault.emergencyWithdraw(1, { from: clean4 });

        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });
        //assert.equal((await this.nerd.balanceOf(clean2)).valueOf().toString(), "21177");
        //assert.equal((await this.nerd.balanceOf(clean)).valueOf().toString(), '26150');

        // This is expected to rouding error
        //assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), '1');
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")
        await this.nerd.transfer(burner, '1000000', { from: minter })
        await this.nerd.transfer(burner, '1000000', { from: minter })
        await this.nerd.transfer(burner, '1000000', { from: minter })
        let vaultBalBefore = (await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString();
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: clean4 });
        await this.nerdvault.massUpdatePools({ from: clean4 });
        let vaultBalAfter = (await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString();
        //assert.equal(vaultBalBefore, vaultBalAfter);
        await this.nerdvault.withdrawNerd(1, { from: clean });
        await this.nerdvault.withdrawNerd(1, { from: clean4 });
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });

        await this.feeapprover.setFeeMultiplier('20', { from: alice });
        await this.nerd.transfer(burner, '1000000', { from: minter });
        //assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10000");
    })
    it('Pools can be disabled withdrawals', async () => {
        await expectRevert(this.nerdvault.withdraw(0, '100', { from: minter }), 'withdraw: not good');
        await expectRevert(this.nerdvault.emergencyWithdraw(0, { from: minter }), 'Withdrawing from this pool is disabled');
    });

    it('Pools can be disabled and then enabled withdrawals', async () => {
        await expectRevert(this.nerdvault.withdraw(0, '100', { from: minter }), 'withdraw: not good');
        await expectRevert(this.nerdvault.emergencyWithdraw(0, { from: minter }), 'Withdrawing from this pool is disabled');
        await this.nerdvault.setEmergencyWithdrawable(0, true, { from: alice });
        await expectRevert(this.nerdvault.withdraw(0, '10', { from: minter }), 'withdraw: not good');
        let lpBefore = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        let remainingLP = (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString();
        await this.nerdvault.emergencyWithdraw(0, { from: minter });
        let lpAfter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        assert.equal(remainingLP, new BN(lpAfter).minus(new BN(lpBefore)).toFixed(0));
    });

    it('Doesnt let other people than owner set withdrawable of pool', async () => {
        await this.nerdvault.setEmergencyWithdrawable(0, false, { from: alice });
        await expectRevert(this.nerdvault.setEmergencyWithdrawable(0, false, { from: minter }), "Ownable: caller is not the owner");
        await expectRevert(this.nerdvault.setEmergencyWithdrawable(0, false, { from: john }), "Ownable: caller is not the owner");
    });

    it("Gives dev fees correctly", async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        let balanceOfDev = (await this.nerd.balanceOf(dev)).valueOf().toNumber()
        let nerdBalanceOfClean2 = (await this.nerd.balanceOf(clean2)).valueOf().toNumber()
        await this.feeapprover.setFeeMultiplier(10, { from: alice })

        await this.nerd.transfer(burner, '1000000', { from: minter })
        ///10000 expected farming fee
        assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), '10000');

        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "10000");
        assert.equal((await this.nerd.balanceOf(dev)).valueOf().toString(), balanceOfDev);
        await this.nerdvault.claimLPTokensToFarmingPool(minter, { from: minter });
        let pendingNerdMinter = (await this.nerdvault.pendingNerd(0, minter)).valueOf().toString();
        let pendingNerdMinter2 = (await this.nerdvault.pendingNerd(0, minter2)).valueOf().toString();
        let expectedDevFee = new BN('10000').minus(new BN(pendingNerdMinter)).minus(new BN(pendingNerdMinter2)).toFixed(0);
        await this.nerdvault.withdrawNerd(0, { from: minter });

        await this.nerdvault.withdrawNerd(0, { from: minter2 });
        let expectedNerdAfter = new BN(expectedDevFee).plus(new BN(balanceOfDev)).toFixed(0);
        let nerdAfter = (await this.nerd.balanceOf(dev)).valueOf().toString();
        let sub = new BN(expectedNerdAfter).comparedTo(new BN(nerdAfter)).toFixed(0);
        assert.equal(new BN(expectedNerdAfter).comparedTo(new BN(nerdAfter)) >= 0, true);
        assert.equal(true, sub == '0' || sub == '1');
    });

    it('should Mint LP tokens sucessfully successfully', async () => {
        let bal = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        await this.weth.transfer(this.nerdWETHPair.address, '10000000', { from: minter });
        await this.nerd.transfer(this.nerdWETHPair.address, '10000000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        assert.notEqual((await this.nerdWETHPair.balanceOf(minter)).valueOf().toString(), bal);
    });

    it('Should give correct numbers on view pending', async () => {
        await this.feeapprover.setFeeMultiplier(10, { from: alice })
        await this.nerd.transfer(burner, '100000000', { from: minter })
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "1000000")
        assert.equal((await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString(), "1000000")

        await time.advanceBlock();
        const balance = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.massUpdatePools();
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), "0")
        let pending = (await this.nerdvault.pendingNerd(0, minter)).valueOf().toString();
        assert.notEqual(pending, "0")
        let paid = new BN(pending).multipliedBy(50).dividedBy(100).toFixed(0);
        await this.nerdvault.deposit(0, "0", { from: minter });
        assert.equal((await this.nerd.balanceOf(minter)).valueOf().toString(), new BN(balance).plus(new BN(paid)).toFixed(0));
    });

    it('Should not let people withdraw for someone without approval and updates allowances correctly', async () => {
        await this.feeapprover.setFeeMultiplier(10, { from: alice })
        await this.nerd.transfer(burner, '1000000', { from: minter })

        // function withdrawFrom(address owner, uint256 _pid, uint256 _amount) public{

        await expectRevert(this.nerdvault.withdrawFrom(clean2, 0, '1000000', { from: minter }), "withdraw: insufficient allowance");
        await expectRevert(this.nerdvault.withdrawFrom(clean2, 0, '1000000', { from: alice }), "withdraw: insufficient allowance");
        await expectRevert(this.nerdvault.withdrawFrom(clean2, 0, '1000000', { from: clean3 }), "withdraw: insufficient allowance");
        await expectRevert(this.nerdvault.withdrawFrom(clean2, 0, '1000000', { from: clean }), "withdraw: insufficient allowance");
        await expectRevert(this.nerdvault.withdrawFrom(clean2, 0, '1000000', { from: clean2 }), "withdraw: insufficient allowance");

        await this.nerdvault.setAllowanceForPoolToken(clean6, 0, '1000000', { from: minter });
        await expectRevert(this.nerdvault.withdrawFrom(minter, 0, '1000000', { from: clean6 }), "withdraw: not good");

        await time.increase(60 * 60 * 24 * 28);
        await this.nerdvault.setAllowanceForPoolToken(clean6, 0, '1000000', { from: minter });
        await this.nerdvault.withdrawFrom(minter, 0, '1000000', { from: clean6 });

        await expectRevert(this.nerdvault.withdrawFrom(minter, 0, '1000000', { from: clean6 }), "withdraw: insufficient allowance")
        await this.nerdvault.setAllowanceForPoolToken(clean6, 0, '1000000', { from: minter });

        assert.equal((await this.nerdWETHPair.balanceOf(clean6)).valueOf().toString(), '1000000');

    });

    it('Should have correct balances for deposit for', async () => {
        await this.feeapprover.setFeeMultiplier(10, { from: alice })
        await this.weth.transfer(this.nerdWETHPair.address, '10000000', { from: minter });
        await this.nerd.transfer(this.nerdWETHPair.address, '10000000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        let bal = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        let actualDeposit = new BN(bal).minus(new BN(bal).multipliedBy(1).dividedBy(1000)).toFixed(0);
        await this.nerdWETHPair.approve(this.nerdvault.address, bal, { from: minter });
        await this.nerdvault.depositFor(clean6, 0, bal, { from: minter });
        await this.nerd.transfer(burner, '1000000000', { from: minter });
        await time.increase(60 * 60 * 24 * 7 * 14);
        await this.nerdvault.withdraw(0, actualDeposit, { from: clean6 })
        assert.notEqual(await this.nerd.balanceOf(clean6).valueOf().toString(), '0');// got fes
        await expectRevert(this.nerdvault.withdraw(0, '100', { from: clean6 }), 'withdraw: not good')

    });

    it("Should allow to swap tokens", async () => {

        console.log(`\n`)
        console.log('++adding liqiudity manually start +++')
        await this.nerd.transfer(this.nerdWETHPair.address, '10000000000', { from: minter });
        await this.weth.transfer(this.nerdWETHPair.address, '100000000000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        console.log('++adding liqiudity end +++')

        await this.nerd.transfer(clean5, '2000000000000', { from: minter });

        await this.weth.transfer(clean5, '100000', { from: minter });
        await this.weth.approve(this.router.address, '11000000000', { from: clean5 });
        await this.weth.approve(this.nerdWETHPair.address, '11000000000', { from: clean5 });
        await this.nerd.approve(this.router.address, '11000000000', { from: clean5 });
        await this.nerd.approve(this.nerdWETHPair.address, '11000000000', { from: clean5 });
        await this.weth.approve(this.router.address, '11000000000', { from: minter });
        await this.weth.approve(this.nerdWETHPair.address, '11000000000', { from: minter });
        await this.nerd.approve(this.router.address, '11000000000', { from: minter });
        await this.nerd.approve(this.nerdWETHPair.address, '11000000000', { from: minter });

        assert.equal(await this.router.WETH(), this.weth.address);

        await this.nerdWETHPair.approve(this.router.address, '110000000000000', { from: minter });

        console.log(`\n`)
        console.log("--start remove liquidity ETH---");
        await this.router.removeLiquidityETH(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity ETH---");

        console.log(`\n`)
        console.log("--start remove liquidity normal---");
        await this.router.removeLiquidity(this.nerd.address, this.weth.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity normal---");

        console.log(`\n`)
        console.log("--start remove liquidity with support for fee transfer---");
        await this.router.removeLiquidityETHSupportingFeeOnTransferTokens(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity with support for fee transfer---");

        console.log(`\n`)
        console.log("--start token SELL");
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('1100000', '1000', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log("--end token SELL");

        console.log(`\n`)
        console.log("++start buy swap for WETH+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '343242423' });
        console.log("+++end buy swap fro WETH");

        console.log(`\n`)
        console.log('++adding liqiudity manually start +++')
        await this.weth.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerd.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        console.log('++adding liqiudity end +++')

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.")
        console.log('--end calling burn--')

        console.log(`\n`)
        console.log("--start token SELL");
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('1100000', '1000', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log("--end token SELL");

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.")
        console.log('--end calling burn--')


        console.log(`\n`)
        console.log("++start buy swap for WETH+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '343242423' });
        console.log("+++end buy swap for WETH++")

        console.log(`\n`)
        console.log('++adding liqiudity manually start +++')
        await this.weth.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerd.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        console.log('++adding liqiudity end +++')


        await this.nerd.approve(this.nerdWETHPair.address, '100000000000000000', { from: alice });
        await this.nerd.approve(this.router.address, '100000000000000000', { from: alice });


        console.log(`\n`)
        console.log("--start remove liquidity with support for fee transfer---");
        await this.router.removeLiquidityETHSupportingFeeOnTransferTokens(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity with support for fee transfer---");



        console.log(`\n`)
        console.log('++adding liqiudity via ETH start +++')
        console.log('---------------- minter balance:', (await web3.eth.getBalance(minter)).valueOf().toString())
        await this.router.addLiquidityETH(this.nerd.address, '100000000', '0', '0', alice, 15999743005, { from: minter, value: 4543534 });
        console.log('++adding liqiudity end +++')

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.")
        console.log('--end calling burn--')

        console.log(`\n`)
        console.log("--start remove liquidity normal---");
        await expectRevert(this.router.removeLiquidity(this.nerd.address, this.weth.address, '1', '1', '1', minter, 15999743005, { from: minter }), 'UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.')
        console.log("--end remove liquidity normal---");

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.")
        console.log('--end calling burn--')

        console.log(`\n`)
        console.log('--start token SELL ---')
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('1100000', '1000', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log('--end token SELL--')


        console.log(`\n`)
        console.log('++adding liqiudity via ETH start +++')
        await this.router.addLiquidityETH(this.nerd.address, '9000000000000', '0', '0', alice, 15999743005, { from: minter, value: 4543534 });
        console.log('++adding liqiudity end +++')
        console.log(`\n`)
        console.log("--start remove liquidity normal---");
        await expectRevert(this.router.removeLiquidity(this.nerd.address, this.weth.address, '1', '1', '1', minter, 15999743005, { from: minter }), 'UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.')
        console.log("--end remove liquidity normal---");

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.");
        console.log('--end calling burn--')


        console.log(`\n`)
        console.log('+++start buy via ETH and then WETH+++')
        //buy via eth
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('0', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '34324233' });
        //buy via weth
        await this.router.swapExactTokensForTokensSupportingFeeOnTransferTokens('10000', '0', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: clean5 });
        console.log('+++end buy via ETH and WETH+++')

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.")
        console.log('--end calling burn--')

        console.log(`\n`)
        console.log('++adding liqiudity manually start +++')
        await this.weth.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerd.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        console.log('++adding liqiudity end +++')

        console.log(`\n`)
        console.log('++adding liqiudity via ETH  start +++')
        await this.router.addLiquidityETH(this.nerd.address, '90000', '1', '1', alice, 15999743005, { from: minter, value: 4543534 });
        console.log('+++adding liqiudity end +++')

        console.log(`\n`)
        console.log("--start remove liquidity ETH---");
        await this.router.removeLiquidityETH(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity ETH---");

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.")
        console.log('--end calling burn--')


        console.log(`\n`)
        console.log('--start token SELL ---')
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('1100000', '1000', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log('--end token SELL--')
        console.log(`\n`)
        console.log("++start buy swap for WETH+++");
        await this.router.swapExactTokensForTokensSupportingFeeOnTransferTokens('10000', '0', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: clean5 });
        console.log("++end buy swap for WETH+++");

        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.");
        console.log('--end calling burn--')


        assert.notEqual((await this.weth.balanceOf(clean5)).valueOf().toString(), '0')


        console.log(`\n`)
        console.log("--start remove liquidity with support for fee transfer---");
        await this.router.removeLiquidityETHSupportingFeeOnTransferTokens(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity with support for fee transfer---");


        console.log(`\n`)
        console.log('--sell start---')
        await this.router.swapExactTokensForTokensSupportingFeeOnTransferTokens('1000', '0', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log('--sell end---')


        console.log(`\n`)
        console.log("--start remove liquidity ETH---");
        await this.router.removeLiquidityETH(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity ETH---");


        console.log(`\n`)
        console.log('+++adding liqiudity via ETH  start +++')
        await this.router.addLiquidityETH(this.nerd.address, '90000', '1', '1', alice, 15999743005, { from: minter, value: 4543534 });
        console.log('+++adding liqiudity end +++');



        console.log(`\n`)
        console.log('++adding liqiudity manually start +++')
        await this.weth.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerd.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        console.log('+++adding liqiudity end +++')
        console.log(`\n`)
        console.log('--start token SELL ---')
        console.log("selling from ", clean5)
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('110', '1', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log('--end token sell')
        console.log(`\n`)
        console.log("++start buy swap for WETH+++");
        await this.router.swapExactTokensForTokensSupportingFeeOnTransferTokens('10000', '0', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: clean5 });
        console.log("++end buy swap for WETH+++");

        console.log(`\n`)
        console.log("++start buy swap for WETH+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '34324233' });
        console.log("++end buy swap for WETH+++");

        console.log(`\n`)
        console.log('++adding liqiudity via ETH  start +++')
        await this.router.addLiquidityETH(this.nerd.address, '90000', '1', '1', alice, 15999743005, { from: minter, value: 4543534 });
        console.log('+++adding liqiudity end +++')
        console.log(`\n`)
        console.log('--start token SELL ---')
        console.log("selling from ", clean5)
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('110', '1', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log('--end token sell')
        console.log(`\n`)
        console.log("++start buy swap for WETH+++");
        await this.router.swapExactTokensForTokensSupportingFeeOnTransferTokens('10000', '0', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: clean5 });
        console.log("++end buy swap for WETH+++");

        console.log(`\n`)
        console.log("--start remove liquidity ETH---");
        await this.router.removeLiquidityETH(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity ETH---");

        console.log(`\n`)
        console.log('+++adding liqiudity manually start +++')
        await this.weth.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerd.transfer(this.nerdWETHPair.address, '100000', { from: minter });
        await this.nerdWETHPair.mint(minter);
        console.log('+++adding liqiudity end +++')


        console.log(`\n`)
        console.log('--calling burn ---')
        await expectRevert(this.nerdWETHPair.burn(minter, { from: minter }), "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED.")
        console.log('--end calling burn--')

        console.log(`\n`)
        console.log('+++ adding liqiudity via ETH  start +++')
        await this.router.addLiquidityETH(this.nerd.address, '109000000', '10000000999000', '0', alice, 15999743005, { from: minter, value: 10000000000000000000 });
        console.log('+++adding liqiudity end +++')
        console.log(`\n`)
        console.log("--start remove liquidity with support for fee transfer---");
        // await expectRevert(this.router.removeLiquidityETHSupportingFeeOnTransferTokens(this.nerd.address, '1', '1', '1', minter, 15999743005, { from: minter }), 'UniswapV2: TRANSFER_FAILED')
        console.log("--end remove liquidity with support for fee transfer---");

        console.log("++start buy swap for ETHr+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '34324233' });
        console.log("+++end buy swap for ETH+++");
        console.log("++start buy swap for ETHr+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '34324233' });
        console.log("+++end buy swap for ETH+++");

        console.log(`\n`)
        console.log('--start token SELL ---')
        console.log("selling from ", clean5)
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('110', '1', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log('--end token sell')
        console.log(`\n`)
        console.log('--start token SELL ---')
        console.log("selling from ", clean5)
        console.log("selling from ", (await this.nerd.balanceOf(clean5)).valueOf().toString())
        await this.nerd.approve(this.nerdWETHPair.address, '999999999999', { from: clean5 })
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens('100000000', '100000', [this.nerd.address, await this.router.WETH()], clean5, 15999743005, { from: clean5 });
        console.log('--end token sell')



        console.log(`\n`)
        console.log("--start remove liquidity with support for fee transfer---");
        await this.router.removeLiquidityETHSupportingFeeOnTransferTokens(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity with support for fee transfer---");

        console.log(`\n`)
        console.log("++start buy swap for ETHr+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '34324233' });
        console.log("+++end buy swap for ETH+++");
        console.log(`\n`)
        console.log("++start buy swap for ETHr+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '34324233' });
        console.log("+++end buy swap for ETH+++");
        console.log(`\n`)
        console.log("++start buy swap for ETHr+++");
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1000', [await this.router.WETH(), this.nerd.address], clean5, 15999743005, { from: alice, value: '34324233' });
        console.log("+++end buy swap for ETH+++");

        console.log(`\n`)
        console.log("--start remove liquidity with support for fee transfer---");
        await this.router.removeLiquidityETHSupportingFeeOnTransferTokens(this.nerd.address, '200', '1', '1', minter, 15999743005, { from: minter });
        console.log("--end remove liquidity with support for fee transfer---");
        console.log(`\n`)
        console.log("--start remove liquidity with support for fee transfer---");
        await this.router.removeLiquidityETHSupportingFeeOnTransferTokens(this.nerd.address, '100', '1', '1', dev, 15999743005, { from: minter });
        console.log("--end remove liquidity with support for fee transfer---");


    });

    it("Buy LP with ETH using router", async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        await this.feeapprover.setFeeMultiplier(10, { from: alice })

        this.farmETHRouter = await FarmETHRouter.new({ from: alice });
        await this.farmETHRouter.initialize(this.nerd.address);
        await this.farmETHRouter.addLiquidityETHOnly(clean5, true, { from: clean5, value: '100000000000000000' });

        await addNewLP(this, alice, clean4, minter, minter2);

        //add liquidity for pair sampleERC/ETH
        await this.factory.createPair(
            this.sampleERC.address,
            this.weth.address
        );
        this.sampleERCWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.sampleERC.address, this.weth.address));

        //add liquidity
        //send NERd from minter to clean4
        await this.weth.deposit({ from: clean4, value: toWei('10') })
        //approve
        await this.weth.approve(this.router.address, new BN('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), { from: clean4 });
        await this.sampleERC.approve(this.router.address, new BN('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), { from: clean4 });
        let clean4SampleBalance = (await this.sampleERC.balanceOf(clean4)).valueOf().toString();
        let clean4WethBalance = (await this.weth.balanceOf(clean4)).valueOf().toString();
        console.log('clean4WethBalance:', clean4WethBalance)
        console.log('clean4SampleBalance:', clean4SampleBalance)
        await this.router.addLiquidity(this.sampleERC.address, this.weth.address, new BN(clean4SampleBalance).dividedBy(2).toFixed(0), new BN(clean4WethBalance).dividedBy(2).toFixed(0), 0, 0, clean4, 15999743005, { from: clean4 });
        let lpBefore = (await this.nerdvault.getRemainingLP(1, clean4)).valueOf().toString();
        await this.farmETHRouter.addLiquidityETHOnlyForPool(1, clean4, true, { from: clean4, value: toWei('1') });
        assert.notEqual(lpBefore, (await this.nerdvault.getRemainingLP(1, clean4)).valueOf().toString());
    });

    it("Withdraw lock rewards", async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        await this.feeapprover.setFeeMultiplier(10, { from: alice });
        await this.nerd.transfer(burner, '1000000000', { from: minter });
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), '10000000');
        let pendingNerdMinter = (await this.nerdvault.pendingNerd(0, minter)).valueOf().toString();
        let receivedReward = new BN(pendingNerdMinter).multipliedBy(50).dividedBy(100).toFixed(0);
        let expectedLockedReward = new BN(pendingNerdMinter).minus(new BN(receivedReward)).toFixed(0);
        let balBefore = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter });
        let balAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();
        assert.equal(receivedReward, new BN(balAfter).minus(new BN(balBefore)).toFixed(0));
        let lockedReward = (await this.nerdvault.userInfo(0, minter)).valueOf().rewardLocked.toString();
        assert.equal(expectedLockedReward, lockedReward);

        await this.nerdvault.withdrawNerd(0, { from: minter });
        balAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();
        lockedReward = (await this.nerdvault.userInfo(0, minter)).valueOf().rewardLocked.toString();
        assert.equal(expectedLockedReward, lockedReward);

        await this.nerd.transfer(burner, '1000000000', { from: minter });

        balBefore = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter });
        balAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();
        assert.equal(receivedReward, new BN(balAfter).minus(new BN(balBefore)).toFixed(0));

        lockedReward = (await this.nerdvault.userInfo(0, minter)).valueOf().rewardLocked.toString();
        expectedLockedReward = new BN(expectedLockedReward).multipliedBy(2).toFixed(0);
        assert.equal(expectedLockedReward, lockedReward);

        let releaseTime = (await this.nerdvault.userInfo(0, minter)).valueOf().releaseTime.toString();
        console.log('releaseTime:', releaseTime)
        await time.increase(86400 * 28 + 1);
        await time.advanceBlock();

        await this.nerd.transfer(burner, '1000000000', { from: minter });

        console.log('newReleaseTime:', (await this.nerdvault.userInfo(0, minter)).valueOf().releaseTime.toString())

        balBefore = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter });
        let expectedNewReleaseTime = new BN(await time.latest()).plus(86400 * 28).toFixed(0);
        console.log('current time:', (await time.latest()).toString())
        balAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();

        console.log('locked reward:', (await this.nerdvault.userInfo(0, minter)).valueOf().rewardLocked.toString())

        let totalReceived = new BN(receivedReward).plus(new BN(lockedReward)).toFixed(0);
        assert.equal(totalReceived, new BN(balAfter).minus(new BN(balBefore)).toFixed(0));
        let newExpectedLockedReward = new BN(lockedReward).dividedBy(2).toFixed(0);
        await this.nerdvault.withdrawNerd(0, { from: minter });
        let newReleaseTime = (await this.nerdvault.userInfo(0, minter)).valueOf().releaseTime.toString();
        let currentLockedReward = (await this.nerdvault.userInfo(0, minter)).valueOf().rewardLocked.toString();

        assert.equal(newExpectedLockedReward, currentLockedReward);
        assert.equal(expectedNewReleaseTime, newReleaseTime);

        await time.increase(86400 * 28 + 1);
        balBefore = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter });
        balAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();
        assert.equal(currentLockedReward, new BN(balAfter).minus(new BN(balBefore)).toFixed(0));
        assert.equal('0', (await this.nerdvault.userInfo(0, minter)).valueOf().rewardLocked.toString());
    });
});