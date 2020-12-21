require('dotenv').config();
const Nerd = require("./build/contracts/Nerd.json");
const NerdVault = require("./build/contracts/NerdVault.json");
const FeeApprover = require("./build/contracts/FeeApprover.json");
const Router = require("./build/contracts/UniswapV2Router02.json");
const Factory = require("./build/contracts/UniswapV2Factory.json");
const WETH = require("./build/contracts/WETH9.json");
const FarmETHRouter = require("./build/contracts/FarmETHRouter.json");
const Web3 = require('web3');
const getConfig = require('./getConfig');

const provider = getConfig.getProvider();
console.log('provider:', provider)

const web3 = new Web3(provider);

const deploy = async () => {
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    console.log("Attempting to deploy from account: ", accounts[0]);
    console.log("Balance: ", (await web3.eth.getBalance(accounts[0])));

    if (getConfig.isDevNet()) {
        let factoryContract = await new web3.eth.Contract(Factory.abi)
            .deploy({ data: Factory.bytecode, arguments: [mainAccount] })
            .send({ gas: "8000000", from: mainAccount });
        this.factory = factoryContract.options.address;

        let wEthContract = await new web3.eth.Contract(WETH.abi)
            .deploy({ data: WETH.bytecode, arguments: [mainAccount] })
            .send({ gas: "8000000", from: mainAccount });

        let routerContract = await new web3.eth.Contract(Router.abi)
            .deploy({ data: Router.bytecode, arguments: [this.factory, wEthContract.options.address] })
            .send({ gas: "8000000", from: mainAccount });
        this.router = routerContract.options.address;
    } else {
        this.router = "0x0000000000000000000000000000000000000000";
        this.factory = "0x0000000000000000000000000000000000000000";
    }

    const nerdContract = await new web3.eth.Contract(Nerd.abi)
        .deploy({ data: Nerd.bytecode, arguments: [this.router, this.factory, getConfig.getDevAddress(), getConfig.getLGEPeriod(), getConfig.getApproverAddress()] })
        .send({ gas: "8000000", from: mainAccount, gasPrice: '77000000000' });

    //This will display the address to which your contract was deployed
    console.log("Contract Nerd deployed to: ", nerdContract.options.address);

    //add liquidity
    //await nerdContract.methods.addLiquidity(true).send({from: mainAccount, gas: "7000000", value: '500000000000000000'});
    //console.log("added liquidity");

    const feeApproverContract = await new web3.eth.Contract(FeeApprover.abi)
        .deploy({ data: FeeApprover.bytecode })
        .send({ gas: "8000000", from: mainAccount, gasPrice: '77000000000' });

    console.log("Contract FeeApprover deployed to: ", feeApproverContract.options.address);

    await feeApproverContract.methods.initialize(nerdContract.options.address).send({ gas: "7000000", from: mainAccount, gasPrice: '77000000000' });
    console.log("initialize fee approver");
    await feeApproverContract.methods.setPaused(false).send({ gas: "7000000", from: mainAccount, gasPrice: '77000000000' });
    console.log("set paused fee approver");
    await nerdContract.methods.setShouldTransferChecker(feeApproverContract.options.address).send({ gas: "7000000", from: mainAccount, gasPrice: '77000000000' });
    console.log("set transfer checker");

    const nerdVaultContract = await new web3.eth.Contract(NerdVault.abi)
        .deploy({ data: NerdVault.bytecode })
        .send({ gas: "7000000", from: mainAccount, gasPrice: '77000000000' });
    console.log("Contract NerdVault deployed to: ", nerdVaultContract.options.address);
    await nerdVaultContract.methods.initialize(nerdContract.options.address, getConfig.getDevAddress()).send({ gas: "7000000", from: mainAccount, gasPrice: '77000000000' });
    console.log("initialize nerd vault");
    await feeApproverContract.methods.setNerdVaultAddress(nerdVaultContract.options.address).send({ gas: "7000000", from: mainAccount, gasPrice: '77000000000' });
    console.log("set nerd vault address");

    await nerdContract.methods.setFeeDistributor(nerdVaultContract.options.address).send({ gas: "7000000", from: mainAccount, gasPrice: '77000000000' });
    console.log('lp token:', await nerdContract.methods.getTokenUniswapPair().call());
    //deploy router
    const farmETHRouterContract = await new web3.eth.Contract(FarmETHRouter.abi)
        .deploy({ data: FarmETHRouter.bytecode })
        .send({ gas: "8000000", from: mainAccount, gasPrice: '77000000000' });

    //This will display the address to which your contract was deployed
    console.log("Contract farmETHRouterContract deployed to: ", farmETHRouterContract.options.address);
    await farmETHRouterContract.methods.initialize(nerdContract.options.address).send({ from: mainAccount, gasPrice: '77000000000' });
    console.log("Finish every thing");
};
deploy();