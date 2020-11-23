const BN = require('bignumber.js');
BN.config({ DECIMAL_PLACES: 18 })
const NerdToken = artifacts.require('Nerd');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
const NerdVault = artifacts.require('NerdVault');
const WETH9 = artifacts.require('WETH9');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const FeeApprover = artifacts.require('FeeApprover');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');
const totalSupply = '21000000000000000000000';
const e18 = new BN('1000000000000000000');
const lgeApprover = require('./lgeapprover');
const testconfig = require('./testconfig');

function toEther(n) {
    return new BN(n).dividedBy(e18).toFixed();
}

function toWei(n) {
    return new BN(n).multipliedBy(e18).toFixed();
}
const initialMinted = new BN(totalSupply).multipliedBy(91).dividedBy(100).toString();
const devFundTotal = new BN(totalSupply).multipliedBy(9).dividedBy(100);
const devFundEachMonth = devFundTotal.dividedBy(6).toFixed();

contract('Liquidity Generation tests', ([alice, john, minter, dev, burner, clean, clean2, clean3, clean4, clean5, superAdmin]) => {
    before(async () => {
        this.lgeApprover = lgeApprover.lgeApprover;
    });
    beforeEach(async () => {
        if (testconfig.network != "local") {
            await testconfig.readUniswap(this);
        } else {
            this.factory = await UniswapV2Factory.new(alice, { from: alice });
            this.weth = await WETH9.new({ from: john });
            this.router = await UniswapV2Router02.new(this.factory.address, this.weth.address, { from: alice });
        }
        this.nerd = await NerdToken.new(this.router.address, this.factory.address, dev, 0, this.lgeApprover, { from: alice });

        this.feeapprover = await FeeApprover.new({ from: alice });
        await this.feeapprover.initialize(this.nerd.address);
        await this.feeapprover.setPaused(false, { from: alice });

        await this.nerd.setShouldTransferChecker(this.feeapprover.address, { from: alice });
        this.nerdvault = await NerdVault.new({ from: alice });
        await this.nerdvault.initialize(this.nerd.address, superAdmin, { from: alice });
        await this.feeapprover.setNerdVaultAddress(this.nerdvault.address, { from: alice });
    });

    it("Should have a correct balance starting", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
    });

    it("Should not let anyone contribute after timer ", async () => {
        await time.increase(60 * 60 * 24 * 7 + 1);
        await expectRevert(this.nerd.addLiquidity(true, "0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000", 0, { from: clean }), "Liquidity Generation Event over");
    })
    it("Should not let anyone contribute without agreement timer", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        await expectRevert(this.nerd.addLiquidity(null, "0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000", 0, { from: clean }), "No agreement provided");
    });

    it("Should handle deposits of nothing", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        let approveSig = lgeApprover.signApprover(clean);
        await this.nerd.addLiquidity(true, approveSig.r, approveSig.s, approveSig.v, { from: clean });
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        assert.equal((await this.nerd.ethContributed(clean)).valueOf().toString(), "0");

    });

    it("Should update peoples balances", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        let approveSig = lgeApprover.signApprover(clean);
        await this.nerd.addLiquidity(true, approveSig.r, approveSig.s, approveSig.v, { from: clean, value: 99 });
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "99");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        assert.equal((await this.nerd.ethContributed(clean)).valueOf().toString(), '99');
        await this.nerd.addLiquidity(true, "0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000", 0, { from: clean, value: 101 });
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "200");
        assert.equal((await this.nerd.ethContributed(clean)).valueOf().toString(), '200');
        let approveSig2 = lgeApprover.signApprover(clean2);
        await this.nerd.addLiquidity(true, approveSig2.r, approveSig2.s, approveSig2.v, { from: clean2, value: 100 });
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "300");
        assert.equal((await this.nerd.ethContributed(clean)).valueOf().toString(), '200');
        assert.equal((await this.nerd.ethContributed(clean2)).valueOf().toString(), '100');
    });


    it("Should create the pair liquidity generation", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        let approveSig = lgeApprover.signApprover(clean);
        await this.nerd.addLiquidity(true, approveSig.r, approveSig.s, approveSig.v, { from: clean, value: 100 });
        assert.equal((await this.nerd.ethContributed(clean)).valueOf().toString(), '100');
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "100");
        await time.increase(60 * 60 * 24 * 7 + 1);
        this.nerdWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.nerd.address));
        await this.nerd.addLiquidityToUniswapNERDxWETHPair();
    });

    it("Should not allow to contribute exceed hard cap", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        let approveSig = lgeApprover.signApprover(clean);
        await this.nerd.addLiquidity(true, approveSig.r, approveSig.s, approveSig.v, { from: clean, value: toWei('100') });
        await this.nerd.addLiquidityWithoutSignature(true, { from: clean, value: toWei('1100') });

        let totalETHContributed = (await this.nerd.totalETHContributed()).valueOf().toString();

        let approveSigAlice = lgeApprover.signApprover(alice);
        await expectRevert(this.nerd.addLiquidityWithoutSignature(true, { from: clean, value: 1 }), "Liquidity generation even hard cap already reached");
        await expectRevert(this.nerd.addLiquidity(true, approveSigAlice.r, approveSigAlice.s, approveSigAlice.v, { from: alice, value: 1 }), "Liquidity generation even hard cap already reached");
    });

    it("Should create the pair liquidity with hard cap of eth", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        let approveSig = lgeApprover.signApprover(clean);
        await this.nerd.addLiquidity(true, approveSig.r, approveSig.s, approveSig.v, { from: clean, value: toWei('100') });
        let approveSigAlice = lgeApprover.signApprover(alice);
        await this.nerd.addLiquidity(true, approveSigAlice.r, approveSigAlice.s, approveSigAlice.v, { from: alice, value: toWei('1100') });

        assert.equal(new BN((await this.nerd.ethContributed(clean)).valueOf().toString()).toFixed(), toWei('100'));
        assert.equal(new BN((await this.nerd.ethContributed(alice)).valueOf().toString()).toFixed(), toWei('700')); //hardcap = 800 eth
        await time.increase(60 * 60 * 24 * 7 + 1);
        this.nerdWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.nerd.address));
        await this.nerd.addLiquidityToUniswapNERDxWETHPair();
        assert.notEqual((await this.nerdWETHPair.balanceOf(this.nerd.address)).valueOf().toString(), "0")
        assert.equal((await this.nerdWETHPair.balanceOf(this.nerd.address)).valueOf().toString(), (await this.nerd.totalLPTokensMinted()).valueOf().toString())
    });

    it("Should handle emergency withdrawal correctly", async () => {
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        let approveSig3 = lgeApprover.signApprover(clean3);
        await this.nerd.addLiquidity(true, approveSig3.r, approveSig3.s, approveSig3.v, { from: clean3, value: toWei('5') });
        let approveSig4 = lgeApprover.signApprover(clean4);
        await this.nerd.addLiquidity(true, approveSig4.r, approveSig4.s, approveSig4.v, { from: clean4, value: toWei('5') });
        await time.increase(60 * 60 * 24 * 7 + 1); // 7 days
        await expectRevert(this.nerd.emergencyDrain24hAfterLiquidityGenerationEventIsDone({ from: alice }), "Liquidity generation grace period still ongoing");
        await time.increase(60 * 60 * 24 * 1); // 8 days
        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), toWei('10'));
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));

        const aliceBalancePerviously = (await web3.eth.getBalance(alice)).valueOf().toString()  /// more or less cause gas costs
        await this.nerd.emergencyDrain24hAfterLiquidityGenerationEventIsDone({ from: alice });

        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(true, new BN((await web3.eth.getBalance(alice)).valueOf().toString()).comparedTo(new BN(aliceBalancePerviously)) > 0);

        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), '0');
    });

    it("Super admin works as expected", async () => {
        await expectRevert(this.nerdvault.setStrategyContractOrDistributionContractAllowance(this.nerd.address, '1', this.nerd.address, { from: alice }), "Super admin : caller is not super admin.")
        await expectRevert(this.nerdvault.setStrategyContractOrDistributionContractAllowance(this.nerd.address, '1', this.nerd.address, { from: superAdmin }), "Governance setup grace period not over")
    })

    it("Dev fund should be vested for 6 months/180 days", async () => {
        let pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');

        assert.equal((await web3.eth.getBalance(this.nerd.address)).valueOf().toString(), "0");
        assert.equal(new BN(await this.nerd.balanceOf(this.nerd.address)).valueOf().toString(), new BN(initialMinted));
        let approveSig = lgeApprover.signApprover(clean);
        await this.nerd.addLiquidity(true, approveSig.r, approveSig.s, approveSig.v, { from: clean, value: toWei('1000') });
        await time.increase(60 * 60 * 24 * 7 + 1);

        this.nerdWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.nerd.address));
        await this.nerd.addLiquidityToUniswapNERDxWETHPair();

        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), devFundEachMonth);

        //month 1
        let balBefore = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        await this.nerd.unlockDevFund();
        let balAfter = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        assert.equal(balAfter.minus(balBefore).toFixed(), devFundEachMonth);
        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');

        //time travel 1 month
        await time.increase(60 * 60 * 24 * 30 + 1);

        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), devFundEachMonth);
        balBefore = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        await this.nerd.unlockDevFund();
        balAfter = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        assert.equal(balAfter.minus(balBefore).toFixed(), devFundEachMonth);
        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');

        //time travel 1 month
        await time.increase(60 * 60 * 24 * 30 + 1);

        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), devFundEachMonth);
        balBefore = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        await this.nerd.unlockDevFund();
        balAfter = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        assert.equal(balAfter.minus(balBefore).toFixed(), devFundEachMonth);
        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');

        //time travel 1 month
        await time.increase(60 * 60 * 24 * 30 + 1);

        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), devFundEachMonth);
        balBefore = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        await this.nerd.unlockDevFund();
        balAfter = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        assert.equal(balAfter.minus(balBefore).toFixed(), devFundEachMonth);
        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');

        //time travel 1 month
        await time.increase(60 * 60 * 24 * 30 + 1);

        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), devFundEachMonth);
        balBefore = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        await this.nerd.unlockDevFund();
        balAfter = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        assert.equal(balAfter.minus(balBefore).toFixed(), devFundEachMonth);
        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');

        //time travel 1 month
        await time.increase(60 * 60 * 24 * 30 + 1);

        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), devFundEachMonth);
        balBefore = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        await this.nerd.unlockDevFund();
        balAfter = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        assert.equal(balAfter.minus(balBefore).toFixed(), devFundEachMonth);
        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');

        //time travel 1 month
        await time.increase(60 * 60 * 24 * 30 + 1);

        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');
        balBefore = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        await this.nerd.unlockDevFund();
        balAfter = new BN((await this.nerd.balanceOf(dev)).valueOf().toString());
        assert.equal(balAfter.minus(balBefore).toFixed(), '0');
        pendingDevFund = new BN((await this.nerd.pendingReleasableDevFund()).valueOf().toString());
        assert.equal(pendingDevFund.toFixed(), '0');
        let supply = (await this.nerd.totalSupply()).valueOf().toString();
        assert.equal(totalSupply, supply);
    })

})