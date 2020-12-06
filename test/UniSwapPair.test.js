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
const testconfig = require('./testconfig');

function toWei(n) {
    return new BN(n).multipliedBy(e18).toFixed();
}

const totalSupply = toWei('21000');
const initialMinted = new BN(totalSupply).multipliedBy(91).dividedBy(100).toString();
const DEV_FEE = 724;

contract('NerdToken', ([alice, john, minter, dev, burner, clean, clean2, clean3, clean4, clean5, clean6, minter2]) => {
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
        await this.nerdvault.initialize(this.nerd.address, dev, { from: clean });
        await this.feeapprover.setNerdVaultAddress(this.nerdvault.address, { from: alice });
        await this.weth.transfer(minter, toWei('10'), { from: alice });
    });

    it('Token 0/1 has to be weth', async () => {
        let token0 = await this.nerdWETHPair.token0();
        let token1 = await this.nerdWETHPair.token1();
        assert.equal((token0 == this.weth.address && token1 == this.nerd.address) ||
            (token1 == this.weth.address && token0 == this.nerd.address), true);
    });

    it('Constructs fee multiplier correctly', async () => {
        assert.equal(await this.feeapprover.feePercentX100(), '20');    //2% initially
    });

    it('NerdVault should have pending fees set correctly and correct balance', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        await this.nerd.transfer(john, '1000', { from: minter });
        let expectedFee = new BN(20 * 1000 / 1000).toFixed();    //2% fee
        assert.equal((await this.nerdvault.pendingRewards()).valueOf().toString(), expectedFee);
        assert.equal((await this.nerd.balanceOf(this.nerdvault.address)), expectedFee);
    });

    it('Allows you to get fee multiplier and doesn`t allow non owner to call', async () => {
        assert.equal(await this.feeapprover.feePercentX100(), '20',);
        await expectRevert(this.feeapprover.setFeeMultiplier('20', { from: john }), 'Ownable: caller is not the owner');
        await this.feeapprover.setFeeMultiplier('20', { from: alice });
        assert.equal(await this.feeapprover.feePercentX100(), '20');
    });

    it('allows to transfer to contracts and people', async () => {
        await this.nerd.transfer(this.nerdWETHPair.address, '100', { from: minter }); //contract
        await this.nerd.transfer(john, '100', { from: minter }); //person
    });

    it('sets fee bearer correctly ', async () => {
        await expectRevert(this.nerd.setFeeDistributor(this.nerdvault.address, { from: minter }), 'Ownable: caller is not the owner');
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        assert.equal(await this.nerd.feeDistributor(), this.nerdvault.address);
    });

    it('nerd vault should account for LP tokens in genesis pool', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        let lpRemainingMinter = (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString();
        let lpReferenceMinter = (await this.nerdvault.getReferenceAmount(0, minter)).valueOf().toString();
        let lpReleasableMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();

        let lpRemainingMinter2 = (await this.nerdvault.getRemainingLP(0, minter2)).valueOf().toString();
        let lpReferenceMinter2 = (await this.nerdvault.getReferenceAmount(0, minter2)).valueOf().toString();
        let lpReleasableMinter2 = (await this.nerdvault.computeReleasableLP(0, minter2)).valueOf().toString();

        assert.equal(lpRemainingMinter, lpReferenceMinter);
        assert.equal('0', lpReleasableMinter);

        assert.equal(lpRemainingMinter2, lpReferenceMinter2);
        assert.equal('0', lpReleasableMinter2);

        let totalLPTokensMinted = (await this.nerd.totalLPTokensMinted()).valueOf().toString();
        assert.equal(totalLPTokensMinted, (await this.nerdWETHPair.balanceOf(this.nerd.address)).valueOf().toString());

        await this.nerdvault.claimLPToken();


        let expectedTotal = new BN(lpRemainingMinter).plus(new BN(lpRemainingMinter2)).toFixed(0);
        assert.equal(expectedTotal, (await this.nerdWETHPair.balanceOf(this.nerdvault.address)).valueOf().toString());

        lpRemainingMinter = (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString();
        lpReferenceMinter = (await this.nerdvault.getReferenceAmount(0, minter)).valueOf().toString();
        lpReleasableMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();

        lpRemainingMinter2 = (await this.nerdvault.getRemainingLP(0, minter2)).valueOf().toString();
        lpReferenceMinter2 = (await this.nerdvault.getReferenceAmount(0, minter2)).valueOf().toString();
        lpReleasableMinter2 = (await this.nerdvault.computeReleasableLP(0, minter2)).valueOf().toString();

        assert.equal(lpRemainingMinter, lpReferenceMinter);
        assert.equal('0', lpReleasableMinter);

        assert.equal(lpRemainingMinter2, lpReferenceMinter2);
        assert.equal('0', lpReleasableMinter2);

        //make some transfer to have fees
        await this.nerd.transfer(john, toWei('1'), { from: minter });
        await this.nerd.transfer(clean2, toWei('2'), { from: minter });

        let expectedFee = new BN(20).multipliedBy(toWei(3)).dividedBy(1000).toFixed();    //2% fee
        assert.equal(expectedFee, (await this.nerdvault.pendingRewards()).valueOf().toString());

        let pendingNerdMinter = (await this.nerdvault.pendingNerd(0, minter)).valueOf().toString();
        let pendingNerdMinter2 = (await this.nerdvault.pendingNerd(0, minter2)).valueOf().toString();

        //pending dev reward
        let pendingDevExpected = new BN(expectedFee).minus(new BN(pendingNerdMinter)).minus(new BN(pendingNerdMinter2)).toFixed(0);

        await this.nerdvault.massUpdatePools({ from: alice });
        assert.equal(pendingDevExpected, (await this.nerdvault.pending_DEV_rewards()).valueOf().toString());

        //withdraw dev rewards
        let devBalBefore = (await this.nerd.balanceOf(dev)).valueOf().toString();
        await this.nerdvault.transferDevFee();
        let devBalAfter = (await this.nerd.balanceOf(dev)).valueOf().toString();
        assert.equal(new BN(devBalAfter).minus(new BN(devBalBefore)).toFixed(0), pendingDevExpected);
        assert.equal('0', (await this.nerdvault.pending_DEV_rewards()).valueOf().toString());

        let minterBalBefore = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter });
        let minterBalAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();
        assert.equal(new BN(minterBalAfter).minus(new BN(minterBalBefore)).toFixed(0), new BN(pendingNerdMinter).multipliedBy(50).dividedBy(100).toFixed(0));
        assert.equal('0', (await this.nerdvault.pendingNerd(0, minter)).valueOf().toString());

        let minter2BalBefore = (await this.nerd.balanceOf(minter2)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter2 });
        let minter2BalAfter = (await this.nerd.balanceOf(minter2)).valueOf().toString();
        assert.equal(new BN(minter2BalAfter).minus(new BN(minter2BalBefore)).toFixed(0), new BN(pendingNerdMinter2).dividedBy(2).toFixed(0));
        assert.equal('0', (await this.nerdvault.pendingNerd(0, minter2)).valueOf().toString());

        //make more transfers
        await this.nerd.transfer(john, toWei('1'), { from: minter });
        await this.nerd.transfer(clean2, toWei('2'), { from: minter });

        expectedFee = new BN(20).multipliedBy(toWei(3)).dividedBy(1000).toFixed();    //2% fee
        assert.equal(expectedFee, (await this.nerdvault.pendingRewards()).valueOf().toString());

        pendingNerdMinter = (await this.nerdvault.pendingNerd(0, minter)).valueOf().toString();
        pendingNerdMinter2 = (await this.nerdvault.pendingNerd(0, minter2)).valueOf().toString();

        //pending dev reward
        //pendingDevExpected = new BN(expectedFee).minus(new BN(pendingNerdMinter)).minus(new BN(pendingNerdMinter2)).toFixed(0);
        await this.nerdvault.massUpdatePools({ from: alice });
        pendingDevExpected = (await this.nerdvault.pending_DEV_rewards()).valueOf().toString();
        assert.equal(pendingDevExpected, (await this.nerdvault.pending_DEV_rewards()).valueOf().toString());

        //withdraw dev rewards
        devBalBefore = (await this.nerd.balanceOf(dev)).valueOf().toString();
        await this.nerdvault.transferDevFee();
        devBalAfter = (await this.nerd.balanceOf(dev)).valueOf().toString();
        assert.equal(new BN(devBalAfter).minus(new BN(devBalBefore)).toFixed(0), pendingDevExpected);
        assert.equal('0', (await this.nerdvault.pending_DEV_rewards()).valueOf().toString());

        minterBalBefore = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter });
        minterBalAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();
        assert.equal(new BN(minterBalAfter).minus(new BN(minterBalBefore)).toFixed(0), new BN(pendingNerdMinter).dividedBy(2).toFixed(0));
        assert.equal('0', (await this.nerdvault.pendingNerd(0, minter)).valueOf().toString());

        minter2BalBefore = (await this.nerd.balanceOf(minter2)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter2 });
        minter2BalAfter = (await this.nerd.balanceOf(minter2)).valueOf().toString();

        //console.log('vault balance:', (await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString())

        //assert.equal(new BN(minter2BalAfter).minus(new BN(minter2BalBefore)).toFixed(0), pendingNerdMinter2);
        assert.equal('0', (await this.nerdvault.pendingNerd(0, minter2)).valueOf().toString());
        assert.notEqual('0', (await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString());

        await time.increase(60 * 60 * 24 * 28 + 1);
        await this.nerdvault.withdrawNerd(0, { from: minter });
        await this.nerdvault.withdrawNerd(0, { from: minter2 });
        assert.equal('0', (await this.nerd.balanceOf(this.nerdvault.address)).valueOf().toString());
    });

    it('Releasable tokens with time lock and penalty is correctly computed', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        let releasableLPMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();
        let releasableLPMinter2 = (await this.nerdvault.computeReleasableLP(0, minter2)).valueOf().toString();
        let totalLpMinter = (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString();
        let totalLpMinter2 = (await this.nerdvault.getRemainingLP(0, minter2)).valueOf().toString();

        assert.equal('0', releasableLPMinter);
        assert.equal('0', releasableLPMinter2);

        await time.increase(60 * 60 * 24 * 28 + 1);

        releasableLPMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();
        releasableLPMinter2 = (await this.nerdvault.computeReleasableLP(0, minter2)).valueOf().toString();
        assert.equal(new BN(totalLpMinter).multipliedBy(10).dividedBy(100).toFixed(0), releasableLPMinter);
        assert.equal(new BN(totalLpMinter2).multipliedBy(10).dividedBy(100).toFixed(0), releasableLPMinter2);

        //penalty for withdraw week1 after lock period = 4.5%
        let releasableLPWithPenaltyMinter = (await this.nerdvault.computeReleasableLPWithPenalty(0, minter)).valueOf();
        let userAmountMinter = releasableLPWithPenaltyMinter.userAmount.valueOf().toString();
        let penaltyAmountMinter = releasableLPWithPenaltyMinter.penaltyAmount.valueOf().toString();

        //penalty
        assert.equal(new BN(releasableLPMinter).multipliedBy(45).dividedBy(1000).toFixed(0), penaltyAmountMinter);
        assert.equal(new BN(releasableLPMinter).multipliedBy(1000 - 45).dividedBy(1000).toFixed(), userAmountMinter);

        //penalty for withdraw week1 after lock period = 4.5%
        let releasableLPWithPenaltyMinter2 = (await this.nerdvault.computeReleasableLPWithPenalty(0, minter2)).valueOf();
        let userAmountMinter2 = releasableLPWithPenaltyMinter2.userAmount.valueOf().toString();
        let penaltyAmountMinter2 = releasableLPWithPenaltyMinter2.penaltyAmount.valueOf().toString();

        //penalty
        assert.equal(new BN(releasableLPMinter2).multipliedBy(45).dividedBy(1000).toFixed(), penaltyAmountMinter2);
        assert.equal(new BN(releasableLPMinter2).multipliedBy(1000 - 45).dividedBy(1000).toFixed(), userAmountMinter2);

        //withdraw LP
        let lpBalBeforeMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        let pendingRewardsBefore = (await this.nerdvault.pendingRewards()).valueOf().toString();

        await this.nerdvault.withdraw(0, userAmountMinter, { from: minter });

        let lpBalAfterMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        let pendingRewardsAfter = (await this.nerdvault.pendingRewards()).valueOf().toString();

        assert.equal(userAmountMinter, new BN(lpBalAfterMinter).minus(new BN(lpBalBeforeMinter)).toFixed());
        assert.equal(true, new BN(pendingRewardsAfter).comparedTo(new BN(pendingRewardsBefore)) > 0);

        let minter2BalBefore = (await this.nerd.balanceOf(minter2)).valueOf().toString();
        let lpBalBeforeMinter2 = (await this.nerdWETHPair.balanceOf(minter2)).valueOf().toString();

        await this.nerdvault.withdraw(0, userAmountMinter2, { from: minter2 });

        let lpBalAfterMinter2 = (await this.nerdWETHPair.balanceOf(minter2)).valueOf().toString();
        assert.equal(userAmountMinter2, new BN(lpBalAfterMinter2).minus(new BN(lpBalBeforeMinter2)).toFixed());

        //minter2 got rewards
        let minter2BalAfter = (await this.nerd.balanceOf(minter2)).valueOf().toString();
        assert.equal(true, new BN(minter2BalAfter).comparedTo(new BN(minter2BalBefore)) > 0);

        //minter got rewards
        let minterBalBefore = (await this.nerd.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.withdrawNerd(0, { from: minter });
        let minterBalAfter = (await this.nerd.balanceOf(minter)).valueOf().toString();
        assert.equal(true, new BN(minterBalAfter).comparedTo(new BN(minterBalBefore)) > 0);
    });

    it('Should be able to withdraw LP tokens every week after locked period', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        let releasableLPMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();
        let totalLpMinter = (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString();

        assert.equal('0', releasableLPMinter);


        //travel pass initial locked period
        await time.increase(60 * 60 * 24 * 28 + 1);

        releasableLPMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();
        assert.equal(new BN(totalLpMinter).multipliedBy(10).dividedBy(100).toFixed(0), releasableLPMinter);
        //penalty for withdraw week1 after lock period = 4.5%
        let releasableLPWithPenaltyMinter = (await this.nerdvault.computeReleasableLPWithPenalty(0, minter)).valueOf();
        let userAmountMinter = releasableLPWithPenaltyMinter.userAmount.valueOf().toString();
        let penaltyAmountMinter = releasableLPWithPenaltyMinter.penaltyAmount.valueOf().toString();
        //penalty
        assert.equal(new BN(releasableLPMinter).multipliedBy(45).dividedBy(1000).toFixed(), penaltyAmountMinter);
        assert.equal(new BN(releasableLPMinter).multipliedBy(1000 - 45).dividedBy(1000).toFixed(), userAmountMinter);
        //withdraw
        let lpBalBeforeMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        let reciept = await this.nerdvault.withdraw(0, userAmountMinter, { from: minter });

        await expectRevert.unspecified(this.nerdvault.withdraw(0, userAmountMinter, { from: minter }));

        let lpBalAfterMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        assert.equal(userAmountMinter, new BN(lpBalAfterMinter).minus(new BN(lpBalBeforeMinter)).toFixed());

        //travel 1 week
        await time.increase(60 * 60 * 24 * 7);

        let week2ReleasableLPMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();
        let totalAlreadyReleased = new BN(week2ReleasableLPMinter).plus(new BN(userAmountMinter)).plus(new BN(penaltyAmountMinter)).toFixed(0);
        assert.equal(new BN(totalLpMinter).multipliedBy(20).dividedBy(100).toFixed(0), totalAlreadyReleased);
        //penalty for withdraw week2 after lock period = 4.%
        let week2ReleasableLPWithPenaltyMinter = (await this.nerdvault.computeReleasableLPWithPenalty(0, minter)).valueOf();
        let week2UserAmountMinter = week2ReleasableLPWithPenaltyMinter.userAmount.valueOf().toString();
        let week2PenaltyAmountMinter = week2ReleasableLPWithPenaltyMinter.penaltyAmount.valueOf().toString();
        //penalty
        assert.equal(new BN(week2ReleasableLPMinter).multipliedBy(40).dividedBy(1000).toFixed(), week2PenaltyAmountMinter);
        assert.equal(new BN(week2ReleasableLPMinter).multipliedBy(1000 - 40).dividedBy(1000).toFixed(), week2UserAmountMinter);
        await this.nerdvault.withdraw(0, week2UserAmountMinter, { from: minter });

        //travel 8 week
        await time.increase(60 * 60 * 24 * 7 * 8);
        let finalReleasableLPMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();
        let preciseAlreadyReleased = new BN(week2PenaltyAmountMinter).plus(new BN(week2UserAmountMinter)).plus(new BN(userAmountMinter)).plus(new BN(penaltyAmountMinter)).toFixed(0);
        assert.equal(new BN(finalReleasableLPMinter).plus(new BN(preciseAlreadyReleased)).toFixed(0), totalLpMinter);

        lpBalBeforeMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.quitPool(0, { from: minter });
        lpBalAfterMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        assert.equal('0', (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString());
        assert.equal(finalReleasableLPMinter, new BN(lpBalAfterMinter).minus(new BN(lpBalBeforeMinter)).toFixed(0));
    })

    it('Should be able to withdraw LP tokens without fee after lock period', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        let releasableLPMinter = (await this.nerdvault.computeReleasableLP(0, minter)).valueOf().toString();
        let totalLpMinter = (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString();

        assert.equal('0', releasableLPMinter);

        //travel pass initial locked period
        //4 weeks + 10 weeks
        await time.increase(60 * 60 * 24 * 28 + 60 * 60 * 24 * 7 * 10 + 1);

        let lpBalBeforeMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        await this.nerdvault.quitPool(0, { from: minter });
        let lpBalAfterMinter = (await this.nerdWETHPair.balanceOf(minter)).valueOf().toString();
        assert.equal('0', (await this.nerdvault.getRemainingLP(0, minter)).valueOf().toString());
        assert.equal(totalLpMinter, new BN(lpBalAfterMinter).minus(new BN(lpBalBeforeMinter)).toFixed(0));
    })

    it('Release timestamp should be updated after adding liquidity', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        let balBefore = (await this.nerd.balanceOf(clean2)).valueOf().toString();
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.nerd.address], clean2, 15999743005, { from: clean2, value: toWei('5') });
        let balAfter = (await this.nerd.balanceOf(clean2)).valueOf().toString();
        let bal = new BN(balAfter).minus(new BN(balBefore)).toFixed(0);
        await this.nerd.approve(this.router.address, new BN('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), { from: clean2 });
        //add liquidity
        await this.router.addLiquidityETH(this.nerd.address, new BN(bal).dividedBy(2).toFixed(0), 0, toWei('2'), clean2, 15999743005, { from: clean2, value: toWei('2') });
        let lpBal = (await this.nerdWETHPair.balanceOf(clean2)).valueOf().toString();

        //approve lp token
        await this.nerdWETHPair.approve(this.nerdvault.address, new BN('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), { from: clean2 });

        let lpDepositAmount1 = new BN(lpBal).dividedBy(2).toFixed(0);
        let lpDepositAmount2 = new BN(lpBal).minus(lpDepositAmount1).toFixed(0);
        let lpBalBeforeDeposit = (await this.nerdWETHPair.balanceOf(clean2)).valueOf().toString();
        let referenceAmountBefore = (await this.nerdvault.getReferenceAmount(0, clean2)).valueOf().toString();
        let remainingAmountBefore = (await this.nerdvault.getRemainingLP(0, clean2)).valueOf().toString();
        await this.nerdvault.deposit(0, lpDepositAmount1, { from: clean2 });
        let lpBalAfterDeposit = (await this.nerdWETHPair.balanceOf(clean2)).valueOf().toString();
        let referenceAmountAfter = (await this.nerdvault.getReferenceAmount(0, clean2)).valueOf().toString();
        let remainingAmountAfter = (await this.nerdvault.getRemainingLP(0, clean2)).valueOf().toString();
        let lpDepositAmount1AfterFee = new BN(lpDepositAmount1).minus(new BN(lpDepositAmount1).multipliedBy(1).dividedBy(1000)).toFixed(0);
        assert.equal(lpDepositAmount1, new BN(lpBalBeforeDeposit).minus(new BN(lpBalAfterDeposit)).toFixed());
        assert.equal(lpDepositAmount1AfterFee, new BN(referenceAmountAfter).minus(new BN(referenceAmountBefore)).toFixed());
        assert.equal(lpDepositAmount1AfterFee, new BN(remainingAmountAfter).minus(new BN(remainingAmountBefore)).toFixed());

        let lpRelease = (await this.nerdvault.getLpReleaseStart(0, clean2)).valueOf().toString();
        let lpDepositTime = (await this.nerdvault.getDepositTime(0, clean2)).valueOf().toString();
        let latestTimestamp = await time.latest();
        assert.equal(lpRelease, new BN(latestTimestamp).plus(60 * 60 * 24 * 28).toFixed(0));
        assert.equal(lpDepositTime, latestTimestamp);

        await time.increase(60 * 60 * 24 * 7);
        //at this time, releasable lp should be 0
        assert.equal('0', (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());

        await time.increase(60 * 60 * 24 * 21 + 1);
        assert.notEqual('0', (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());

        assert.equal('0', (await this.nerdvault.pendingNerd(0, clean2)).valueOf().toString());
        await this.nerd.transfer(clean2, toWei('2'), { from: clean2 });
        assert.notEqual('0', (await this.nerdvault.pendingNerd(0, clean2)).valueOf().toString());

        lpBalBeforeDeposit = (await this.nerdWETHPair.balanceOf(clean2)).valueOf().toString();
        referenceAmountBefore = (await this.nerdvault.getReferenceAmount(0, clean2)).valueOf().toString();
        remainingAmountBefore = (await this.nerdvault.getRemainingLP(0, clean2)).valueOf().toString();

        await this.nerdvault.deposit(0, lpDepositAmount2, { from: clean2 });
        assert.equal('0', (await this.nerdvault.pendingNerd(0, clean2)).valueOf().toString());

        lpBalAfterDeposit = (await this.nerdWETHPair.balanceOf(clean2)).valueOf().toString();
        referenceAmountAfter = (await this.nerdvault.getReferenceAmount(0, clean2)).valueOf().toString();
        remainingAmountAfter = (await this.nerdvault.getRemainingLP(0, clean2)).valueOf().toString();

        let lpDepositAmount2AfterFees = new BN(lpDepositAmount2).minus(new BN(lpDepositAmount2).multipliedBy(1).dividedBy(1000)).toFixed(0);
        assert.equal(lpDepositAmount2, new BN(lpBalBeforeDeposit).minus(new BN(lpBalAfterDeposit)).toFixed());
        assert.equal(lpDepositAmount2AfterFees, new BN(referenceAmountAfter).minus(new BN(referenceAmountBefore)).toFixed());
        assert.equal(lpDepositAmount2AfterFees, new BN(remainingAmountAfter).minus(new BN(remainingAmountBefore)).toFixed());

        lpDepositTime = (await this.nerdvault.getDepositTime(0, clean2)).valueOf().toString();
        latestTimestamp = await time.latest();
        assert.equal(true, new BN(lpDepositTime).comparedTo(new BN(latestTimestamp)) < 0);
        assert.notEqual(lpDepositTime, latestTimestamp);

        assert.equal('0', (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());

        //28 days later
        await time.increase(60 * 60 * 24 * 28);
        latestTimestamp = await time.latest();
        assert.notEqual('0', (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());

        let canWithdrawAll = new BN(lpDepositTime).plus(60 * 60 * 24 * 28 + 60 * 60 * 24 * 7 * 10 + 1).toFixed(0);
        let timeToTravel = new BN(canWithdrawAll).minus(new BN(latestTimestamp)).toNumber();
        assert.notEqual(referenceAmountAfter, (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());
        await time.increase(timeToTravel);
        assert.equal(referenceAmountAfter, (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());

        await time.increase(60 * 60 * 24 * 2);
        //get more tokens
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.nerd.address], clean2, 15999743005, { from: clean2, value: toWei('5') });
        bal = (await this.nerd.balanceOf(clean2)).valueOf().toString();
        await this.router.addLiquidityETH(this.nerd.address, new BN(bal).dividedBy(2).toFixed(0), 0, toWei('2'), clean2, 15999743005, { from: clean2, value: toWei('2') });
        lpBal = (await this.nerdWETHPair.balanceOf(clean2)).valueOf().toString();
        await this.nerdvault.deposit(0, lpBal, { from: clean2 });
        referenceAmountAfter = (await this.nerdvault.getReferenceAmount(0, clean2)).valueOf().toString();

        lpDepositTime = (await this.nerdvault.getDepositTime(0, clean2)).valueOf().toString();
        latestTimestamp = await time.latest();
        assert.equal(true, new BN(lpDepositTime).comparedTo(new BN(latestTimestamp)) < 0);
        assert.notEqual(lpDepositTime, latestTimestamp);

        canWithdrawAll = new BN(lpDepositTime).plus(60 * 60 * 24 * 28 + 60 * 60 * 24 * 7 * 10 + 1).toFixed(0);
        timeToTravel = new BN(canWithdrawAll).minus(new BN(latestTimestamp)).toNumber();
        assert.notEqual(referenceAmountAfter, (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());
        await time.increase(timeToTravel);
        assert.equal(referenceAmountAfter, (await this.nerdvault.computeReleasableLP(0, clean2)).valueOf().toString());
    });

    it('Buy and sell token', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        let balBefore = (await this.nerd.balanceOf(clean2)).valueOf().toString();
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.nerd.address], clean2, 15999743005, { from: clean2, value: toWei('5') });
        let balAfter = (await this.nerd.balanceOf(clean2)).valueOf().toString();
        let boughtAmount = new BN(balAfter).minus(new BN(balBefore)).toFixed(0);
        //reward should 0 as buying should not have fees
        assert.equal('0', (await this.nerdvault.pendingRewards()).valueOf().toString());
        //approve
        let soldAmount = new BN(boughtAmount).dividedBy(2).toFixed();
        await this.nerd.approve(this.router.address, boughtAmount, { from: clean2 });
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens(soldAmount, 0, [this.nerd.address, await this.router.WETH()], clean2, 15999743005, { from: clean2 });
        assert.equal(new BN(soldAmount).multipliedBy(2).dividedBy(100).toFixed(0), (await this.nerdvault.pendingRewards()).valueOf().toString());
    });
    it('Add LP one click', async () => {
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        this.farmETHRouter = await FarmETHRouter.new({ from: alice });
        await this.farmETHRouter.initialize(this.nerd.address);
        await this.farmETHRouter.addLiquidityETHOnly(clean5, true, { from: clean5, value: '100000000000000000' });
    });

    it('Add LP one click with fees for pairs', async () => {
        await this.feeapprover.editNoFeeList(this.nerdWETHPair.address, false, { from: alice });
        await this.nerd.setFeeDistributor(this.nerdvault.address, { from: alice });
        this.farmETHRouter = await FarmETHRouter.new({ from: alice });
        await this.farmETHRouter.initialize(this.nerd.address);
        await this.farmETHRouter.addLiquidityETHOnly(clean5, true, { from: clean5, value: '100000000000000000' });
    });
});