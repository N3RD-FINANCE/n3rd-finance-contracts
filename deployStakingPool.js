require('dotenv').config();
const Nerd = require("./build/contracts/Nerd.json");
const FeeApprover = require("./build/contracts/FeeApprover.json");
const StakingPool = require("./build/contracts/StakingPool.json");
const FeeProxy = require('./build/contracts/FeeDistributorProxy.json');
const UniswapFactory = require('./build/contracts/UniswapV2Factory.json');
const NerdVault = require('./build/contracts/NerdVault.json');
const FarmETHRouter = require("./build/contracts/FarmETHRouter.json");
const getConfig = require("./getConfig");
const Web3 = require("web3");

let nerdAddress = process.argv[2];
console.log('nerd:', nerdAddress)

const provider = getConfig.getProvider();

const web3 = new Web3(provider);

const gasPrice = '45000000000';

const deploy = async () => {
    console.log()
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    console.log("Attempting to deploy from account: ", accounts[0]);

    const farmETHRouterContract = await new web3.eth.Contract(FarmETHRouter.abi)
        .deploy({ data: FarmETHRouter.bytecode })
        .send({ gas: "6000000", from: mainAccount, gasPrice: gasPrice });

    //This will display the address to which your contract was deployed
    console.log("Contract farmETHRouterContract deployed to: ", farmETHRouterContract.options.address);
    await farmETHRouterContract.methods.initialize().send({ from: mainAccount, gasPrice: gasPrice });

    let daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
    const factory = await new web3.eth.Contract(UniswapFactory.abi, "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");
    const nerd = await new web3.eth.Contract(Nerd.abi, "0x32C868F6318D6334B2250F323D914Bc2239E4EeE");
    const nerdvault = await new web3.eth.Contract(NerdVault.abi, "0x47cE2237d7235Ff865E1C74bF3C6d9AF88d1bbfF");

    await factory.methods.createPair(daiAddress, nerd.options.address).send({ from: mainAccount, gasPrice: gasPrice });
    let pairAddress = await factory.methods.getPair(daiAddress, nerd.options.address).call();
    console.log('pairAddress:', pairAddress)
    await nerdvault.methods.add(1000, pairAddress, true).send({ from: mainAccount, gasPrice: gasPrice });

    const feeApprover = await new web3.eth.Contract(FeeApprover.abi, "0x959110287cf3bbf40ad53708e9971715a554ec43");

    await feeApprover.methods.setPaused(true).send({ from: mainAccount, gasPrice: gasPrice });

    const stakingPool = await new web3.eth.Contract(StakingPool.abi)
        .deploy({ data: StakingPool.bytecode })
        .send({ from: mainAccount, gasPrice: gasPrice });
    console.log("Contract stakingPool deployed to: ", stakingPool.options.address);

    const feeProxy = await new web3.eth.Contract(FeeProxy.abi)
        .deploy({ data: FeeProxy.bytecode })
        .send({ from: mainAccount, gasPrice: gasPrice });
    console.log("Contract feeProxy deployed to: ", feeProxy.options.address);
    console.log('fee approver:', (await nerd.methods.transferCheckerAddress().call()))
    //configure stakingpool and feeProxy
    await feeApprover.methods.editNoFeeList(stakingPool.options.address, true).send({ from: mainAccount, gasPrice: gasPrice });
    await feeApprover.methods.editNoFeeList(feeProxy.options.address, true).send({ from: mainAccount, gasPrice: gasPrice });

    await stakingPool.methods.initialize().send({ from: mainAccount, gasPrice: gasPrice });
    console.log('initialize staking pool: ', (await feeProxy.methods.owner().call()))

    await feeProxy.methods.initialize(stakingPool.options.address).send({ from: mainAccount, gasPrice: gasPrice });
    console.log('initialize fee proxy')

    await feeApprover.methods.setFeeMultiplier(30).send({ from: mainAccount, gasPrice: gasPrice });
    await nerd.methods.setFeeDistributor(feeProxy.options.address).send({ from: mainAccount, gasPrice: gasPrice });
    await feeApprover.methods.setPaused(false).send({ from: mainAccount, gasPrice: gasPrice });
    //This will display the address to which your contract was deployed
    console.log("Finish");
};
deploy();