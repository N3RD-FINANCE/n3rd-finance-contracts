require('dotenv').config();
const FarmETHRouter = require("./build/contracts/FarmETHRouter.json");
const getConfig = require("./getConfig");
const Web3 = require("web3");

let nerdAddress = process.argv[2];
console.log('nerd:', nerdAddress)

const provider = getConfig.getProvider();

const web3 = new Web3(provider);

const deploy = async () => {
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    console.log("Attempting to deploy from account: ", accounts[0]);

    const farmETHRouterContract = await new web3.eth.Contract(FarmETHRouter.abi)
        .deploy({ data: FarmETHRouter.bytecode })
        .send({ gas: "6000000", from: mainAccount });

    //This will display the address to which your contract was deployed
    console.log("Contract farmETHRouterContract deployed to: ", farmETHRouterContract.options.address);
    await farmETHRouterContract.methods.initialize(nerdAddress).send({ from: mainAccount });
};
deploy();