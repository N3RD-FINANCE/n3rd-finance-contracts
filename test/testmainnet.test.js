const BN = require('bignumber.js');
BN.config({ DECIMAL_PLACES: 0 })
BN.config({ ROUNDING_MODE: BN.ROUND_DOWN })
const NerdToken = artifacts.require('Nerd');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
const NerdVault = artifacts.require('NerdVault');
const IERC20 = artifacts.require('IERC20');
const WETH9 = artifacts.require('WETH9');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const FeeApprover = artifacts.require('FeeApprover');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');
const FarmETHRouter = artifacts.require('FarmETHRouter');
const FeeProxy = artifacts.require("FeeDistributorProxy");
const StakingPool = artifacts.require("StakingPool");
const e18 = new BN('1000000000000000000');
const lgeApprover = require('./lgeapprover');
const testconfig = require('./testconfig');

function toWei(n) {
    return new BN(n).multipliedBy(e18).toFixed();
}

const totalSupply = toWei('21000');

contract('NerdToken: Testmainnet', async ([alice, john, minter, dev, burner, clean, clean2, clean3, clean4, clean5, clean6, clean7, clean8, minter2]) => {
    let oldOwner = null;
    before(async () => {
        // if (testconfig.network != 'local') {
        //     await testconfig.readUniswap(this);
        //     let wethAddress = testconfig.wethAddress;
        //     let oldOwner = (await this.nerdvault.owner()).valueOf().toString();
        //     //await testconfig.transferOwnership(alice);
        //     let tokenInPair = testconfig.daiAddress;
        //     this.farmETHRouter = await FarmETHRouter.new();
        //     console.log('farmETHRouter:', this.farmETHRouter.address)
        //     await this.farmETHRouter.initialize({ from: alice });
        //     this.token = await IERC20.at(tokenInPair);
        //     this.sourceToken = await IERC20.at(testconfig.usdtAddress);
        //     await this.sourceToken.approve(this.farmETHRouter.address, '1000000000000', { from: alice });
        //     await this.farmETHRouter.addLiquidityByTokenForPool(this.sourceToken.address, '1000000000', 1, alice, true, { from: alice });

        //     let vaultOwner = (await this.nerdvault.owner()).valueOf().toString();
        //     assert(vaultOwner, alice);
        //     let currentTime = await time.latest();
        //     //buying 
        //     await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, testconfig.usdtAddress], alice, new BN(currentTime).plus(1000).toString(), { from: clean2, value: toWei(20) });
        //     assert.equal(false, true);
        //     await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, tokenInPair], clean2, new BN(currentTime).plus(1000).toString(), { from: clean2, value: toWei(20) });
        //     await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, this.nerd.address], clean2, new BN(currentTime).plus(1000).toString(), { from: clean2, value: toWei(2) });

        //     let tokenBalance = (await this.token.balanceOf(clean2)).valueOf().toString();
        //     let nerdBalance = (await this.nerd.balanceOf(clean2)).valueOf().toString();
        //     assert.notEqual('0', tokenBalance);
        //     await this.nerd.approve(this.router.address, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', { from: clean2 });
        //     await this.token.approve(this.router.address, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', { from: clean2 });
        //     currentTime = await time.latest();
        //     await this.router.addLiquidity(this.nerd.address, this.token.address, nerdBalance, tokenBalance, 0, 0, clean2, new BN(currentTime).plus(1000).toString(), { from: clean2 });
        //     let nerdTokenPairAddress = (await this.factory.getPair(this.nerd.address, this.token.address)).valueOf().toString();
        //     this.nerdTokenPair = await UniswapV2Pair.at(nerdTokenPairAddress);
        //     let newPairBalance = (await this.nerdTokenPair.balanceOf(clean2)).valueOf().toString();
        //     assert.notEqual('0', newPairBalance);

        //     //await this.nerdvault.add(1500, this.nerdTokenPair.address, true, { from: alice });
        //     await this.nerdTokenPair.approve(this.nerdvault.address, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', { from: clean2 });
        //     let liq = (await this.nerdTokenPair.balanceOf(clean2)).valueOf().toString();
        //     console.log('liq:', liq)
        //     await this.nerdvault.deposit(1, liq, { from: clean2 });
        //     //assert.equal('999000000000000', (await this.nerdvault.getRemainingLP(1, clean2)).valueOf().toString());
        //     //assert.equal('999000000000000', (await this.nerdvault.getReferenceAmount(1, clean2)).valueOf().toString());
        //     //assert.equal('0', (await this.nerdvault.pendingNerd(1, clean2)).valueOf().toString());
        //     await this.router.swapExactETHForTokens(0, [wethAddress, this.nerd.address], clean2, new BN(currentTime).plus(1000).toString(), { from: clean2, value: toWei(20) });
        //     await this.nerd.transfer(clean2, '1000000000000000000', { from: clean2 });
        //     assert.notEqual('0', (await this.nerdvault.pendingNerd(1, clean2)).valueOf().toString());
        //     await this.nerdvault.withdrawNerd(1, { from: clean2 });

        //     currentTime = await time.latest();
        //     //clean3 get some 
        //     await this.router.swapExactETHForTokens(0, [wethAddress, this.sourceToken.address], clean3, new BN(currentTime).plus(1000).toString(), { from: clean3, value: toWei(20) });
        //     await this.router.swapExactETHForTokens(0, [wethAddress, this.sourceToken.address], clean8, new BN(currentTime).plus(1000).toString(), { from: clean8, value: toWei(20) });
        //     let clean3SourceToken = (await this.sourceToken.balanceOf(clean3)).valueOf().toString();
        //     let clean8SourceToken = (await this.sourceToken.balanceOf(clean8)).valueOf().toString();
        //     console.log('clean3SourceToken:', clean3SourceToken)
        //     // await this.sourceToken.approve(this.router.address, clean3SourceToken, { from: clean3 });
        //     // await this.router.swapExactTokensForTokens(clean3SourceToken, 0, [this.sourceToken.address, testconfig.wethAddress], clean3, new BN(currentTime).plus(1000).toFixed(0), { from: clean3 });

        //     //await this.sourceToken.transferFrom(clean3, this.farmETHRouter.address, '100000', { from: clean5 });
        //     await this.sourceToken.approve(this.farmETHRouter.address, clean3SourceToken, { from: clean3 });
        //     await this.sourceToken.approve(this.farmETHRouter.address, clean3SourceToken, { from: clean8 });

        //     await this.farmETHRouter.addLiquidityETHOnlyForPool(1, clean3, true, { from: clean3, value: toWei(1) });

        //     await this.farmETHRouter.addLiquidityByTokenForPool(this.sourceToken.address, clean3SourceToken, 1, clean3, true, { from: clean3 });
        //     await this.farmETHRouter.addLiquidityByTokenForPool(this.sourceToken.address, clean8SourceToken, 1, clean8, true, { from: clean8 });
        //     await this.nerd.transfer(clean2, '1000000000000000000', { from: clean2 });
        //     assert.notEqual('0', (await this.nerdvault.pendingNerd(1, clean3)).valueOf().toString());

        //     //test staking pool
        //     //buy nerd for clean4 and clean5
        //     await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, this.nerd.address], clean4, new BN(currentTime).plus(1000).toString(), { from: clean4, value: toWei(2) });
        //     await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, this.nerd.address], clean5, new BN(currentTime).plus(1000).toString(), { from: clean5, value: toWei(2) });

        //     this.feeProxyAddress = (await this.nerd.feeDistributor()).valueOf().toString();
        //     this.feeProxy = await FeeProxy.at(this.feeProxyAddress);
        //     this.stakingPoolAddress = (await this.feeProxy.stakingPool()).valueOf().toString();
        //     this.stakingPool = await StakingPool.at(this.stakingPoolAddress);

        //     let poolBalBeforeStake = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
        //     console.log('poolBal:', poolBalBeforeStake)
        //     let pendingRewardsBeforeStake = (await this.stakingPool.pendingRewards()).valueOf().toString();
        //     console.log('pendingRewards:', pendingRewardsBeforeStake)

        //     //clean4 % clean5 stake
        //     await this.nerd.approve(this.stakingPoolAddress, '1000000000000000000', { from: clean4 });
        //     await this.nerd.approve(this.stakingPoolAddress, '200000000000000000', { from: clean5 });
        //     await this.stakingPool.deposit('100000000000000000', { from: clean4 });
        //     let pendingNerd = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
        //     console.log('pendingNerd:', pendingNerd)
        //     {
        //         let transferFee = new BN('100000000000000000').multipliedBy(3).dividedBy(100);
        //         let poolReceive = transferFee.dividedBy(5).toFixed(0); //20%
        //         let pendingRewardsAfterStake = new BN(poolReceive).plus(new BN(pendingRewardsBeforeStake)).toFixed(0);
        //         let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
        //         console.log('poolBal:', poolBal)
        //         let pendingRewards = (await this.stakingPool.pendingRewards()).valueOf().toString();
        //         assert.equal(pendingRewardsAfterStake, pendingRewards)
        //     }
        //     {
        //         //3% fee should be applied
        //         let actualDeposit = new BN('100000000000000000').multipliedBy(97).dividedBy(100).toFixed(0);
        //         let inpoolDeposit = (await this.stakingPool.userInfo(clean4)).valueOf().amount.toString();
        //         assert.equal(actualDeposit, inpoolDeposit);
        //     }
        //     await this.stakingPool.massUpdatePools();
        //     assert.equal('0', (await this.stakingPool.pendingRewards()).valueOf().toString());
        //     let currentAcc = (await this.stakingPool.poolInfo()).valueOf().accNerdPerShare.toString();
        //     await this.stakingPool.deposit('100000000000000000', { from: clean4 });
        //     {
        //         let transferFee = new BN('100000000000000000').multipliedBy(3).dividedBy(100);
        //         let poolReceive = transferFee.dividedBy(5).toFixed(0); //20%
        //         assert.equal(poolReceive, (await this.stakingPool.pendingRewards()).valueOf().toString());
        //     }
        //     await this.stakingPool.massUpdatePools();
        //     let Acc = (await this.stakingPool.poolInfo()).valueOf().accNerdPerShare.toString();
        //     {
        //         let transferFee = new BN('100000000000000000').multipliedBy(3).dividedBy(100);
        //         let poolReceive = transferFee.dividedBy(5).toFixed(0); //20%
        //         let totalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString();
        //         assert.equal(new BN('100000000000000000').multipliedBy(194).dividedBy(100).toFixed(0), totalDeposit);
        //         let rewards = new BN(poolReceive).multipliedBy(10000 - 724).dividedBy(10000)
        //         let inc = new BN(rewards).multipliedBy(new BN('1e18')).dividedBy(new BN(totalDeposit)).toFixed(0);
        //         let incWithoutDev = new BN(poolReceive).multipliedBy(new BN('1e18')).dividedBy(new BN(totalDeposit)).toFixed(0);
        //         assert.equal(Acc, new BN(currentAcc).plus(new BN(inc)).toFixed(0));

        //         let pending_DEV_rewards = (await this.stakingPool.pending_DEV_rewards()).valueOf().toString();
        //         let pendingRewards4 = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
        //         let lockedRewards4 = (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString();
        //         let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
        //         assert.equal(poolBal, new BN(totalDeposit).plus(new BN(pending_DEV_rewards)).plus(new BN(pendingRewards4)).plus(new BN(lockedRewards4)).toFixed(0))
        //     }
        //     // assert.notEqual('0', (await this.stakingPool.pendingNerd(clean4)).valueOf().toString());
        //     // assert.equal('0', (await this.stakingPool.pendingNerd(clean5)).valueOf().toString());
        //     // await this.stakingPool.deposit('200000000000000000', { from: clean5 });
        //     // {
        //     //     //3% fee should be applied
        //     //     let actualDeposit = new BN('200000000000000000').multipliedBy(97).dividedBy(100).toFixed(0);
        //     //     let inpoolDeposit = (await this.stakingPool.userInfo(clean5)).valueOf().amount.toString();
        //     //     assert.equal(actualDeposit, inpoolDeposit);
        //     // }

        //     await this.stakingPool.withdrawNerd({ from: clean4 })
        //     await this.stakingPool.withdrawNerd({ from: clean5 })

        //     await time.increase(86400 * 7 * 5);

        //     await this.stakingPool.withdrawNerd({ from: clean4 })
        //     await this.stakingPool.withdrawNerd({ from: clean5 })
        //     await this.stakingPool.withdrawNerd({ from: clean4 })
        //     await this.stakingPool.withdrawNerd({ from: clean5 })

        //     let refAmountClean4 = (await this.stakingPool.getReferenceAmount(clean4)).valueOf().toString();
        //     let refAmountClean5 = (await this.stakingPool.getReferenceAmount(clean5)).valueOf().toString();
        //     assert.equal(new BN(refAmountClean4).multipliedBy(2).toFixed(0), refAmountClean5);
        //     assert.notEqual('0', (await this.stakingPool.pendingNerd(clean4)).valueOf().toString());
        //     assert.notEqual('0', (await this.stakingPool.pendingNerd(clean5)).valueOf().toString());

        //     currentTime = await time.latest();
        //     await this.router.swapExactETHForTokens(0, [wethAddress, this.sourceToken.address], clean6, new BN(currentTime).plus(1000).toString(), { from: clean3, value: toWei(5) });
        //     let clean6SourceToken = (await this.sourceToken.balanceOf(clean6)).valueOf().toString();
        //     await this.sourceToken.approve(this.farmETHRouter.address, clean6SourceToken, { from: clean6 });
        //     // this.farmETHRouter.stakeNerdByAnyToken(this.stakingPoolAddress, this.sourceToken.address, clean6SourceToken, { from: clean6 });

        //     // assert.notEqual('0', (await this.stakingPool.pendingNerd(clean5)).valueOf().toString());

        //     // assert.notEqual('0', (await this.stakingPool.pendingNerd(clean6)).valueOf().toString());

        //     // this.farmETHRouter.stakeNerdByETH(this.stakingPoolAddress, { from: clean7, value: toWei(1) });
        //     // assert.notEqual('0', (await this.stakingPool.pendingNerd(clean7)).valueOf().toString());

        //     assert.notEqual('0', (await this.stakingPool.pendingNerd(clean4)).valueOf().toString());
        //     let pendingNerd4 = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
        //     let restakeAmount = new BN(pendingNerd4).multipliedBy(50).dividedBy(100).toFixed(0);
        //     let poolTotalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit;
        //     await this.stakingPool.claimAndRestake({ from: clean4 });
        //     assert.equal('0', (await this.stakingPool.pendingNerd(clean4)).valueOf().toString());
        //     assert.equal((await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString(), new BN(restakeAmount).plus(new BN(poolTotalDeposit)).toFixed(0));
        //     assert.equal('0', (await this.stakingPool.pendingRewards()).valueOf().toString());

        //     await this.stakingPool.withdrawNerd({ from: clean4 });
        //     await this.stakingPool.withdrawNerd({ from: clean5 });
        //     await this.stakingPool.withdrawNerd({ from: clean6 });
        //     await this.stakingPool.withdrawNerd({ from: clean7 });

        //     assert.notEqual('0', (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString());
        //     assert.notEqual('0', (await this.stakingPool.userInfo(clean5)).valueOf().rewardLocked.toString());
        //     // assert.notEqual('0', (await this.stakingPool.userInfo(clean6)).valueOf().rewardLocked.toString());
        //     // assert.notEqual('0', (await this.stakingPool.userInfo(clean7)).valueOf().rewardLocked.toString());

        //     assert.equal('0', (await this.stakingPool.pendingNerd(clean4)).valueOf().toString());
        //     assert.equal('0', (await this.stakingPool.pendingNerd(clean5)).valueOf().toString());
        //     assert.equal('0', (await this.stakingPool.pendingNerd(clean6)).valueOf().toString());
        //     assert.equal('0', (await this.stakingPool.pendingNerd(clean7)).valueOf().toString());


        //     let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
        //     assert.notEqual(poolBal, (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString());

        //     await this.nerdvault.withdrawNerd(1, { from: clean3 })
        //     await this.nerdvault.withdrawNerd(1, { from: clean8 })

        //     await time.increase(86400 * 7 * 4);

        //     await this.nerdvault.withdrawNerd(1, { from: clean3 })
        //     await this.nerdvault.withdrawNerd(1, { from: clean8 })

        //     await this.stakingPool.withdrawNerd({ from: clean4 });
        //     await this.stakingPool.withdrawNerd({ from: clean7 });
        //     await this.stakingPool.withdrawNerd({ from: clean6 });
        //     await this.stakingPool.withdrawNerd({ from: clean4 });
        //     await this.stakingPool.withdrawNerd({ from: clean5 });
        //     await this.stakingPool.withdrawNerd({ from: clean6 });
        //     poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
        //     let totalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString();
        //     console.log('pool balance:', poolBal);
        //     let clean7LockedRewards = (await this.stakingPool.userInfo(clean7)).valueOf().rewardLocked.toString();
        //     console.log('clean7LockedRewards:', clean7LockedRewards);
        //     let sum = new BN(totalDeposit).plus(new BN(clean7LockedRewards)).toFixed(0);
        //     console.log('sum:', sum);
        //     await this.stakingPool.updateAndPayOutPendingTest(clean5, { from: clean7 });
        //     await this.stakingPool.withdrawNerd({ from: clean7 });
        //     poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
        //     assert.equal(poolBal, (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString());

        // }
    });
    it("Test staking pool", async () => {
        if (testconfig.network != 'local') {
            let currentTime = await time.latest();
            await testconfig.readUniswap(this);
            await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, testconfig.usdtAddress], clean4, new BN(currentTime).plus(1000).toString(), { from: alice, value: toWei(2) });
            await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, this.nerd.address], clean4, new BN(currentTime).plus(1000).toString(), { from: clean4, value: toWei(2) });
            await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, this.nerd.address], clean5, new BN(currentTime).plus(1000).toString(), { from: clean5, value: toWei(2) });

            this.feeProxyAddress = (await this.nerd.feeDistributor()).valueOf().toString();
            this.feeProxy = await FeeProxy.at(this.feeProxyAddress);
            this.stakingPoolAddress = (await this.feeProxy.stakingPool()).valueOf().toString();
            this.stakingPool = await StakingPool.at(this.stakingPoolAddress);

            let poolBalBeforeStake = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
            console.log('poolBal:', poolBalBeforeStake)
            let pendingRewardsBeforeStake = (await this.stakingPool.pendingRewards()).valueOf().toString();
            console.log('pendingRewards:', pendingRewardsBeforeStake)

            //clean4 % clean5 stake
            await this.nerd.approve(this.stakingPoolAddress, '1000000000000000000', { from: clean4 });
            await this.nerd.approve(this.stakingPoolAddress, '200000000000000000', { from: clean5 });
            await this.stakingPool.deposit('100000000000000000', { from: clean4 });
            currentTime = await time.latest();
            assert.equal(currentTime, (await this.stakingPool.userInfo(clean4)).valueOf().depositTime.toString());
            let pendingNerd = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
            console.log('pendingNerd:', pendingNerd)
            {
                let transferFee = new BN('100000000000000000').multipliedBy(3).dividedBy(100);
                let poolReceive = transferFee.dividedBy(5).toFixed(0); //20%
                let pendingRewardsAfterStake = new BN(poolReceive).plus(new BN(pendingRewardsBeforeStake)).toFixed(0);
                let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
                console.log('poolBal:', poolBal)
                let pendingRewards = (await this.stakingPool.pendingRewards()).valueOf().toString();
                assert.equal(pendingRewardsAfterStake, pendingRewards)
            }
            {
                //3% fee should be applied
                let actualDeposit = new BN('100000000000000000').multipliedBy(97).dividedBy(100).toFixed(0);
                let inpoolDeposit = (await this.stakingPool.userInfo(clean4)).valueOf().amount.toString();
                assert.equal(actualDeposit, inpoolDeposit);
            }
            //assert.equal('0', (await this.stakingPool.pendingRewards()).valueOf().toString());
            let currentAcc = (await this.stakingPool.poolInfo()).valueOf().accNerdPerShare.toString();
            {
                {
                    let pending_DEV_rewards = (await this.stakingPool.pending_DEV_rewards()).valueOf().toString();
                    let pendingRewards = (await this.stakingPool.pendingRewards()).valueOf().toString();
                    let pendingRewards4 = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
                    let lockedRewards4 = (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString();
                    let totalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString();
                    let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
                    assert.equal(new BN('100000000000000000').multipliedBy(97).dividedBy(100).toFixed(0), totalDeposit);
                    //assert.equal('0', pending_DEV_rewards);
                    //assert.equal(poolBal, new BN(lockedRewards4).plus(new BN(totalDeposit)).plus(new BN(pending_DEV_rewards)).plus(new BN(pendingRewards)).plus(new BN(pendingRewards4)).toFixed(0));
                }
            }
            await this.stakingPool.deposit('100000000000000000', { from: clean5 });
            {
                let transferFee = new BN('100000000000000000').multipliedBy(3).dividedBy(100);
                let poolReceive = transferFee.dividedBy(5).toFixed(0); //20%
                //assert.equal(poolReceive, (await this.stakingPool.pendingRewards()).valueOf().toString());
            }
            {
                let transferFee = new BN('100000000000000000').multipliedBy(3).dividedBy(100);
                let poolReceive = transferFee.dividedBy(5).toFixed(0); //20%
                let totalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString();
                assert.equal(new BN('100000000000000000').multipliedBy(194).dividedBy(100).toFixed(0), totalDeposit);
                let rewards = new BN(poolReceive).multipliedBy(10000 - 724).dividedBy(10000)
                let inc = new BN(rewards).multipliedBy(new BN('1e18')).dividedBy(new BN(totalDeposit)).toFixed(0);
                let actualRewards4 = new BN(inc).multipliedBy(new BN(totalDeposit)).dividedBy(new BN('1e18')).toFixed(0);
                let addedDevRewards = new BN(rewards).minus(new BN(actualRewards4)).toFixed(0);
                let incWithoutDev = new BN(poolReceive).multipliedBy(new BN('1e18')).dividedBy(new BN(totalDeposit)).toFixed(0);
                //assert.equal(Acc, new BN(currentAcc).plus(new BN(inc)).toFixed(0));

                let pending_DEV_rewards = (await this.stakingPool.pending_DEV_rewards()).valueOf().toString();
                let devRewardsAfter = new BN(addedDevRewards).plus(pending_DEV_rewards).toFixed(0);
                console.log('devRewardsAfter:', devRewardsAfter)
                let pendingRewards4 = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
                let pendingRewards = (await this.stakingPool.pendingRewards()).valueOf().toString();
                let lockedRewards4 = (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString();
                let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
                console.log('poolBal before update:', poolBal)
                //assert.equal(poolBal, new BN(totalDeposit).plus(new BN(pending_DEV_rewards)).plus(new BN(pendingRewards)).plus(new BN(lockedRewards4)).toFixed(0))
            }
            let Acc = (await this.stakingPool.poolInfo()).valueOf().accNerdPerShare.toString();
            {
                let transferFee = new BN('100000000000000000').multipliedBy(3).dividedBy(100);
                let poolReceive = transferFee.dividedBy(5).toFixed(0); //20%
                let totalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString();
                assert.equal(new BN('100000000000000000').multipliedBy(194).dividedBy(100).toFixed(0), totalDeposit);
                let rewards = new BN(poolReceive).multipliedBy(10000 - 724).dividedBy(10000)
                let inc = new BN(rewards).multipliedBy(new BN('1e18')).dividedBy(new BN(totalDeposit)).toFixed(0);
                let incWithoutDev = new BN(poolReceive).multipliedBy(new BN('1e18')).dividedBy(new BN(totalDeposit)).toFixed(0);
                //assert.equal(Acc, new BN(currentAcc).plus(new BN(inc)).toFixed(0));

                let pending_DEV_rewards = (await this.stakingPool.pending_DEV_rewards()).valueOf().toString();
                let pendingRewards4 = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
                let lockedRewards4 = (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString();
                let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
                console.log('poolBal after update:', poolBal)
                console.log('pending_DEV_rewards:', pending_DEV_rewards)
                //assert.equal(poolBal, new BN(totalDeposit).plus(new BN(pending_DEV_rewards)).plus(new BN(pendingRewards4)).plus(new BN(lockedRewards4)).toFixed(0))
            }
            // assert.notEqual('0', (await this.stakingPool.pendingNerd(clean4)).valueOf().toString());
            // assert.equal('0', (await this.stakingPool.pendingNerd(clean5)).valueOf().toString());
            // await this.stakingPool.deposit('200000000000000000', { from: clean5 });
            // {
            //     //3% fee should be applied
            //     let actualDeposit = new BN('200000000000000000').multipliedBy(97).dividedBy(100).toFixed(0);
            //     let inpoolDeposit = (await this.stakingPool.userInfo(clean5)).valueOf().amount.toString();
            //     assert.equal(actualDeposit, inpoolDeposit);
            // }

            this.farmETHRouter = await FarmETHRouter.new();
            console.log('farmETHRouter:', this.farmETHRouter.address)
            await this.farmETHRouter.initialize({ from: alice });
            this.sourceToken = await IERC20.at(testconfig.usdtAddress);
            currentTime = await time.latest();

            await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, testconfig.usdtAddress], clean6, new BN(currentTime).plus(1000).toString(), { from: clean6, value: toWei(20) });
            await this.router.swapExactETHForTokens(0, [testconfig.wethAddress, testconfig.usdtAddress], clean7, new BN(currentTime).plus(1000).toString(), { from: clean7, value: toWei(20) });

            await this.sourceToken.approve(this.farmETHRouter.address, '1000000000000', { from: clean6 });
            await this.sourceToken.approve(this.farmETHRouter.address, '1000000000000', { from: clean7 });

            this.farmETHRouter.stakeNerdByETH(this.stakingPoolAddress, { from: clean7, value: toWei(1) });
            this.farmETHRouter.stakeNerdByAnyToken(this.stakingPoolAddress, this.sourceToken.address, '1000000000', { from: clean6 });
            assert.notEqual('0', (await this.stakingPool.userInfo(clean7)).valueOf().amount.toString());
            assert.notEqual('0', (await this.stakingPool.userInfo(clean6)).valueOf().amount.toString());

            await this.stakingPool.withdraw(0, { from: clean4 })
            await this.stakingPool.withdraw(0, { from: clean5 })
            await this.stakingPool.withdraw(0, { from: clean6 })
            await this.stakingPool.withdraw(0, { from: clean7 })

            await this.stakingPool.claimAndRestake({ from: clean4 });

            await this.stakingPool.withdrawNerd({ from: clean4 })
            await this.stakingPool.withdrawNerd({ from: clean5 })
            await this.stakingPool.withdrawNerd({ from: clean6 })
            await this.stakingPool.withdrawNerd({ from: clean7 })

            await time.increase(86400 * 7 * 5);
            {
                let pending_DEV_rewards = (await this.stakingPool.pending_DEV_rewards()).valueOf().toString();
                let lockedRewards4 = (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString();
                let totalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString();
                let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
                // assert.equal(new BN('100000000000000000').multipliedBy(194).dividedBy(100).toFixed(0), totalDeposit);
                // assert.equal('0', pending_DEV_rewards);
                // assert.equal(poolBal, new BN(lockedRewards4).plus(new BN(totalDeposit)).toFixed(0));
                console.log('totalDeposit:', totalDeposit)
                console.log('poolBal:', poolBal)
            }

            await this.stakingPool.withdrawNerd({ from: clean4 })
            await this.stakingPool.withdrawNerd({ from: clean5 })
            await this.stakingPool.withdrawNerd({ from: clean4 })
            await this.stakingPool.withdrawNerd({ from: clean5 })
            await this.stakingPool.withdrawNerd({ from: clean6 })
            await this.stakingPool.withdrawNerd({ from: clean7 })

            {
                let pending_DEV_rewards = (await this.stakingPool.pending_DEV_rewards()).valueOf().toString();
                let lockedRewards4 = (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString();
                let totalDeposit = (await this.stakingPool.poolInfo()).valueOf().totalDeposit.toString();
                let poolBal = (await this.nerd.balanceOf(this.stakingPoolAddress)).valueOf().toString();
                let releasable = (await this.stakingPool.computeReleasableNerd(clean4)).valueOf().toString();

                let deposit4 = (await this.stakingPool.userInfo(clean4)).valueOf().amount.toString();
                let deposit5 = (await this.stakingPool.userInfo(clean5)).valueOf().amount.toString();
                let deposit6 = (await this.stakingPool.userInfo(clean6)).valueOf().amount.toString();
                let deposit7 = (await this.stakingPool.userInfo(clean7)).valueOf().amount.toString();

                let depositR4 = (await this.stakingPool.userInfo(clean4)).valueOf().referenceAmount.toString();
                let depositR5 = (await this.stakingPool.userInfo(clean5)).valueOf().referenceAmount.toString();
                let depositR6 = (await this.stakingPool.userInfo(clean6)).valueOf().referenceAmount.toString();
                let depositR7 = (await this.stakingPool.userInfo(clean7)).valueOf().referenceAmount.toString();

                let total = new BN(deposit4).plus(new BN(deposit5)).plus(new BN(deposit6)).plus(new BN(deposit7)).toFixed(0);
                let totalR = new BN(depositR4).plus(new BN(depositR5)).plus(new BN(depositR6)).plus(new BN(depositR7)).toFixed(0);
                // assert.equal(new BN('100000000000000000').multipliedBy(194).dividedBy(100).toFixed(0), totalDeposit);
                // assert.equal('0', pending_DEV_rewards);
                // assert.equal(poolBal, new BN(lockedRewards4).plus(new BN(totalDeposit)).toFixed(0));
                console.log('totalDeposit:', totalDeposit)
                console.log('releasable:', releasable)
                console.log('poolBal:', poolBal)
                console.log('total:', total)
                assert.equal(total, totalR);
                assert.equal(total, totalDeposit);
            }
            {
                let lockedRewards4 = (await this.stakingPool.userInfo(clean4)).valueOf().rewardLocked.toString();
                let pending4 = (await this.stakingPool.pendingNerd(clean4)).valueOf().toString();
                let pending_DEV_rewards = (await this.stakingPool.pending_DEV_rewards()).valueOf().toString();
                assert.equal('0', pending_DEV_rewards);
                assert.equal('0', lockedRewards4);
                assert.equal('0', pending4);
            }

            await this.stakingPool.withdraw('1000000000', { from: clean4 })
            await this.stakingPool.withdraw(0, { from: clean5 })
            await this.stakingPool.withdraw(0, { from: clean6 })
            await this.stakingPool.withdraw(0, { from: clean7 })

            await this.stakingPool.quitPool({ from: clean4 })
            await this.stakingPool.quitPool({ from: clean5 })
            await this.stakingPool.quitPool({ from: clean6 })
            await this.stakingPool.quitPool({ from: clean7 })
        }
    });
});